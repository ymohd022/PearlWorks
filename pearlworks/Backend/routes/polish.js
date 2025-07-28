const express = require("express")
const db = require("../config/database")
const router = express.Router()
const { authenticateToken } = require("../middleware/auth")



// Get assigned polish orders - Updated query
router.get("/assigned-orders", authenticateToken, async (req, res) => {
  try {
    console.log("Polish assigned orders request from user:", req.user.id)

    const query = `
      SELECT 
        wo.id,
        wo.work_order_number,
        wo.party_name,
        wo.po_number,
        wo.po_date,
        wo.item_details as product_type,
        wo.description_of_work,
        wo.expected_completion_date,
        wo.gross_weight,
        wo.net_weight,
        wos.issue_weight,
        wos.jamah_weight,
        wos.issue_date,
        wos.jamah_date,
        wos.sorting_issue,
        wos.sorting_jamah,
        wos.weight_difference,
        wos.status,
        wos.notes,
        wos.approved,
        wos.karigar_name,
        wa.assigned_date,
        u.name as assigned_worker_name
      FROM work_orders wo
      JOIN work_order_stages wos ON wo.id = wos.work_order_id
      JOIN worker_assignments wa ON wo.id = wa.work_order_id
      LEFT JOIN users u ON wa.user_id = u.id
      WHERE wa.stage_type = 'polish'
        AND wos.stage_name = 'polish'
        AND wo.status != 'cancelled'
      ORDER BY wos.issue_date DESC, wo.created_at DESC
    `

    const [orders] = await db.execute(query)
    console.log("Found polish orders:", orders.length)

    res.json({
      success: true,
      data: orders.map((order) => ({
        id: order.id.toString(),
        workOrderNumber: order.work_order_number,
        partyName: order.party_name,
        poNumber: order.po_number,
        poDate: order.po_date,
        itemDetails: order.product_type,
        descriptionOfWork: order.description_of_work,
        grossWeight: order.gross_weight || 0,
        netWeight: order.net_weight || 0,
        expectedCompletionDate: order.expected_completion_date,
        issueWeight: order.issue_weight || 0,
        jamahWeight: order.jamah_weight || 0,
        issueDate: order.issue_date,
        jamahDate: order.jamah_date,
        sortingIssue: order.sorting_issue || 0,
        sortingJamah: order.sorting_jamah || 0,
        weightDifference: order.weight_difference || 0,
        status: order.status || "not-started",
        notes: order.notes || "",
        approved: order.approved || false,
        karigarName: order.karigar_name || "",
        assignedDate: order.assigned_date,
        assignedWorker: order.assigned_worker_name || "Unassigned",
        currentStage: "polish",
      })),
    })
  } catch (error) {
    console.error("Error fetching assigned polish orders:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch assigned orders",
      error: error.message,
    })
  }
})

// Update polish status - Enhanced with all fields
router.put("/update-status/:workOrderId", authenticateToken, async (req, res) => {
  const connection = await db.getConnection()

  try {
    await connection.beginTransaction()

    const { workOrderId } = req.params
    const {
      status,
      jamahWeight,
      notes,
      completedDate,
      sortingIssue,
      sortingJamah,
      approved,
      weightDifference,
      karigarName,
      issueDate,
      jamahDate,
    } = req.body

    // Get current stage data
    const [currentStage] = await connection.execute(
      'SELECT issue_weight, jamah_weight FROM work_order_stages WHERE work_order_id = ? AND stage_name = "polish"',
      [workOrderId],
    )

    // Calculate weight difference if jamah weight is provided
    let calculatedWeightDiff = weightDifference
    if (jamahWeight && currentStage.length > 0) {
      const issueWeight = currentStage[0].issue_weight || 0
      calculatedWeightDiff = Number.parseFloat(jamahWeight) - Number.parseFloat(issueWeight)
    }

    // Update work order stage with all fields
    const updateStageQuery = `
      UPDATE work_order_stages 
      SET status = ?, 
          jamah_weight = COALESCE(?, jamah_weight),
          jamah_date = COALESCE(?, jamah_date),
          issue_date = COALESCE(?, issue_date),
          notes = COALESCE(?, notes),
          sorting_issue = COALESCE(?, sorting_issue),
          sorting_jamah = COALESCE(?, sorting_jamah),
          approved = COALESCE(?, approved),
          weight_difference = COALESCE(?, weight_difference),
          karigar_name = COALESCE(?, karigar_name),
          updated_at = CURRENT_TIMESTAMP
      WHERE work_order_id = ? AND stage_name = 'polish'
    `

    await connection.execute(updateStageQuery, [
      status,
      jamahWeight,
      jamahDate || (status === "completed" ? new Date() : null),
      issueDate || (status === "in-progress" ? new Date() : null),
      notes,
      sortingIssue,
      sortingJamah,
      approved,
      calculatedWeightDiff,
      karigarName,
      workOrderId,
    ])

    // Update main work order status based on stage status
    if (status === "completed") {
      await connection.execute(
        'UPDATE work_orders SET status = "completed", completed_date = CURRENT_TIMESTAMP WHERE id = ?',
        [workOrderId],
      )
    } else if (status === "in-progress") {
      await connection.execute('UPDATE work_orders SET status = "in-progress" WHERE id = ?', [workOrderId])
    }

    // Get work order number for activity log
    const [workOrder] = await connection.execute("SELECT work_order_number FROM work_orders WHERE id = ?", [
      workOrderId,
    ])

    // Log activity with detailed information
    const activityDetails = [
      `Status: ${status}`,
      jamahWeight ? `Jamah Weight: ${jamahWeight}g` : "",
      karigarName ? `Karigar: ${karigarName}` : "",
      notes ? `Notes: ${notes}` : "",
    ]
      .filter(Boolean)
      .join(", ")

    await connection.execute(
      `INSERT INTO activity_logs (work_order_id, work_order_number, action, performed_by, performed_by_role, details) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        workOrderId,
        workOrder[0].work_order_number,
        `Polish stage updated to ${status}`,
        req.user.name,
        req.user.role,
        activityDetails,
      ],
    )

    await connection.commit()

    res.json({
      success: true,
      message: `Polish status updated to ${status} successfully`,
    })
  } catch (error) {
    await connection.rollback()
    console.error("Error updating polish status:", error)
    res.status(500).json({
      success: false,
      message: "Failed to update polish status",
      error: error.message,
    })
  } finally {
    connection.release()
  }
})

module.exports = router
