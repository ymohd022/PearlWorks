const express = require("express")
const db = require("../config/database")
const { authenticateToken } = require("../middleware/auth")

const router = express.Router()

// Get assigned work orders for role-based dashboards
router.get("/assigned-orders/:stage", authenticateToken, async (req, res) => {
  try {
    const { stage } = req.params
    const userId = req.user.id
    const userRole = req.user.role

    let query = `
      SELECT wo.*, wos.status as stage_status, wos.notes as stage_notes,
             wos.jamah_weight, wos.karigar_name
      FROM work_orders wo
      LEFT JOIN work_order_stages wos ON wo.id = wos.work_order_id AND wos.stage_name = ?
      JOIN worker_assignments wa ON wo.id = wa.work_order_id
      WHERE wa.stage_type = ?
    `

    const params = [stage, stage]

    // Filter by user if not admin/manager
    if (!["admin", "manager"].includes(userRole)) {
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
      productType: order.item_details,
      issueWeight: order.gross_weight || 0,
      jamahWeight: order.jamah_weight,
      assignedDate: order.created_at,
      status: order.stage_status || "not-started",
      currentStage: stage,
      notes: order.stage_notes,
      expectedCompletionDate: order.expected_completion_date,
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
router.put("/update-stage/:workOrderId", authenticateToken, async (req, res) => {
  const connection = await db.getConnection()

  try {
    await connection.beginTransaction()

    const { workOrderId } = req.params
    const { stage, status, notes, jamahWeight } = req.body

    // Check if stage record exists
    const [existingStage] = await connection.execute(
      "SELECT id FROM work_order_stages WHERE work_order_id = ? AND stage_name = ?",
      [workOrderId, stage],
    )

    if (existingStage.length > 0) {
      // Update existing stage
      await connection.execute(
        `
        UPDATE work_order_stages 
        SET status = ?, notes = ?, jamah_weight = ?, jamah_date = CURRENT_DATE,
            karigar_name = ?, updated_at = CURRENT_TIMESTAMP
        WHERE work_order_id = ? AND stage_name = ?
      `,
        [status, notes, jamahWeight, req.user.name, workOrderId, stage],
      )
    } else {
      // Create new stage record
      await connection.execute(
        `
        INSERT INTO work_order_stages 
        (work_order_id, stage_name, status, notes, jamah_weight, jamah_date, karigar_name)
        VALUES (?, ?, ?, ?, ?, CURRENT_DATE, ?)
      `,
        [workOrderId, stage, status, notes, jamahWeight, req.user.name],
      )
    }

    // Get work order details for activity log
    const [workOrder] = await connection.execute("SELECT work_order_number FROM work_orders WHERE id = ?", [
      workOrderId,
    ])

    // Add activity log
    await connection.execute(
      `
      INSERT INTO activity_logs 
      (work_order_id, work_order_number, action, performed_by, performed_by_role, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      [
        workOrderId,
        workOrder[0].work_order_number,
        `${stage} stage updated`,
        req.user.name,
        req.user.role,
        `Status changed to ${status}${notes ? ". Notes: " + notes : ""}`,
      ],
    )

    await connection.commit()

    res.json({
      success: true,
      message: `${stage} stage updated successfully`,
    })
  } catch (error) {
    await connection.rollback()
    console.error("Update stage error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to update stage",
    })
  } finally {
    connection.release()
  }
})

// Get completed orders for dispatch
router.get("/completed-orders", authenticateToken, async (req, res) => {
  try {
    const [orders] = await db.execute(`
      SELECT wo.*, 
             MAX(wos.jamah_weight) as final_weight,
             GROUP_CONCAT(DISTINCT wos.stage_name) as completed_stages
      FROM work_orders wo
      JOIN work_order_stages wos ON wo.id = wos.work_order_id
      WHERE wos.status = 'completed' AND wo.status != 'dispatched'
      GROUP BY wo.id
      HAVING COUNT(DISTINCT wos.stage_name) >= 3
      ORDER BY wo.created_at DESC
    `)

    const transformedOrders = orders.map((order) => ({
      id: order.id.toString(),
      workOrderNumber: order.work_order_number,
      partyName: order.party_name,
      productType: order.item_details,
      issueWeight: order.gross_weight || 0,
      jamahWeight: order.final_weight,
      assignedDate: order.created_at,
      status: "completed",
      currentStage: "dispatch",
      expectedCompletionDate: order.expected_completion_date,
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
