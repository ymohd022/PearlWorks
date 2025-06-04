const express = require("express")
const { body, validationResult } = require("express-validator")
const db = require("../config/database")
const { authenticateToken, authorizeRoles } = require("../middleware/auth")

const router = express.Router()

// Get assigned work orders for framing
router.get("/assigned-orders", authenticateToken, authorizeRoles("framing", "admin", "manager"), async (req, res) => {
  try {
    const userId = req.user.id
    const userRole = req.user.role

    let query = `
      SELECT 
        wo.id,
        wo.work_order_number,
        wo.party_name,
        wo.item_details as product_type,
        wo.expected_completion_date,
        wo.created_at,
        wos.issue_weight,
        wos.jamah_weight,
        wos.status,
        wos.notes,
        wos.issue_date,
        wos.jamah_date,
        wos.sorting_issue,
        wos.sorting_jamah,
        wos.approved,
        wa.assigned_date
      FROM work_orders wo
      JOIN worker_assignments wa ON wo.id = wa.work_order_id
      LEFT JOIN work_order_stages wos ON wo.id = wos.work_order_id AND wos.stage_name = 'framing'
      WHERE wa.stage_type = 'framing'
    `

    const params = []

    // If user is framing worker, only show their assigned orders
    if (userRole === "framing") {
      query += " AND wa.user_id = ?"
      params.push(userId)
    }

    query += " ORDER BY wo.created_at DESC"

    const [orders] = await db.execute(query, params)

    // Transform data to match frontend interface
    const transformedOrders = orders.map((order) => ({
      id: order.id.toString(),
      workOrderNumber: order.work_order_number,
      partyName: order.party_name,
      productType: order.product_type,
      issueWeight: order.issue_weight,
      jamahWeight: order.jamah_weight,
      assignedDate: order.assigned_date,
      status: order.status || "not-started",
      currentStage: "framing",
      notes: order.notes,
      expectedCompletionDate: order.expected_completion_date,
      issueDate: order.issue_date,
      jamahDate: order.jamah_date,
      sortingIssue: order.sorting_issue,
      sortingJamah: order.sorting_jamah,
      approved: order.approved || false,
    }))

    res.json({
      success: true,
      data: transformedOrders,
    })
  } catch (error) {
    console.error("Get framing orders error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch assigned orders",
    })
  }
})

// Update framing stage status
router.put(
  "/update-status/:workOrderId",
  [
    authenticateToken,
    authorizeRoles("framing", "admin", "manager"),
    body("status").isIn(["not-started", "in-progress", "completed", "on-hold"]),
    body("jamahWeight").optional().isFloat({ min: 0.01 }),
    body("sortingIssue").optional().isInt({ min: 0 }),
    body("sortingJamah").optional().isInt({ min: 0 }),
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
      const { status, jamahWeight, notes, sortingIssue, sortingJamah, approved } = req.body

      // Get work order details
      const [workOrder] = await connection.execute("SELECT work_order_number FROM work_orders WHERE id = ?", [
        workOrderId,
      ])

      if (workOrder.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Work order not found",
        })
      }

      // Check if framing stage exists
      const [existingStage] = await connection.execute(
        "SELECT id, issue_weight FROM work_order_stages WHERE work_order_id = ? AND stage_name = 'framing'",
        [workOrderId],
      )

      const currentDate = new Date()
      const stageData = {
        status,
        notes: notes || null,
        updated_at: currentDate,
      }

      // Add completion-specific data
      if (status === "completed") {
        stageData.jamah_date = currentDate
        stageData.jamah_weight = jamahWeight
        stageData.sorting_jamah = sortingJamah || null
        stageData.approved = approved || false

        // Calculate weight difference if both weights are available
        if (existingStage.length > 0 && existingStage[0].issue_weight && jamahWeight) {
          stageData.weight_difference = jamahWeight - existingStage[0].issue_weight
        }
      }

      // Add in-progress specific data
      if (status === "in-progress" && existingStage.length === 0) {
        // Get issue weight from work order or set default
        const [woDetails] = await connection.execute("SELECT gross_weight FROM work_orders WHERE id = ?", [workOrderId])
        stageData.issue_date = currentDate
        stageData.issue_weight = woDetails[0]?.gross_weight || 0
        stageData.sorting_issue = sortingIssue || null
        stageData.karigar_name = req.user.name
      }

      if (existingStage.length > 0) {
        // Update existing stage
        const updateFields = Object.keys(stageData)
          .map((key) => `${key} = ?`)
          .join(", ")
        const updateValues = Object.values(stageData)

        await connection.execute(`UPDATE work_order_stages SET ${updateFields} WHERE id = ?`, [
          ...updateValues,
          existingStage[0].id,
        ])
      } else {
        // Create new stage
        await connection.execute(
          `
          INSERT INTO work_order_stages (
            work_order_id, stage_name, karigar_name, status, issue_date, 
            issue_weight, jamah_date, jamah_weight, sorting_issue, sorting_jamah, 
            weight_difference, approved, notes
          ) VALUES (?, 'framing', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          [
            workOrderId,
            req.user.name,
            stageData.status,
            stageData.issue_date || null,
            stageData.issue_weight || null,
            stageData.jamah_date || null,
            stageData.jamah_weight || null,
            stageData.sorting_issue || null,
            stageData.sorting_jamah || null,
            stageData.weight_difference || null,
            stageData.approved || false,
            stageData.notes,
          ],
        )
      }

      // Update work order status if completed
      if (status === "completed") {
        await connection.execute("UPDATE work_orders SET status = 'in-progress' WHERE id = ?", [workOrderId])
      }

      // Add activity log
      await connection.execute(
        `
        INSERT INTO activity_logs (work_order_id, work_order_number, action, performed_by, performed_by_role, details)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
        [
          workOrderId,
          workOrder[0].work_order_number,
          `Framing stage ${status}`,
          req.user.name,
          req.user.role,
          `Framing stage updated to ${status}${jamahWeight ? ` with jamah weight ${jamahWeight}g` : ""}`,
        ],
      )

      await connection.commit()

      res.json({
        success: true,
        message: `Framing stage updated successfully`,
      })
    } catch (error) {
      await connection.rollback()
      console.error("Update framing status error:", error)
      res.status(500).json({
        success: false,
        message: "Failed to update framing status",
      })
    } finally {
      connection.release()
    }
  },
)

// Get framing stage details for a specific work order
router.get(
  "/details/:workOrderId",
  authenticateToken,
  authorizeRoles("framing", "admin", "manager"),
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
        wo.expected_completion_date
      FROM work_order_stages wos
      JOIN work_orders wo ON wos.work_order_id = wo.id
      WHERE wos.work_order_id = ? AND wos.stage_name = 'framing'
    `,
        [workOrderId],
      )

      if (stageDetails.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Framing stage not found",
        })
      }

      res.json({
        success: true,
        data: stageDetails[0],
      })
    } catch (error) {
      console.error("Get framing details error:", error)
      res.status(500).json({
        success: false,
        message: "Failed to fetch framing details",
      })
    }
  },
)

// Get framing statistics for dashboard
router.get("/statistics", authenticateToken, authorizeRoles("framing", "admin", "manager"), async (req, res) => {
  try {
    const userId = req.user.id
    const userRole = req.user.role

    let whereClause = "WHERE wa.stage_type = 'framing'"
    const params = []

    if (userRole === "framing") {
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
        AVG(CASE WHEN wos.weight_difference IS NOT NULL THEN wos.weight_difference ELSE 0 END) as avg_weight_difference
      FROM work_orders wo
      JOIN worker_assignments wa ON wo.id = wa.work_order_id
      LEFT JOIN work_order_stages wos ON wo.id = wos.work_order_id AND wos.stage_name = 'framing'
      ${whereClause}
    `,
      params,
    )

    res.json({
      success: true,
      data: stats[0],
    })
  } catch (error) {
    console.error("Get framing statistics error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch statistics",
    })
  }
})

module.exports = router
