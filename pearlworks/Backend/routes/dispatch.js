const express = require("express")
const router = express.Router()
const { authenticateToken } = require("../middleware/auth")
const db = require("../config/database")


// @desc    Get orders ready for dispatch
// @route   GET /api/dispatch/assigned-orders
// @access  Private
router.get("/assigned-orders", authenticateToken, async (req, res) => {
  try {
    console.log("Fetching orders ready for dispatch...")

    const query = `
      SELECT 
        wo.id,
        wo.work_order_number as workOrderNumber,
        wo.party_name as partyName,
        wo.product_type as productType,
        wo.issue_weight as issueWeight,
        wo.jamah_weight as jamahWeight,
        wo.expected_completion_date as expectedCompletionDate,
        wo.created_at as createdDate,
        wos.stage_name as currentStage,
        wos.status,
        wos.notes,
        wos.updated_by as updatedBy,
        wos.updated_at as lastUpdated,
        wos.completed_date as completedDate,
        wa.assigned_date as assignedDate,
        u.name as assignedWorkerName,
        ds.dispatch_date,
        ds.courier_service,
        ds.tracking_number,
        ds.delivery_status,
        ds.delivery_date,
        ds.recipient_name,
        ds.dispatch_notes
      FROM work_orders wo
      INNER JOIN work_order_stages wos ON wo.id = wos.work_order_id
      LEFT JOIN worker_assignments wa ON wo.id = wa.work_order_id AND wa.stage = 'dispatch'
      LEFT JOIN users u ON wa.worker_id = u.id
      LEFT JOIN dispatch_details ds ON wo.id = ds.work_order_id
      WHERE wos.stage_name IN ('polish', 'repair', 'setting', 'framing') 
        AND wos.status = 'completed'
        AND wo.id NOT IN (
          SELECT DISTINCT work_order_id 
          FROM work_order_stages 
          WHERE stage_name = 'dispatch' AND status = 'dispatched'
        )
      ORDER BY wos.completed_date ASC, wo.expected_completion_date ASC
    `

    const [rows] = await db.execute(query)

    console.log(`Found ${rows.length} orders ready for dispatch`)

    res.json({
      success: true,
      data: rows,
      message: `Found ${rows.length} orders ready for dispatch`,
    })
  } catch (error) {
    console.error("Error fetching dispatch orders:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch orders ready for dispatch",
      error: error.message,
    })
  }
})

// @desc    Update dispatch status
// @route   PUT /api/dispatch/update-status/:id
// @access  Private
router.put("/update-status/:id", authenticateToken, async (req, res) => {
  const connection = await db.getConnection()

  try {
    await connection.beginTransaction()

    const workOrderId = req.params.id
    const {
      status,
      updatedBy,
      notes,
      completedDate,
      courierService,
      trackingNumber,
      recipientName,
      deliveryAddress,
      estimatedDeliveryDate,
    } = req.body

    console.log(`Updating dispatch status for work order ${workOrderId}:`, {
      status,
      updatedBy,
      courierService,
      trackingNumber,
    })

    // Check if work order exists
    const [workOrderCheck] = await connection.execute("SELECT id, work_order_number FROM work_orders WHERE id = ?", [
      workOrderId,
    ])

    if (workOrderCheck.length === 0) {
      await connection.rollback()
      return res.status(404).json({
        success: false,
        message: "Work order not found",
      })
    }

    // Insert or update dispatch stage
    const [existingStage] = await connection.execute(
      "SELECT id FROM work_order_stages WHERE work_order_id = ? AND stage_name = ?",
      [workOrderId, "dispatch"],
    )

    if (existingStage.length > 0) {
      // Update existing dispatch stage
      await connection.execute(
        `
        UPDATE work_order_stages 
        SET status = ?, notes = ?, updated_by = ?, updated_at = NOW(),
            completed_date = ?
        WHERE work_order_id = ? AND stage_name = ?
      `,
        [status, notes, updatedBy, completedDate, workOrderId, "dispatch"],
      )
    } else {
      // Insert new dispatch stage
      await connection.execute(
        `
        INSERT INTO work_order_stages 
        (work_order_id, stage_name, status, notes, updated_by, created_at, updated_at, completed_date)
        VALUES (?, ?, ?, ?, ?, NOW(), NOW(), ?)
      `,
        [workOrderId, "dispatch", status, notes, updatedBy, completedDate],
      )
    }

    // Insert or update dispatch details
    const [existingDispatch] = await connection.execute("SELECT id FROM dispatch_details WHERE work_order_id = ?", [
      workOrderId,
    ])

    if (existingDispatch.length > 0) {
      // Update existing dispatch details
      await connection.execute(
        `
        UPDATE dispatch_details 
        SET courier_service = ?, tracking_number = ?, recipient_name = ?,
            delivery_address = ?, estimated_delivery_date = ?,
            dispatch_date = ?, dispatch_notes = ?, updated_at = NOW(),
            delivery_status = ?
        WHERE work_order_id = ?
      `,
        [
          courierService,
          trackingNumber,
          recipientName,
          deliveryAddress,
          estimatedDeliveryDate,
          completedDate,
          notes,
          status === "dispatched" ? "in_transit" : "pending",
          workOrderId,
        ],
      )
    } else {
      // Insert new dispatch details
      await connection.execute(
        `
        INSERT INTO dispatch_details 
        (work_order_id, courier_service, tracking_number, recipient_name,
         delivery_address, estimated_delivery_date, dispatch_date, 
         dispatch_notes, delivery_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
        [
          workOrderId,
          courierService,
          trackingNumber,
          recipientName,
          deliveryAddress,
          estimatedDeliveryDate,
          completedDate,
          notes,
          status === "dispatched" ? "in_transit" : "pending",
        ],
      )
    }

    // Log activity
    await connection.execute(
      `
      INSERT INTO activity_logs 
      (work_order_id, stage, action, details, performed_by, created_at)
      VALUES (?, ?, ?, ?, ?, NOW())
    `,
      [
        workOrderId,
        "dispatch",
        `Status updated to ${status}`,
        `Dispatch status updated. ${courierService ? `Courier: ${courierService}` : ""} ${trackingNumber ? `Tracking: ${trackingNumber}` : ""}`,
        updatedBy,
      ],
    )

    await connection.commit()

    console.log(`Successfully updated dispatch status for work order ${workOrderId}`)

    res.json({
      success: true,
      message: `Dispatch status updated successfully`,
      data: {
        workOrderId,
        status,
        courierService,
        trackingNumber,
      },
    })
  } catch (error) {
    await connection.rollback()
    console.error("Error updating dispatch status:", error)
    res.status(500).json({
      success: false,
      message: "Failed to update dispatch status",
      error: error.message,
    })
  } finally {
    connection.release()
  }
})

// @desc    Get dispatch statistics
// @route   GET /api/dispatch/statistics
// @access  Private
router.get("/statistics", authenticateToken, async (req, res) => {
  try {
    console.log("Fetching dispatch statistics...")

    // Get basic dispatch statistics
    const [dispatchStats] = await db.execute(`
      SELECT 
        COUNT(*) as totalDispatched,
        COUNT(CASE WHEN DATE(ds.dispatch_date) = CURDATE() THEN 1 END) as dispatchedToday,
        COUNT(CASE WHEN WEEK(ds.dispatch_date) = WEEK(CURDATE()) THEN 1 END) as dispatchedThisWeek,
        COUNT(CASE WHEN MONTH(ds.dispatch_date) = MONTH(CURDATE()) THEN 1 END) as dispatchedThisMonth,
        COUNT(CASE WHEN ds.delivery_status = 'delivered' THEN 1 END) as totalDelivered,
        COUNT(CASE WHEN ds.delivery_status = 'in_transit' THEN 1 END) as inTransit,
        COUNT(CASE WHEN ds.delivery_status = 'pending' THEN 1 END) as pendingDispatch
      FROM dispatch_details ds
      WHERE ds.dispatch_date IS NOT NULL
    `)

    // Get ready for dispatch count
    const [readyForDispatch] = await db.execute(`
      SELECT COUNT(*) as readyForDispatch
      FROM work_orders wo
      INNER JOIN work_order_stages wos ON wo.id = wos.work_order_id
      WHERE wos.stage_name IN ('polish', 'repair', 'setting', 'framing') 
        AND wos.status = 'completed'
        AND wo.id NOT IN (
          SELECT DISTINCT work_order_id 
          FROM work_order_stages 
          WHERE stage_name = 'dispatch' AND status = 'dispatched'
        )
    `)

    // Get courier service statistics
    const [courierStats] = await db.execute(`
      SELECT 
        courier_service,
        COUNT(*) as count,
        COUNT(CASE WHEN delivery_status = 'delivered' THEN 1 END) as delivered
      FROM dispatch_details 
      WHERE courier_service IS NOT NULL
      GROUP BY courier_service
      ORDER BY count DESC
    `)

    // Get recent dispatch activity
    const [recentActivity] = await db.execute(`
      SELECT 
        wo.work_order_number,
        wo.party_name,
        ds.courier_service,
        ds.tracking_number,
        ds.dispatch_date,
        ds.delivery_status
      FROM dispatch_details ds
      INNER JOIN work_orders wo ON ds.work_order_id = wo.id
      WHERE ds.dispatch_date IS NOT NULL
      ORDER BY ds.dispatch_date DESC
      LIMIT 10
    `)

    // Get average dispatch time
    const [avgDispatchTime] = await db.execute(`
      SELECT 
        AVG(DATEDIFF(ds.dispatch_date, wo.created_at)) as avgDispatchDays
      FROM dispatch_details ds
      INNER JOIN work_orders wo ON ds.work_order_id = wo.id
      WHERE ds.dispatch_date IS NOT NULL
    `)

    const statistics = {
      overview: {
        totalDispatched: dispatchStats[0].totalDispatched || 0,
        dispatchedToday: dispatchStats[0].dispatchedToday || 0,
        dispatchedThisWeek: dispatchStats[0].dispatchedThisWeek || 0,
        dispatchedThisMonth: dispatchStats[0].dispatchedThisMonth || 0,
        totalDelivered: dispatchStats[0].totalDelivered || 0,
        inTransit: dispatchStats[0].inTransit || 0,
        pendingDispatch: dispatchStats[0].pendingDispatch || 0,
        readyForDispatch: readyForDispatch[0].readyForDispatch || 0,
        avgDispatchDays: Math.round(avgDispatchTime[0].avgDispatchDays || 0),
      },
      courierServices: courierStats,
      recentActivity: recentActivity,
    }

    console.log("Dispatch statistics fetched successfully")

    res.json({
      success: true,
      data: statistics,
    })
  } catch (error) {
    console.error("Error fetching dispatch statistics:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch dispatch statistics",
      error: error.message,
    })
  }
})

// @desc    Get tracking information
// @route   GET /api/dispatch/tracking/:id
// @access  Private
router.get("/tracking/:id", authenticateToken, async (req, res) => {
  try {
    const workOrderId = req.params.id

    const [trackingInfo] = await db.execute(
      `
      SELECT 
        wo.work_order_number,
        wo.party_name,
        wo.product_type,
        ds.courier_service,
        ds.tracking_number,
        ds.dispatch_date,
        ds.estimated_delivery_date,
        ds.delivery_date,
        ds.delivery_status,
        ds.recipient_name,
        ds.delivery_address,
        ds.dispatch_notes
      FROM dispatch_details ds
      INNER JOIN work_orders wo ON ds.work_order_id = wo.id
      WHERE wo.id = ?
    `,
      [workOrderId],
    )

    if (trackingInfo.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Tracking information not found",
      })
    }

    res.json({
      success: true,
      data: trackingInfo[0],
    })
  } catch (error) {
    console.error("Error fetching tracking information:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch tracking information",
      error: error.message,
    })
  }
})

// @desc    Update delivery status
// @route   PUT /api/dispatch/delivery-status/:id
// @access  Private
router.put("/delivery-status/:id", authenticateToken, async (req, res) => {
  try {
    const workOrderId = req.params.id
    const { deliveryStatus, deliveryDate, deliveryNotes, updatedBy } = req.body

    await db.execute(
      `
      UPDATE dispatch_details 
      SET delivery_status = ?, delivery_date = ?, delivery_notes = ?, updated_at = NOW()
      WHERE work_order_id = ?
    `,
      [deliveryStatus, deliveryDate, deliveryNotes, workOrderId],
    )

    // Log activity
    await db.execute(
      `
      INSERT INTO activity_logs 
      (work_order_id, stage, action, details, performed_by, created_at)
      VALUES (?, ?, ?, ?, ?, NOW())
    `,
      [
        workOrderId,
        "dispatch",
        `Delivery status updated to ${deliveryStatus}`,
        deliveryNotes || `Delivery status updated to ${deliveryStatus}`,
        updatedBy,
      ],
    )

    res.json({
      success: true,
      message: "Delivery status updated successfully",
    })
  } catch (error) {
    console.error("Error updating delivery status:", error)
    res.status(500).json({
      success: false,
      message: "Failed to update delivery status",
      error: error.message,
    })
  }
})

module.exports = router
