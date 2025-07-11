const express = require("express")
const router = express.Router()
const { authenticateToken } = require("../middleware/auth")
const db = require("../config/database")

// @desc    Get orders ready for dispatch with calculated weights
// @route   GET /api/dispatch/ready-orders
// @access  Private
router.get("/ready-orders", authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT 
        wo.id,
        wo.work_order_number as workOrderNumber,
        wo.party_name as partyName,
        wo.completed_date as orderCompletedDate,
        wo.dispatched_by as dispatchedBy,
        wo.status,
        -- Calculate gross weight from stones
        COALESCE(
          (SELECT SUM(s.weight_grams) 
           FROM stones s 
           WHERE s.work_order_id = wo.id AND s.is_received = 1), 
          0
        ) as grossWeight,
        -- Calculate net weight (gross weight - returned stones)
        COALESCE(
          (SELECT SUM(s.weight_grams) 
           FROM stones s 
           WHERE s.work_order_id = wo.id AND s.is_received = 1), 
          0
        ) - COALESCE(
          (SELECT SUM(rs.weight_grams) 
           FROM returned_stones rs 
           WHERE rs.work_order_id = wo.id), 
          0
        ) as netWeight,
        CASE 
          WHEN wo.status = 'dispatched' THEN 'dispatched'
          ELSE 'ready'
        END as dispatchStatus
      FROM work_orders wo
      WHERE wo.status IN ('completed', 'dispatched')
      ORDER BY 
        CASE WHEN wo.status = 'completed' THEN 0 ELSE 1 END,
        wo.completed_date DESC
    `

    const [rows] = await db.execute(query)

    const orders = rows.map((row) => ({
      id: row.id.toString(),
      workOrderNumber: row.workOrderNumber,
      partyName: row.partyName,
      orderCompletedDate: row.orderCompletedDate,
      grossWeight: Number.parseFloat(row.grossWeight) || 0,
      netWeight: Number.parseFloat(row.netWeight) || 0,
      dispatchedBy: row.dispatchedBy || "",
      status: row.dispatchStatus,
    }))

    res.json({
      success: true,
      data: orders,
    })
  } catch (error) {
    console.error("Error fetching dispatch ready orders:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch orders ready for dispatch",
      error: error.message,
    })
  }
})

// @desc    Get orders assigned to dispatch stage with calculated weights
// @route   GET /api/dispatch/assigned-orders
// @access  Private
router.get("/assigned-orders", authenticateToken, async (req, res) => {
  try {
    console.log("Fetching dispatch assigned orders...")

    // First, let's check if there are any worker assignments for dispatch
    const [assignmentCheck] = await db.execute(`
      SELECT COUNT(*) as count 
      FROM worker_assignments 
      WHERE stage_type = 'dispatch'
    `)
    console.log(`Found ${assignmentCheck[0].count} dispatch assignments`)

    // Modified query with better error handling and debugging
    const query = `
      SELECT 
        wo.id,
        wo.work_order_number as workOrderNumber,
        wo.party_name as partyName,
        wo.completed_date as orderCompletedDate,
        wo.dispatched_by as dispatchedBy,
        wo.status,
        wo.gross_weight as storedGrossWeight,
        wo.net_weight as storedNetWeight,
        -- Calculate gross weight from all stones (received)
        COALESCE(
          (SELECT SUM(s.weight_grams) 
           FROM stones s 
           WHERE s.work_order_id = wo.id AND (s.is_received = 1 OR s.is_received IS NULL)), 
          0
        ) as calculatedGrossWeight,
        -- Calculate net weight (gross weight - returned stones)
        COALESCE(
          (SELECT SUM(s.weight_grams) 
           FROM stones s 
           WHERE s.work_order_id = wo.id AND (s.is_received = 1 OR s.is_received IS NULL)), 
          0
        ) - COALESCE(
          (SELECT SUM(rs.weight_grams) 
           FROM returned_stones rs 
           WHERE rs.work_order_id = wo.id), 
          0
        ) as calculatedNetWeight,
        -- Count stones for debugging
        (SELECT COUNT(*) FROM stones s WHERE s.work_order_id = wo.id) as totalStones,
        (SELECT COUNT(*) FROM stones s WHERE s.work_order_id = wo.id AND s.is_received = 1) as receivedStones,
        CASE 
          WHEN wo.status = 'dispatched' THEN 'dispatched'
          ELSE 'ready'
        END as dispatchStatus
      FROM work_orders wo
      INNER JOIN worker_assignments wa ON wo.id = wa.work_order_id
      WHERE wa.stage_type = 'dispatch'
      ORDER BY 
        CASE WHEN wo.status = 'completed' THEN 0 ELSE 1 END,
        wo.created_at DESC
    `

    const [rows] = await db.execute(query)
    console.log(`Found ${rows.length} orders assigned to dispatch`)

    const orders = rows.map((row) => {
      // Use calculated weights if available, otherwise fall back to stored weights
      const grossWeight = row.calculatedGrossWeight > 0 ? row.calculatedGrossWeight : row.storedGrossWeight || 0
      const netWeight = row.calculatedNetWeight > 0 ? row.calculatedNetWeight : row.storedNetWeight || 0

      console.log(
        `Order ${row.workOrderNumber}: Gross=${grossWeight}, Net=${netWeight}, Stones=${row.totalStones}, Received=${row.receivedStones}`,
      )

      return {
        id: row.id.toString(),
        workOrderNumber: row.workOrderNumber,
        partyName: row.partyName,
        orderCompletedDate: row.orderCompletedDate,
        grossWeight: Number.parseFloat(grossWeight) || 0,
        netWeight: Number.parseFloat(netWeight) || 0,
        dispatchedBy: row.dispatchedBy || "",
        status: row.dispatchStatus,
      }
    })

    console.log(`Returning ${orders.length} dispatch orders`)

    res.json({
      success: true,
      data: orders,
    })
  } catch (error) {
    console.error("Error fetching dispatch assigned orders:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch orders assigned to dispatch",
      error: error.message,
    })
  }
})

// @desc    Update dispatch status
// @route   PUT /api/dispatch/update-status/:id
// @access  Private
router.put("/update-status/:id", authenticateToken, async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const workOrderId = req.params.id;
    const { orderCompletedDate, dispatchedBy, status } = req.body;

    console.log(`Updating dispatch status for work order ${workOrderId}:`, {
      orderCompletedDate,
      dispatchedBy,
      status,
    });

    // Check if work order exists
    const [workOrderCheck] = await connection.execute(
      "SELECT id, work_order_number FROM work_orders WHERE id = ?", 
      [workOrderId]
    );

    if (workOrderCheck.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Work order not found",
      });
    }

    // Update work order with dispatch information
    await connection.execute(
      `UPDATE work_orders 
       SET completed_date = ?, 
           dispatched_by = ?, 
           status = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [orderCompletedDate, dispatchedBy, status, workOrderId],
    );

    // Use 'completed' status for dispatch stage to avoid enum issues
    const stageStatus = 'completed';

    // Insert or update dispatch stage
    const [existingStage] = await connection.execute(
      "SELECT id FROM work_order_stages WHERE work_order_id = ? AND stage_name = ?",
      [workOrderId, "dispatch"]
    );

    if (existingStage.length > 0) {
      await connection.execute(
        `UPDATE work_order_stages 
         SET status = ?, 
             updated_at = NOW(),
             jamah_date = ?
         WHERE work_order_id = ? AND stage_name = ?`,
        [stageStatus, orderCompletedDate, workOrderId, "dispatch"]
      );
    } else {
      await connection.execute(
        `INSERT INTO work_order_stages 
         (work_order_id, stage_name, status, jamah_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [workOrderId, "dispatch", stageStatus, orderCompletedDate]
      );
    }

    // Insert or update dispatch details
    const [existingDispatch] = await connection.execute(
      "SELECT id FROM dispatch_details WHERE work_order_id = ?", 
      [workOrderId]
    );

    if (existingDispatch.length > 0) {
      await connection.execute(
        `UPDATE dispatch_details 
         SET dispatch_date = ?, dispatched_by = ?, dispatch_notes = ?, updated_at = NOW()
         WHERE work_order_id = ?`,
        [orderCompletedDate, dispatchedBy, `Dispatched by ${dispatchedBy}`, workOrderId]
      );
    } else {
      await connection.execute(
        `INSERT INTO dispatch_details 
         (work_order_id, dispatch_date, dispatched_by, dispatch_notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [workOrderId, orderCompletedDate, dispatchedBy, `Dispatched by ${dispatchedBy}`]
      );
    }

    // Log activity
    await connection.execute(
      `INSERT INTO activity_logs 
       (work_order_id, work_order_number, action, performed_by, performed_by_role, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        workOrderId,
        workOrderCheck[0].work_order_number,
        `Order ${status}`,
        req.user?.name || dispatchedBy,
        req.user?.role || "dispatcher",
        `Order ${status} by ${dispatchedBy} on ${orderCompletedDate}`,
      ]
    );

    await connection.commit();

    console.log(`Successfully updated dispatch status for work order ${workOrderId}`);

    res.json({
      success: true,
      message: `Order ${status} successfully`,
      data: {
        workOrderId,
        status,
        dispatchedBy,
        orderCompletedDate,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error updating dispatch status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update dispatch status",
      error: error.message,
    });
  } finally {
    connection.release();
  }
});

// @desc    Get dispatch statistics
// @route   GET /api/dispatch/statistics
// @access  Private
router.get("/statistics", authenticateToken, async (req, res) => {
  try {
    console.log("Fetching dispatch statistics...")

    // Get dispatch statistics for orders assigned to dispatch stage
    const [stats] = await db.execute(`
      SELECT 
        COUNT(CASE WHEN wo.status = 'completed' THEN 1 END) as totalReady,
        COUNT(CASE WHEN wo.status = 'dispatched' THEN 1 END) as totalDispatched,
        COUNT(CASE WHEN wo.status = 'dispatched' AND DATE(wo.completed_date) = CURDATE() THEN 1 END) as dispatchedToday,
        COUNT(CASE WHEN wo.status = 'dispatched' AND WEEK(wo.completed_date) = WEEK(CURDATE()) THEN 1 END) as dispatchedThisWeek,
        COUNT(CASE WHEN wo.status = 'dispatched' AND MONTH(wo.completed_date) = MONTH(CURDATE()) THEN 1 END) as dispatchedThisMonth
      FROM work_orders wo
      INNER JOIN worker_assignments wa ON wo.id = wa.work_order_id
      WHERE wa.stage_type = 'dispatch'
        AND wo.status IN ('completed', 'dispatched')
    `)

    const statistics = {
      totalReady: stats[0].totalReady || 0,
      totalDispatched: stats[0].totalDispatched || 0,
      dispatchedToday: stats[0].dispatchedToday || 0,
      dispatchedThisWeek: stats[0].dispatchedThisWeek || 0,
      dispatchedThisMonth: stats[0].dispatchedThisMonth || 0,
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

// @desc    Debug dispatch data
// @route   GET /api/dispatch/debug
// @access  Private
router.get("/debug", authenticateToken, async (req, res) => {
  try {
    // Check worker assignments
    const [assignments] = await db.execute(`
      SELECT wa.*, u.name as worker_name, wo.work_order_number
      FROM worker_assignments wa
      LEFT JOIN users u ON wa.user_id = u.id
      LEFT JOIN work_orders wo ON wa.work_order_id = wo.id
      WHERE wa.stage_type = 'dispatch'
    `)

    // Check work orders
    const [workOrders] = await db.execute(`
      SELECT id, work_order_number, party_name, status, gross_weight, net_weight
      FROM work_orders
      WHERE status IN ('completed', 'dispatched')
      LIMIT 10
    `)

    // Check stones data
    const [stones] = await db.execute(`
      SELECT s.*, wo.work_order_number
      FROM stones s
      LEFT JOIN work_orders wo ON s.work_order_id = wo.id
      WHERE wo.status IN ('completed', 'dispatched')
      LIMIT 10
    `)

    res.json({
      success: true,
      data: {
        assignments: assignments,
        workOrders: workOrders,
        stones: stones,
        assignmentCount: assignments.length,
        workOrderCount: workOrders.length,
        stoneCount: stones.length,
      },
    })
  } catch (error) {
    console.error("Error in debug route:", error)
    res.status(500).json({
      success: false,
      message: "Debug failed",
      error: error.message,
    })
  }
})

module.exports = router
