const express = require("express")
const { body, validationResult } = require("express-validator")
const db = require("../config/database")
const { authenticateToken, authorizeRoles } = require("../middleware/auth")

const router = express.Router()

// Get assigned work orders for any stage
router.get("/assigned-orders/:stage", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const userRole = req.user.role
    const stage = req.params.stage

    let query = `
      SELECT 
        wo.id,
        wo.work_order_number,
        wo.party_name,
        wo.item_details as product_type,
        wo.expected_completion_date,
        wo.created_at,
        wo.gross_weight as issue_weight,
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
      LEFT JOIN work_order_stages wos ON wo.id = wos.work_order_id AND wos.stage_name = ?
      WHERE wa.stage_type = ?
    `

    const params = [stage, stage]

    // If user is a worker (not admin/manager), only show their assigned orders
    if (userRole !== "admin" && userRole !== "manager") {
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
      issueWeight: order.issue_weight || 0,
      jamahWeight: order.jamah_weight,
      assignedDate: order.assigned_date,
      status: order.status || "not-started",
      currentStage: stage,
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
    console.error("Get assigned orders error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch assigned orders",
    })
  }
})

// Update stage status
router.put(
  "/update-stage/:workOrderId",
  [
    authenticateToken,
    body("status").isIn(["not-started", "in-progress", "completed", "on-hold"]),
    body("jamahWeight").optional().isNumeric(),
    body("sortingIssue").optional().isNumeric(),
    body("sortingJamah").optional().isNumeric(),
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
      const { stage, status, jamahWeight, notes, sortingIssue, sortingJamah, approved } = req.body

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

      // Check if stage exists
      const [existingStage] = await connection.execute(
        "SELECT id, issue_weight FROM work_order_stages WHERE work_order_id = ? AND stage_name = ?",
        [workOrderId, stage],
      )

      const currentDate = new Date()

      if (existingStage.length > 0) {
        // Update existing stage
        let updateQuery = "UPDATE work_order_stages SET status = ?, notes = ?, updated_at = ?"
        const updateParams = [status, notes || null, currentDate]

        if (status === "completed" && jamahWeight) {
          updateQuery += ", jamah_date = ?, jamah_weight = ?, sorting_jamah = ?, approved = ?"
          updateParams.push(currentDate, jamahWeight, sortingJamah || null, approved || false)

          // Calculate weight difference
          if (existingStage[0].issue_weight) {
            updateQuery += ", weight_difference = ?"
            updateParams.push(jamahWeight - existingStage[0].issue_weight)
          }
        }

        updateQuery += " WHERE id = ?"
        updateParams.push(existingStage[0].id)

        await connection.execute(updateQuery, updateParams)
      } else {
        // Create new stage
        const issueWeight = workOrder[0].gross_weight || 0
        const insertParams = [
          workOrderId,
          stage,
          req.user.name,
          status,
          status === "in-progress" ? currentDate : null,
          status === "in-progress" ? issueWeight : null,
          status === "completed" ? currentDate : null,
          status === "completed" && jamahWeight ? jamahWeight : null,
          sortingIssue || null,
          status === "completed" ? sortingJamah || null : null,
          status === "completed" && jamahWeight && issueWeight ? jamahWeight - issueWeight : null,
          status === "completed" ? approved || false : false,
          notes || null,
        ]

        await connection.execute(
          `
          INSERT INTO work_order_stages (
            work_order_id, stage_name, karigar_name, status, issue_date, 
            issue_weight, jamah_date, jamah_weight, sorting_issue, sorting_jamah, 
            weight_difference, approved, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          insertParams,
        )
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
          `${stage} stage ${status}`,
          req.user.name,
          req.user.role,
          `${stage} stage updated to ${status}${jamahWeight ? ` with jamah weight ${jamahWeight}g` : ""}`,
        ],
      )

      await connection.commit()

      res.json({
        success: true,
        message: `${stage} stage updated successfully`,
      })
    } catch (error) {
      await connection.rollback()
      console.error("Update stage status error:", error)
      res.status(500).json({
        success: false,
        message: "Failed to update stage status",
      })
    } finally {
      connection.release()
    }
  },
)

// Get completed orders for dispatch
router.get("/completed-orders", authenticateToken, async (req, res) => {
  try {
    const [orders] = await db.execute(`
      SELECT 
        wo.id,
        wo.work_order_number,
        wo.party_name,
        wo.item_details as product_type,
        wo.expected_completion_date,
        wo.created_at,
        wo.gross_weight as issue_weight
      FROM work_orders wo
      WHERE wo.status = 'completed'
      ORDER BY wo.created_at DESC
    `)

    const transformedOrders = orders.map((order) => ({
      id: order.id.toString(),
      workOrderNumber: order.work_order_number,
      partyName: order.party_name,
      productType: order.product_type,
      issueWeight: order.issue_weight || 0,
      expectedCompletionDate: order.expected_completion_date,
      status: "completed",
      currentStage: "dispatch",
    }))

    res.json({
      success: true,
      data: transformedOrders,
    })
  } catch (error) {
    console.error("Get completed orders error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch completed orders",
    })
  }
})

module.exports = router
