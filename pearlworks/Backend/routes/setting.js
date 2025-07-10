const express = require("express")
const { body, validationResult } = require("express-validator")
const db = require("../config/database")
const { authenticateToken, authorizeRoles } = require("../middleware/auth")

const router = express.Router()

// Get assigned work orders for setting
router.get("/assigned-orders", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const userRole = req.user.role

    let query = `
      SELECT 
        wo.id,
        wo.work_order_number,
        wo.party_name,
        wo.item_details as product_type,
        wo.model_number,
        wo.description_of_work,
        wo.expected_completion_date,
        wo.created_at,
        wo.gross_weight,
        wo.net_weight,
        wos.issue_weight,
        wos.jamah_weight,
        wos.status,
        wos.notes,
        wos.issue_date,
        wos.jamah_date,
        wos.sorting_issue,
        wos.sorting_jamah,
        wos.approved,
        wos.weight_difference,
        wa.assigned_date,
        u.name as assigned_worker_name,
        u.email as assigned_worker_email,
        COUNT(DISTINCT CASE WHEN s.is_received = 1 THEN s.id END) as total_received_stones,
        COUNT(DISTINCT rs.id) as returned_stones_count
      FROM work_orders wo
      JOIN worker_assignments wa ON wo.id = wa.work_order_id
      LEFT JOIN work_order_stages wos ON wo.id = wos.work_order_id AND wos.stage_name = 'setting'
      LEFT JOIN users u ON wa.user_id = u.id
      LEFT JOIN stones s ON wo.id = s.work_order_id
      LEFT JOIN returned_stones rs ON wo.id = rs.work_order_id AND rs.stage_name = 'setting'
      WHERE wa.stage_type = 'setting'
    `

    const params = []

    if (userRole === "setting") {
      query += " AND wa.user_id = ?"
      params.push(userId)
    }

    query += " GROUP BY wo.id, wos.id, wa.assigned_date, u.name, u.email ORDER BY wo.created_at DESC"

    const [orders] = await db.execute(query, params)

    const transformedOrders = await Promise.all(
      orders.map(async (order) => {
        // Get received stones for this work order (including original received stones)
        const [stones] = await db.execute(
          "SELECT * FROM stones WHERE work_order_id = ? AND is_received = 1 ORDER BY id",
          [order.id],
        )

        // Get returned stones for setting stage
        const [returnedStones] = await db.execute(
          "SELECT * FROM returned_stones WHERE work_order_id = ? AND stage_name = 'setting' ORDER BY id",
          [order.id],
        )

        return {
          id: order.id.toString(),
          workOrderNumber: order.work_order_number,
          partyName: order.party_name,
          productType: order.product_type,
          modelNumber: order.model_number,
          descriptionOfWork: order.description_of_work,
          issueWeight: order.issue_weight,
          jamahWeight: order.jamah_weight,
          assignedDate: order.assigned_date,
          status: order.status || "not-started",
          currentStage: "setting",
          notes: order.notes,
          expectedCompletionDate: order.expected_completion_date,
          issueDate: order.issue_date,
          jamahDate: order.jamah_date,
          sortingIssue: order.sorting_issue,
          sortingJamah: order.sorting_jamah,
          approved: order.approved || false,
          weightDifference: order.weight_difference,
          grossWeight: order.gross_weight,
          netWeight: order.net_weight,
          assignedWorkerName: order.assigned_worker_name,
          assignedWorkerEmail: order.assigned_worker_email,
          stones: stones,
          returnedStones: returnedStones,
          totalReceivedStones: order.total_received_stones,
          returnedStonesCount: order.returned_stones_count,
        }
      }),
    )

    res.json({
      success: true,
      data: transformedOrders,
    })
  } catch (error) {
    console.error("Get setting orders error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch assigned orders",
    })
  }
})

// Get stones for a specific work order - FIXED to include received stones
router.get("/stones/:workOrderId", authenticateToken, async (req, res) => {
  try {
    const { workOrderId } = req.params

    // Get all received stones (original + stage added)
    const [receivedStones] = await db.execute(
      `SELECT * FROM stones 
       WHERE work_order_id = ? AND is_received = 1 
       ORDER BY stage_added, type`,
      [workOrderId],
    )

    // Get returned stones for setting stage
    const [returnedStones] = await db.execute(
      `SELECT * FROM returned_stones 
       WHERE work_order_id = ? AND stage_name = 'setting' 
       ORDER BY type`,
      [workOrderId],
    )

    res.json({
      success: true,
      data: {
        receivedStones: receivedStones.map((stone) => ({
          id: stone.id,
          type: stone.type,
          pieces: stone.pieces,
          weightGrams: stone.weight_grams,
          weightCarats: stone.weight_carats,
          stageAdded: stone.stage_added || "original",
          isReceived: stone.is_received === 1,
        })),
        returnedStones: returnedStones.map((stone) => ({
          id: stone.id,
          type: stone.type,
          pieces: stone.pieces,
          weightGrams: stone.weight_grams,
          weightCarats: stone.weight_carats,
          returnedBy: stone.returned_by,
        })),
      },
    })
  } catch (error) {
    console.error("Get stones error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch stones data",
    })
  }
})

// Update setting stage status with comprehensive stone management
router.put(
  "/update-status/:workOrderId",
  [
    authenticateToken,
    body("status").isIn(["not-started", "in-progress", "completed", "on-hold"]),
    body("jamahWeight").optional().isNumeric(),
    body("sortingIssue").optional().isNumeric(),
    body("sortingJamah").optional().isNumeric(),
    body("weightDifference").optional().isNumeric(),
  ],
  async (req, res) => {
    const connection = await db.getConnection()

    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        })
      }

      await connection.beginTransaction()

      const workOrderId = req.params.workOrderId
      const {
        status,
        jamahWeight,
        notes,
        sortingIssue,
        sortingJamah,
        approved,
        weightDifference,
        issueDate,
        jamahDate,
        receivedStones,
        returnedStones,
      } = req.body

      // Get work order details
      const [workOrder] = await connection.execute(
        "SELECT work_order_number, gross_weight FROM work_orders WHERE id = ?",
        [workOrderId],
      )

      if (workOrder.length === 0) {
        await connection.rollback()
        return res.status(404).json({
          success: false,
          message: "Work order not found",
        })
      }

      // Update or create setting stage
      const [existingStage] = await connection.execute(
        "SELECT id, issue_weight FROM work_order_stages WHERE work_order_id = ? AND stage_name = 'setting'",
        [workOrderId],
      )

      const currentDate = new Date()

      if (existingStage.length > 0) {
        let updateQuery = `UPDATE work_order_stages SET 
          status = ?, notes = ?, updated_at = ?, sorting_issue = ?, sorting_jamah = ?, 
          approved = ?, weight_difference = ?`
        const updateParams = [
          status,
          notes || null,
          currentDate,
          sortingIssue || null,
          sortingJamah || null,
          approved || false,
          weightDifference || null,
        ]

        if (status === "in-progress" && !existingStage[0].issue_date) {
          updateQuery += ", issue_date = ?, issue_weight = ?"
          updateParams.push(issueDate ? new Date(issueDate) : currentDate, workOrder[0].gross_weight || 0)
        }

        if (status === "completed" && jamahWeight) {
          updateQuery += ", jamah_date = ?, jamah_weight = ?"
          updateParams.push(jamahDate ? new Date(jamahDate) : currentDate, jamahWeight)
        }

        updateQuery += " WHERE id = ?"
        updateParams.push(existingStage[0].id)

        await connection.execute(updateQuery, updateParams)
      } else {
        const issueWeight = workOrder[0].gross_weight || 0
        await connection.execute(
          `INSERT INTO work_order_stages (
            work_order_id, stage_name, karigar_name, status, issue_date, 
            issue_weight, jamah_date, jamah_weight, sorting_issue, sorting_jamah, 
            weight_difference, approved, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            workOrderId,
            "setting",
            req.user.name,
            status,
            status === "in-progress" ? (issueDate ? new Date(issueDate) : currentDate) : null,
            status === "in-progress" ? issueWeight : null,
            status === "completed" ? (jamahDate ? new Date(jamahDate) : currentDate) : null,
            status === "completed" && jamahWeight ? jamahWeight : null,
            sortingIssue || null,
            sortingJamah || null,
            weightDifference || null,
            approved || false,
            notes || null,
          ],
        )
      }

      // Update received stones if provided (additional stones added during setting)
      if (receivedStones && Array.isArray(receivedStones)) {
        // Delete existing setting stage stones
        await connection.execute("DELETE FROM stones WHERE work_order_id = ? AND stage_added = 'setting'", [
          workOrderId,
        ])

        // Insert new received stones for setting stage
        for (const stone of receivedStones) {
          if (stone.type && stone.pieces >= 0) {
            await connection.execute(
              `INSERT INTO stones (work_order_id, type, pieces, weight_grams, weight_carats, is_received, stage_added)
               VALUES (?, ?, ?, ?, ?, 1, 'setting')`,
              [workOrderId, stone.type, stone.pieces, stone.weightGrams, stone.weightCarats],
            )
          }
        }
      }

      // Update returned stones if provided
      if (returnedStones && Array.isArray(returnedStones)) {
        await connection.execute("DELETE FROM returned_stones WHERE work_order_id = ? AND stage_name = 'setting'", [
          workOrderId,
        ])

        for (const stone of returnedStones) {
          if (stone.type && stone.pieces >= 0) {
            await connection.execute(
              `INSERT INTO returned_stones (work_order_id, stage_name, type, pieces, weight_grams, weight_carats, returned_by)
               VALUES (?, 'setting', ?, ?, ?, ?, ?)`,
              [workOrderId, stone.type, stone.pieces, stone.weightGrams, stone.weightCarats, req.user.name],
            )
          }
        }
      }

      await connection.execute(
        `INSERT INTO activity_logs (work_order_id, work_order_number, action, performed_by, performed_by_role, details)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          workOrderId,
          workOrder[0].work_order_number,
          `Setting stage ${status}`,
          req.user.name,
          req.user.role,
          `Setting stage updated to ${status}${jamahWeight ? ` with jamah weight ${jamahWeight}g` : ""}${weightDifference ? `, weight difference: ${weightDifference}g` : ""}`,
        ],
      )

      await connection.commit()

      res.json({
        success: true,
        message: "Setting stage updated successfully",
      })
    } catch (error) {
      await connection.rollback()
      console.error("Update setting stage error:", error)
      res.status(500).json({
        success: false,
        message: "Failed to update setting stage",
      })
    } finally {
      connection.release()
    }
  },
)

// Get setting stage details for a specific work order
router.get(
  "/details/:workOrderId",
  authenticateToken,
  authorizeRoles("setting", "admin", "manager"),
  async (req, res) => {
    try {
      const workOrderId = req.params.workOrderId

      const [stageDetails] = await db.execute(
        `
        SELECT 
          wos.*,
          wo.work_order_number,
          wo.party_name,
          wo.item_details,
          wo.model_number,
          wo.expected_completion_date
        FROM work_order_stages wos
        JOIN work_orders wo ON wos.work_order_id = wo.id
        WHERE wos.work_order_id = ? AND wos.stage_name = 'setting'
      `,
        [workOrderId],
      )

      if (stageDetails.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Setting stage not found",
        })
      }

      // Get all received stones (original + setting added)
      const [stones] = await db.execute("SELECT * FROM stones WHERE work_order_id = ? AND is_received = 1", [
        workOrderId,
      ])

      const [returnedStones] = await db.execute(
        "SELECT * FROM returned_stones WHERE work_order_id = ? AND stage_name = 'setting'",
        [workOrderId],
      )

      const result = {
        ...stageDetails[0],
        stones,
        returnedStones,
      }

      res.json({
        success: true,
        data: result,
      })
    } catch (error) {
      console.error("Get setting details error:", error)
      res.status(500).json({
        success: false,
        message: "Failed to fetch setting details",
      })
    }
  },
)

// Get setting statistics for dashboard
router.get("/statistics", authenticateToken, authorizeRoles("setting", "admin", "manager"), async (req, res) => {
  try {
    const userId = req.user.id
    const userRole = req.user.role

    let whereClause = "WHERE wa.stage_type = 'setting'"
    const params = []

    if (userRole === "setting") {
      whereClause += " AND wa.user_id = ?"
      params.push(userId)
    }

    const [stats] = await db.execute(
      `
      SELECT 
        COUNT(*) as total_orders,
        SUM(CASE WHEN wos.status = 'not-started' OR wos.status IS NULL THEN 1 ELSE 0 END) as pending_orders,
        SUM(CASE WHEN wos.status = 'in-progress' THEN 1 ELSE 0 END) as in_progress_orders,
        SUM(CASE WHEN wos.status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
        SUM(CASE WHEN wos.status = 'on-hold' THEN 1 ELSE 0 END) as on_hold_orders,
        AVG(CASE WHEN wos.weight_difference IS NOT NULL THEN wos.weight_difference ELSE 0 END) as avg_weight_difference,
        SUM(CASE WHEN wos.approved = 1 THEN 1 ELSE 0 END) as approved_orders
      FROM work_orders wo
      JOIN worker_assignments wa ON wo.id = wa.work_order_id
      LEFT JOIN work_order_stages wos ON wo.id = wos.work_order_id AND wos.stage_name = 'setting'
      ${whereClause}
    `,
      params,
    )

    res.json({
      success: true,
      data: stats[0],
    })
  } catch (error) {
    console.error("Get setting statistics error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch statistics",
    })
  }
})

module.exports = router
