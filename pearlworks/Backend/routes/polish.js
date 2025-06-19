const express = require("express")
const router = express.Router()
const db = require("../config/database")
const { authenticateToken } = require("../middleware/auth")

// Get assigned polish orders
router.get("/assigned-orders", authenticateToken, async (req, res) => {
  try {
    console.log("Polish assigned orders request from user:", req.user.id) // Add logging

    const query = `
      SELECT 
        wo.id,
        wo.work_order_number,
        wo.party_name,
        wo.item_details as product_type,
        wos.issue_weight,
        wos.jamah_weight,
        wos.issue_date as assigned_date,
        wos.status,
        wos.notes,
        wo.expected_completion_date,
        wos.karigar_name,
        wos.approved,
        wos.sorting_issue,
        wos.sorting_jamah,
        wos.weight_difference,
        wo.gross_weight,
        wo.net_weight
      FROM work_orders wo
      JOIN work_order_stages wos ON wo.id = wos.work_order_id
      JOIN worker_assignments wa ON wo.id = wa.work_order_id
      WHERE wa.user_id = ? 
        AND wa.stage_type = 'polish'
        AND wos.stage_name = 'polish'
        AND wo.status != 'cancelled'
      ORDER BY wos.issue_date DESC
    `

    const [orders] = await db.execute(query, [req.user.id])
    console.log("Found orders:", orders.length) // Add logging

    res.json({
      success: true,
      data: orders.map((order) => ({
        id: order.id.toString(),
        workOrderNumber: order.work_order_number,
        partyName: order.party_name,
        productType: order.product_type,
        issueWeight: order.issue_weight,
        jamahWeight: order.jamah_weight,
        assignedDate: order.assigned_date,
        status: order.status,
        notes: order.notes,
        expectedCompletionDate: order.expected_completion_date,
        currentStage: "polish",
        karigarName: order.karigar_name,
        approved: order.approved,
        sortingIssue: order.sorting_issue,
        sortingJamah: order.sorting_jamah,
        weightDifference: order.weight_difference,
        grossWeight: order.gross_weight,
        netWeight: order.net_weight,
      })),
    })
  } catch (error) {
    console.error("Error fetching assigned polish orders:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch assigned orders",
      error: error.message, // Add error details for debugging
    })
  }
})

// Update polish status
router.put("/update-status/:workOrderId", authenticateToken, async (req, res) => {
  const connection = await db.getConnection()

  try {
    await connection.beginTransaction()

    const { workOrderId } = req.params
    const { status, jamahWeight, notes, completedDate, sortingJamah, approved, weightDifference } = req.body

    // Calculate weight difference if jamah weight is provided
    let calculatedWeightDiff = weightDifference
    if (jamahWeight) {
      const [currentOrder] = await connection.execute(
        'SELECT issue_weight FROM work_order_stages WHERE work_order_id = ? AND stage_name = "polish"',
        [workOrderId],
      )

      if (currentOrder.length > 0) {
        calculatedWeightDiff = Number.parseFloat(jamahWeight) - Number.parseFloat(currentOrder[0].issue_weight)
      }
    }

    // Update work order stage
    const updateStageQuery = `
      UPDATE work_order_stages 
      SET status = ?, 
          jamah_weight = COALESCE(?, jamah_weight),
          jamah_date = COALESCE(?, jamah_date),
          notes = COALESCE(?, notes),
          sorting_jamah = COALESCE(?, sorting_jamah),
          approved = COALESCE(?, approved),
          weight_difference = COALESCE(?, weight_difference),
          updated_at = CURRENT_TIMESTAMP
      WHERE work_order_id = ? AND stage_name = 'polish'
    `

    await connection.execute(updateStageQuery, [
      status,
      jamahWeight,
      status === "completed" ? new Date() : null,
      notes,
      sortingJamah,
      approved,
      calculatedWeightDiff,
      workOrderId,
    ])

    // Update main work order status if completed
    if (status === "completed") {
      await connection.execute(
        'UPDATE work_orders SET status = "in-progress", updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [workOrderId],
      )
    }

    // Get work order number for activity log
    const [workOrder] = await connection.execute("SELECT work_order_number FROM work_orders WHERE id = ?", [
      workOrderId,
    ])

    // Log activity
    await connection.execute(
      `INSERT INTO activity_logs (work_order_id, work_order_number, action, performed_by, performed_by_role, details) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        workOrderId,
        workOrder[0].work_order_number,
        `Polish stage updated to ${status}`,
        req.user.name,
        req.user.role,
        `Status: ${status}${jamahWeight ? `, Jamah Weight: ${jamahWeight}g` : ""}${notes ? `, Notes: ${notes}` : ""}`,
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
    })
  } finally {
    connection.release()
  }
})

// Get polish statistics
router.get("/statistics", authenticateToken, async (req, res) => {
  try {
    const statsQuery = `
      SELECT 
        COUNT(*) as total_orders,
        SUM(CASE WHEN wos.status = 'not-started' THEN 1 ELSE 0 END) as pending_orders,
        SUM(CASE WHEN wos.status = 'in-progress' THEN 1 ELSE 0 END) as in_progress_orders,
        SUM(CASE WHEN wos.status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
        SUM(CASE WHEN wos.status = 'on-hold' THEN 1 ELSE 0 END) as on_hold_orders,
        AVG(CASE WHEN wos.jamah_weight IS NOT NULL AND wos.issue_weight IS NOT NULL 
            THEN wos.jamah_weight - wos.issue_weight ELSE NULL END) as avg_weight_difference,
        SUM(CASE WHEN wos.approved = 1 THEN 1 ELSE 0 END) as approved_orders,
        SUM(CASE WHEN wo.expected_completion_date < CURDATE() AND wos.status != 'completed' 
            THEN 1 ELSE 0 END) as overdue_orders
      FROM work_order_stages wos
      JOIN work_orders wo ON wos.work_order_id = wo.id
      JOIN worker_assignments wa ON wo.id = wa.work_order_id
      WHERE wa.user_id = ? 
        AND wa.stage_type = 'polish'
        AND wos.stage_name = 'polish'
        AND wo.status != 'cancelled'
    `

    const [stats] = await db.execute(statsQuery, [req.user.id])

    // Get recent activity
    const activityQuery = `
      SELECT 
        al.action,
        al.performed_by,
        al.details,
        al.created_at,
        wo.work_order_number
      FROM activity_logs al
      JOIN work_orders wo ON al.work_order_id = wo.id
      JOIN worker_assignments wa ON wo.id = wa.work_order_id
      WHERE wa.user_id = ? 
        AND wa.stage_type = 'polish'
        AND al.action LIKE '%polish%'
      ORDER BY al.created_at DESC
      LIMIT 10
    `

    const [activities] = await db.execute(activityQuery, [req.user.id])

    res.json({
      success: true,
      data: {
        totalOrders: stats[0].total_orders,
        pendingOrders: stats[0].pending_orders,
        inProgressOrders: stats[0].in_progress_orders,
        completedOrders: stats[0].completed_orders,
        onHoldOrders: stats[0].on_hold_orders,
        avgWeightDifference: Number.parseFloat(stats[0].avg_weight_difference || 0).toFixed(3),
        approvedOrders: stats[0].approved_orders,
        overdueOrders: stats[0].overdue_orders,
        recentActivities: activities.map((activity) => ({
          action: activity.action,
          performedBy: activity.performed_by,
          details: activity.details,
          createdAt: activity.created_at,
          workOrderNumber: activity.work_order_number,
        })),
      },
    })
  } catch (error) {
    console.error("Error fetching polish statistics:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch statistics",
    })
  }
})

// Get stones for a work order
router.get("/stones/:workOrderId", authenticateToken, async (req, res) => {
  try {
    const { workOrderId } = req.params

    // Get received stones
    const receivedQuery = `
      SELECT id, type, pieces, weight_grams, weight_carats, created_at
      FROM stones 
      WHERE work_order_id = ? AND is_received = 1
      ORDER BY type
    `

    // Get returned stones
    const returnedQuery = `
      SELECT id, type, pieces, weight_grams, weight_carats, returned_date, created_at
      FROM returned_stones 
      WHERE work_order_id = ?
      ORDER BY type
    `

    const [receivedStones] = await db.execute(receivedQuery, [workOrderId])
    const [returnedStones] = await db.execute(returnedQuery, [workOrderId])

    res.json({
      success: true,
      data: {
        receivedStones: receivedStones.map((stone) => ({
          id: stone.id,
          type: stone.type,
          pieces: stone.pieces,
          weightGrams: stone.weight_grams,
          weightCarats: stone.weight_carats,
          createdAt: stone.created_at,
        })),
        returnedStones: returnedStones.map((stone) => ({
          id: stone.id,
          type: stone.type,
          pieces: stone.pieces,
          weightGrams: stone.weight_grams,
          weightCarats: stone.weight_carats,
          returnedDate: stone.returned_date,
          createdAt: stone.created_at,
        })),
      },
    })
  } catch (error) {
    console.error("Error fetching stones:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch stones data",
    })
  }
})

// Add returned stones
router.post("/stones/:workOrderId/return", authenticateToken, async (req, res) => {
  try {
    const { workOrderId } = req.params
    const { stones } = req.body // Array of stones to return

    const connection = await db.getConnection()
    await connection.beginTransaction()

    try {
      for (const stone of stones) {
        await connection.execute(
          `INSERT INTO returned_stones (work_order_id, type, pieces, weight_grams, weight_carats, returned_date)
           VALUES (?, ?, ?, ?, ?, CURDATE())`,
          [workOrderId, stone.type, stone.pieces, stone.weightGrams, stone.weightCarats],
        )
      }

      // Log activity
      const [workOrder] = await connection.execute("SELECT work_order_number FROM work_orders WHERE id = ?", [
        workOrderId,
      ])

      await connection.execute(
        `INSERT INTO activity_logs (work_order_id, work_order_number, action, performed_by, performed_by_role, details) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          workOrderId,
          workOrder[0].work_order_number,
          "Stones returned from polish stage",
          req.user.name,
          req.user.role,
          `Returned ${stones.length} stone types`,
        ],
      )

      await connection.commit()

      res.json({
        success: true,
        message: "Stones returned successfully",
      })
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  } catch (error) {
    console.error("Error returning stones:", error)
    res.status(500).json({
      success: false,
      message: "Failed to return stones",
    })
  }
})

// Get work order details for polish
router.get("/work-order/:workOrderId", authenticateToken, async (req, res) => {
  try {
    const { workOrderId } = req.params

    const query = `
      SELECT 
        wo.*,
        wos.*,
        wa.assigned_date
      FROM work_orders wo
      JOIN work_order_stages wos ON wo.id = wos.work_order_id
      JOIN worker_assignments wa ON wo.id = wa.work_order_id
      WHERE wo.id = ? 
        AND wa.user_id = ? 
        AND wa.stage_type = 'polish'
        AND wos.stage_name = 'polish'
    `

    const [result] = await db.execute(query, [workOrderId, req.user.id])

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Work order not found or not assigned to you",
      })
    }

    const order = result[0]

    res.json({
      success: true,
      data: {
        id: order.id.toString(),
        workOrderNumber: order.work_order_number,
        partyName: order.party_name,
        poNumber: order.po_number,
        poDate: order.po_date,
        itemDetails: order.item_details,
        modelNumber: order.model_number,
        descriptionOfWork: order.description_of_work,
        grossWeight: order.gross_weight,
        netWeight: order.net_weight,
        expectedCompletionDate: order.expected_completion_date,
        issueWeight: order.issue_weight,
        jamahWeight: order.jamah_weight,
        issueDate: order.issue_date,
        jamahDate: order.jamah_date,
        sortingIssue: order.sorting_issue,
        sortingJamah: order.sorting_jamah,
        weightDifference: order.weight_difference,
        status: order.status,
        approved: order.approved,
        notes: order.notes,
        karigarName: order.karigar_name,
        assignedDate: order.assigned_date,
      },
    })
  } catch (error) {
    console.error("Error fetching work order details:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch work order details",
    })
  }
})

module.exports = router
