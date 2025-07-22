const express = require("express")
const db = require("../config/database")
const router = express.Router()
const { authenticateToken } = require("../middleware/auth")



// @desc    Get assigned repair work orders
// @route   GET /api/repair/assigned-orders
// @access  Private (repair role)
router.get("/assigned-orders", authenticateToken, async (req, res) => {
  try {
    console.log("Fetching assigned repair orders for user:", req.user.id)

    const query = `
      SELECT 
        wo.id,
        wo.work_order_number as workOrderNumber,
        wo.party_name as partyName,
        wo.item_details as productType,
        wo.approx_weight,
        wo.description_of_work,
        wo.expected_completion_date as expectedCompletionDate,
        wos.issue_weight as issueWeight,
        wos.jamah_weight as jamahWeight,
        wos.issue_date as assignedDate,
        wos.status,
        wos.notes,
        wos.stage_name as currentStage,
        wa.assigned_date
      FROM work_orders wo
      INNER JOIN worker_assignments wa ON wo.id = wa.work_order_id
      INNER JOIN work_order_stages wos ON wo.id = wos.work_order_id AND wos.stage_name = 'repair'
      WHERE wa.user_id = ? 
        AND wa.stage_type = 'repair'
        AND wo.status != 'cancelled'
      ORDER BY 
        CASE wos.status 
          WHEN 'in-progress' THEN 1
          WHEN 'not-started' THEN 2
          WHEN 'on-hold' THEN 3
          WHEN 'completed' THEN 4
        END,
        wo.expected_completion_date ASC,
        wo.created_at DESC
    `

    const [rows] = await db.execute(query, [req.user.id])

    console.log(`Found ${rows.length} assigned repair orders`)

    const formattedOrders = rows.map((order) => ({
      id: order.id.toString(),
      workOrderNumber: order.workOrderNumber,
      partyName: order.partyName,
      productType: order.productType,
      approxWeight: order.approx_weight || 0,
      issueWeight: Number.parseFloat(order.issueWeight) || 0,
      jamahWeight: order.jamahWeight ? Number.parseFloat(order.jamahWeight) : null,
      assignedDate: order.assignedDate,
      status: order.status,
      notes: order.notes,
      expectedCompletionDate: order.expectedCompletionDate,
      currentStage: order.currentStage,
      descriptionOfWork: order.description_of_work,
    }))

    res.json({
      success: true,
      data: formattedOrders,
      message: `Retrieved ${formattedOrders.length} assigned repair orders`,
    })
  } catch (error) {
    console.error("Error fetching assigned repair orders:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch assigned repair orders",
      error: error.message,
    })
  }
})

// @desc    Update repair status
// @route   PUT /api/repair/update-status/:id
// @access  Private (repair role)
router.put("/update-status/:id", authenticateToken, async (req, res) => {
  const connection = await db.getConnection()

  try {
    await connection.beginTransaction()

    const workOrderId = req.params.id
    const { status, notes, jamahWeight, updatedBy, completedDate } = req.body

    console.log("Updating repair status:", {
      workOrderId,
      status,
      updatedBy,
      jamahWeight,
    })

    // Validate status
    const validStatuses = ["not-started", "in-progress", "completed", "on-hold"]
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status provided",
      })
    }

    // Check if work order exists and user has access
    const checkQuery = `
      SELECT wo.id, wo.work_order_number, wo.party_name
      FROM work_orders wo
      INNER JOIN worker_assignments wa ON wo.id = wa.work_order_id
      WHERE wo.id = ? AND wa.user_id = ? AND wa.stage_type = 'repair'
    `

    const [checkResult] = await db.execute(checkQuery, [workOrderId, req.user.id])

    if (checkResult.length === 0) {
      await db.rollback()
      return res.status(404).json({
        success: false,
        message: "Work order not found or access denied",
      })
    }

    const workOrder = checkResult[0]

    // Update work order stage
    const updateStageQuery = `
      UPDATE work_order_stages 
      SET 
        status = ?,
        notes = ?,
        jamah_weight = ?,
        jamah_date = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE work_order_id = ? AND stage_name = 'repair'
    `

    const jamahDate = status === "completed" ? new Date() : null
    const finalJamahWeight = jamahWeight ? Number.parseFloat(jamahWeight) : null

    await db.execute(updateStageQuery, [status, notes || null, finalJamahWeight, jamahDate, workOrderId])

    // Update main work order status if repair is completed
    if (status === "completed") {
      const updateWorkOrderQuery = `
        UPDATE work_orders 
        SET 
          status = 'in-progress',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      await db.execute(updateWorkOrderQuery, [workOrderId])
    }

    // Log activity
    const logQuery = `
      INSERT INTO activity_logs (
        work_order_id, 
        work_order_number, 
        action, 
        performed_by, 
        performed_by_role, 
        details
      ) VALUES (?, ?, ?, ?, ?, ?)
    `

    const action = `Repair status updated to: ${status}`
    const details = JSON.stringify({
      previousStatus: "unknown",
      newStatus: status,
      notes: notes,
      jamahWeight: finalJamahWeight,
      stage: "repair",
    })

    await db.execute(logQuery, [
      workOrderId,
      workOrder.work_order_number,
      action,
      updatedBy || req.user.name,
      "repair",
      details,
    ])

    await db.commit()

    // Fetch updated work order data
    const updatedQuery = `
      SELECT 
        wo.id,
        wo.work_order_number as workOrderNumber,
        wo.party_name as partyName,
        wo.item_details as productType,
        wo.expected_completion_date as expectedCompletionDate,
        wos.issue_weight as issueWeight,
        wos.jamah_weight as jamahWeight,
        wos.issue_date as assignedDate,
        wos.status,
        wos.notes,
        wos.stage_name as currentStage
      FROM work_orders wo
      INNER JOIN work_order_stages wos ON wo.id = wos.work_order_id AND wos.stage_name = 'repair'
      WHERE wo.id = ?
    `

    const [updatedResult] = await db.execute(updatedQuery, [workOrderId])
    const updatedOrder = updatedResult[0]

    res.json({
      success: true,
      message: `Repair status updated successfully to ${status}`,
      data: {
        id: updatedOrder.id.toString(),
        workOrderNumber: updatedOrder.workOrderNumber,
        partyName: updatedOrder.partyName,
        productType: updatedOrder.productType,
        issueWeight: Number.parseFloat(updatedOrder.issueWeight) || 0,
        jamahWeight: updatedOrder.jamahWeight ? Number.parseFloat(updatedOrder.jamahWeight) : null,
        assignedDate: updatedOrder.assignedDate,
        status: updatedOrder.status,
        notes: updatedOrder.notes,
        expectedCompletionDate: updatedOrder.expectedCompletionDate,
        currentStage: updatedOrder.currentStage,
      },
    })
  } catch (error) {
    await db.rollback()
    console.error("Error updating repair status:", error)
    res.status(500).json({
      success: false,
      message: "Failed to update repair status",
      error: error.message,
    })
  } finally {
    connection.release()
  }
})

// @desc    Get repair statistics
// @route   GET /api/repair/statistics
// @access  Private (repair role)
router.get("/statistics", authenticateToken, async (req, res) => {
  try {
    console.log("Fetching repair statistics for user:", req.user.id)

    // Get overall statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as totalAssigned,
        SUM(CASE WHEN wos.status = 'not-started' THEN 1 ELSE 0 END) as notStarted,
        SUM(CASE WHEN wos.status = 'in-progress' THEN 1 ELSE 0 END) as inProgress,
        SUM(CASE WHEN wos.status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN wos.status = 'on-hold' THEN 1 ELSE 0 END) as onHold,
        SUM(CASE WHEN wo.expected_completion_date < CURDATE() AND wos.status != 'completed' THEN 1 ELSE 0 END) as overdue,
        AVG(CASE WHEN wos.status = 'completed' AND wos.jamah_date IS NOT NULL AND wos.issue_date IS NOT NULL 
                 THEN DATEDIFF(wos.jamah_date, wos.issue_date) ELSE NULL END) as avgCompletionDays
      FROM work_orders wo
      INNER JOIN worker_assignments wa ON wo.id = wa.work_order_id
      INNER JOIN work_order_stages wos ON wo.id = wos.work_order_id AND wos.stage_name = 'repair'
      WHERE wa.user_id = ? AND wa.stage_type = 'repair' AND wo.status != 'cancelled'
    `

    const [statsResult] = await db.execute(statsQuery, [req.user.id])
    const stats = statsResult[0]

    // Get recent activity
    const recentActivityQuery = `
      SELECT 
        wo.work_order_number,
        wo.party_name,
        wos.status,
        wos.updated_at,
        wos.notes
      FROM work_orders wo
      INNER JOIN worker_assignments wa ON wo.id = wa.work_order_id
      INNER JOIN work_order_stages wos ON wo.id = wos.work_order_id AND wos.stage_name = 'repair'
      WHERE wa.user_id = ? AND wa.stage_type = 'repair'
      ORDER BY wos.updated_at DESC
      LIMIT 5
    `

    const [recentActivity] = await db.execute(recentActivityQuery, [req.user.id])

    // Get weight statistics
    const weightStatsQuery = `
      SELECT 
        SUM(wos.issue_weight) as totalIssueWeight,
        SUM(wos.jamah_weight) as totalJamahWeight,
        AVG(wos.issue_weight) as avgIssueWeight,
        AVG(wos.jamah_weight) as avgJamahWeight,
        COUNT(CASE WHEN wos.jamah_weight IS NOT NULL THEN 1 END) as completedWithWeight
      FROM work_orders wo
      INNER JOIN worker_assignments wa ON wo.id = wa.work_order_id
      INNER JOIN work_order_stages wos ON wo.id = wos.work_order_id AND wos.stage_name = 'repair'
      WHERE wa.user_id = ? AND wa.stage_type = 'repair' AND wo.status != 'cancelled'
    `

    const [weightStats] = await db.execute(weightStatsQuery, [req.user.id])

    const statistics = {
      totalAssigned: Number.parseInt(stats.totalAssigned) || 0,
      notStarted: Number.parseInt(stats.notStarted) || 0,
      inProgress: Number.parseInt(stats.inProgress) || 0,
      completed: Number.parseInt(stats.completed) || 0,
      onHold: Number.parseInt(stats.onHold) || 0,
      overdue: Number.parseInt(stats.overdue) || 0,
      avgCompletionDays: Number.parseFloat(stats.avgCompletionDays) || 0,
      completionRate: stats.totalAssigned > 0 ? ((stats.completed / stats.totalAssigned) * 100).toFixed(1) : 0,
      recentActivity: recentActivity.map((activity) => ({
        workOrderNumber: activity.work_order_number,
        partyName: activity.party_name,
        status: activity.status,
        updatedAt: activity.updated_at,
        notes: activity.notes,
      })),
      weightStats: {
        totalIssueWeight: Number.parseFloat(weightStats[0].totalIssueWeight) || 0,
        totalJamahWeight: Number.parseFloat(weightStats[0].totalJamahWeight) || 0,
        avgIssueWeight: Number.parseFloat(weightStats[0].avgIssueWeight) || 0,
        avgJamahWeight: Number.parseFloat(weightStats[0].avgJamahWeight) || 0,
        completedWithWeight: Number.parseInt(weightStats[0].completedWithWeight) || 0,
      },
    }

    res.json({
      success: true,
      data: statistics,
    })
  } catch (error) {
    console.error("Error fetching repair statistics:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch repair statistics",
      error: error.message,
    })
  }
})

// @desc    Get repair work order details
// @route   GET /api/repair/work-order/:id
// @access  Private (repair role)
router.get("/work-order/:id", authenticateToken, async (req, res) => {
  try {
    const workOrderId = req.params.id

    const query = `
      SELECT 
        wo.*,
        wos.*,
        wa.assigned_date
      FROM work_orders wo
      INNER JOIN worker_assignments wa ON wo.id = wa.work_order_id
      INNER JOIN work_order_stages wos ON wo.id = wos.work_order_id AND wos.stage_name = 'repair'
      WHERE wo.id = ? AND wa.user_id = ? AND wa.stage_type = 'repair'
    `

    const [result] = await db.execute(query, [workOrderId, req.user.id])

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Work order not found or access denied",
      })
    }

    res.json({
      success: true,
      data: result[0],
    })
  } catch (error) {
    console.error("Error fetching work order details:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch work order details",
      error: error.message,
    })
  }
})

module.exports = router
