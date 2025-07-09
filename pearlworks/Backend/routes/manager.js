const express = require("express")
const { body, validationResult } = require("express-validator")
const db = require("../config/database")
const { authenticateToken } = require("../middleware/auth")
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "../uploads");
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage: storage });

const router = express.Router()

// Get all work orders for manager (with detailed information)
router.get("/work-orders", authenticateToken, async (req, res) => {
  try {
    const { status, stage, workerId } = req.query

    let query = `
      SELECT 
        wo.id,
        wo.work_order_number,
        wo.party_name,
        wo.po_number,
        wo.po_date,
        wo.item_details,
        wo.model_number,
        wo.description_of_work,
        wo.status,
        wo.created_at,
        wo.expected_completion_date,
        wo.completed_date,
        wo.gross_weight,
        wo.net_weight,
        wo.dispatched_by,
        GROUP_CONCAT(DISTINCT CONCAT(wos.stage_name, ':', wos.status, ':', COALESCE(wos.karigar_name, ''), ':', COALESCE(wos.issue_weight, 0), ':', COALESCE(wos.jamah_weight, 0)) SEPARATOR '|') as stages_info,
        GROUP_CONCAT(DISTINCT CONCAT(s.type, ':', s.pieces, ':', s.weight_grams, ':', s.weight_carats, ':', s.is_received) SEPARATOR '|') as stones_info,
        GROUP_CONCAT(DISTINCT CONCAT(wa.stage_type, ':', wa.user_id, ':', u.name, ':', wa.assigned_date) SEPARATOR '|') as assignments_info
      FROM work_orders wo
      LEFT JOIN work_order_stages wos ON wo.id = wos.work_order_id
      LEFT JOIN stones s ON wo.id = s.work_order_id
      LEFT JOIN worker_assignments wa ON wo.id = wa.work_order_id
      LEFT JOIN users u ON wa.user_id = u.id
      WHERE 1=1
    `

    const params = []

    if (status) {
      query += " AND wo.status = ?"
      params.push(status)
    }

    if (stage) {
      query +=
        " AND EXISTS (SELECT 1 FROM work_order_stages wos2 WHERE wos2.work_order_id = wo.id AND wos2.stage_name = ?)"
      params.push(stage)
    }

    if (workerId) {
      query += " AND EXISTS (SELECT 1 FROM worker_assignments wa2 WHERE wa2.work_order_id = wo.id AND wa2.user_id = ?)"
      params.push(workerId)
    }

    query += " GROUP BY wo.id ORDER BY wo.created_at DESC"

    const [orders] = await db.execute(query, params)

    // Transform the data to match frontend interface
    const transformedOrders = orders.map((order) => ({
      id: order.id.toString(),
      workOrderNumber: order.work_order_number,
      partyName: order.party_name,
      poNumber: order.po_number,
      poDate: order.po_date,
      itemDetails: order.item_details,
      modelNumber: order.model_number,
      descriptionOfWork: order.description_of_work,
      status: order.status,
      createdDate: order.created_at,
      expectedCompletionDate: order.expected_completion_date,
      completedDate: order.completed_date,
      grossWeight: order.gross_weight,
      netWeight: order.net_weight,
      dispatchedBy: order.dispatched_by,
      stages: parseStagesInfo(order.stages_info),
      stones: parseStonesInfo(order.stones_info),
      assignedWorkers: parseAssignmentsInfo(order.assignments_info),
    }))

    res.json({
      success: true,
      data: transformedOrders,
    })
  } catch (error) {
    console.error("Get manager work orders error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch work orders",
      error: error.message,
    })
  }
})

// Get stage-specific orders for manager - FIXED ENDPOINT
router.get("/assigned-orders/:stage", authenticateToken, async (req, res) => {
  try {
    const stage = req.params.stage

    const query = `
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
        wos.weight_difference,
        wa.assigned_date,
        u.name as assigned_worker,
        GROUP_CONCAT(DISTINCT CONCAT(s.type, ':', s.pieces, ':', s.weight_grams, ':', s.weight_carats) SEPARATOR '|') as stones_info
      FROM work_orders wo
      JOIN worker_assignments wa ON wo.id = wa.work_order_id
      LEFT JOIN work_order_stages wos ON wo.id = wos.work_order_id AND wos.stage_name = ?
      LEFT JOIN users u ON wa.user_id = u.id
      LEFT JOIN stones s ON wo.id = s.work_order_id
      WHERE wa.stage_type = ?
      GROUP BY wo.id, wa.assigned_date, u.name
      ORDER BY wo.created_at DESC
    `

    const [orders] = await db.execute(query, [stage, stage])

    const transformedOrders = orders.map((order) => ({
      id: order.id.toString(),
      workOrderNumber: order.work_order_number,
      partyName: order.party_name,
      productType: order.product_type || "N/A",
      issueWeight: order.issue_weight || 0,
      jamahWeight: order.jamah_weight || 0,
      assignedDate: order.assigned_date,
      status: order.status || "not-started",
      currentStage: stage,
      notes: order.notes || "",
      expectedCompletionDate: order.expected_completion_date,
      issueDate: order.issue_date,
      jamahDate: order.jamah_date,
      sortingIssue: order.sorting_issue || 0,
      sortingJamah: order.sorting_jamah || 0,
      approved: order.approved || false,
      weightDifference: order.weight_difference || 0,
      assignedWorker: order.assigned_worker || "Unassigned",
      stones: parseStonesInfo(order.stones_info) || [],
    }))

    res.json({
      success: true,
      data: transformedOrders,
    })
  } catch (error) {
    console.error(`Get ${req.params.stage} orders error:`, error)
    res.status(500).json({
      success: false,
      message: `Failed to fetch ${req.params.stage} orders`,
      error: error.message,
    })
  }
})

// Update stage status (manager can update any stage)
// Update stage status (manager can update any stage)
router.put(
  "/update-stage/:workOrderId",
  upload.array('updateImages'), // Handle file uploads
  [
    authenticateToken,
    body("stage").isIn(["framing", "setting", "polish", "repair", "dispatch"]),
    body("status").isIn(["not-started", "in-progress", "completed", "on-hold"]),
    body("jamahWeight").optional().isNumeric(),
    body("sortingIssue").optional().isNumeric(),
    body("sortingJamah").optional().isNumeric(),
  ],
  async (req, res) => {
    const connection = await db.getConnection();

    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      await connection.beginTransaction();

      const workOrderId = req.params.workOrderId;
      // Parse form data values
      const stage = req.body.stage;
      const status = req.body.status;
      const jamahWeight = req.body.jamahWeight ? parseFloat(req.body.jamahWeight) : null;
      const notes = req.body.notes;
      const sortingIssue = req.body.sortingIssue ? parseInt(req.body.sortingIssue) : null;
      const sortingJamah = req.body.sortingJamah ? parseInt(req.body.sortingJamah) : null;
      const approved = req.body.approved === 'true';

      // Handle uploaded images
      let newImagePaths = [];
      if (req.files && req.files.length > 0) {
        newImagePaths = req.files.map((file) => `/uploads/${file.filename}`);
      }

      // Get work order details
      const [workOrder] = await connection.execute(
        "SELECT id, work_order_number, gross_weight, status AS currentStatus, images FROM work_orders WHERE id = ?",
        [workOrderId]
      );

      if (workOrder.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: "Work order not found",
        });
      }

      // Update images if new ones were uploaded
      let allImages = [];
      if (workOrder[0].images) {
        try {
          allImages = JSON.parse(workOrder[0].images);
        } catch (e) {
          console.error("Error parsing existing images:", e);
        }
      }
      allImages = [...allImages, ...newImagePaths];
      
      // Update work order images
      await connection.execute(
        "UPDATE work_orders SET images = ? WHERE id = ?",
        [JSON.stringify(allImages), workOrderId]
      );

      // Check if stage exists
      const [existingStage] = await connection.execute(
        "SELECT id, issue_weight FROM work_order_stages WHERE work_order_id = ? AND stage_name = ?",
        [workOrderId, stage]
      )
      const currentDate = new Date()

      if (existingStage.length > 0) {
        // Update existing stage
        let updateQuery = "UPDATE work_order_stages SET status = ?, notes = ?, updated_at = ?"
        const updateParams = [status, notes || null, currentDate]

        if (status === "in-progress" && !existingStage[0].issue_date) {
          updateQuery += ", issue_date = ?, issue_weight = ?"
          updateParams.push(currentDate, workOrder[0].gross_weight || 0)
        }

        if (status === "completed" && jamahWeight) {
          updateQuery += ", jamah_date = ?, jamah_weight = ?, sorting_jamah = ?, approved = ?"
          updateParams.push(currentDate, jamahWeight, sortingJamah || null, approved || false)

          // Calculate weight difference
          const issueWeight = existingStage[0].issue_weight || workOrder[0].gross_weight || 0
          updateQuery += ", weight_difference = ?"
          updateParams.push(jamahWeight - issueWeight)
        }

        if (sortingIssue !== undefined) {
          updateQuery += ", sorting_issue = ?"
          updateParams.push(sortingIssue)
        }

        updateQuery += " WHERE id = ?"
        updateParams.push(existingStage[0].id)

        await connection.execute(updateQuery, updateParams)
      } else {
    // Only create new record for in-progress if it doesn't exist
    if (status === "in-progress") {
        await connection.execute(
            `INSERT INTO work_order_stages (
                work_order_id, stage_name, status, notes, 
                issue_weight, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                workOrderId,
                stage,
                status,
                notes || null,
                workOrder[0].gross_weight || 0,
                currentDate,
                currentDate
            ]
        );
    } else {
        // For other statuses, only create record if not exists
        await connection.execute(
            `INSERT INTO work_order_stages (
                work_order_id, stage_name, status, notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
            [workOrderId, stage, status, notes || null, currentDate, currentDate]
        );
    }
}

      // Update overall work order status if needed - FIXED: update existing record
      if (status === "completed") {
        // Check if all stages are completed
        const [stageCount] = await connection.execute(
          "SELECT COUNT(*) as total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed FROM work_order_stages WHERE work_order_id = ?",
          [workOrderId]  // FIXED: use existing workOrderId
        )

        if (stageCount[0].total > 0 && stageCount[0].completed === stageCount[0].total) {
          // Only update to completed if all stages are done
          await connection.execute(
            "UPDATE work_orders SET status = 'completed', completed_date = ? WHERE id = ?",
            [currentDate, workOrderId]  // FIXED: update existing record
          )
        } else if (workOrder[0].currentStatus !== "in-progress") {
          // Otherwise, mark as in-progress if not already
          await connection.execute(
            "UPDATE work_orders SET status = 'in-progress' WHERE id = ?",
            [workOrderId]  // FIXED: update existing record
          )
        }
      } else if (status === "in-progress" && workOrder[0].currentStatus !== "in-progress") {
        // Mark as in-progress if stage is set to in-progress and work order wasn't already
        await connection.execute(
          "UPDATE work_orders SET status = 'in-progress' WHERE id = ?",
          [workOrderId]  // FIXED: update existing record
        )
      }

      // Add activity log - FIXED: reference existing work order
      await connection.execute(
        `INSERT INTO activity_logs (work_order_id, work_order_number, action, performed_by, performed_by_role, details)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          workOrderId,  // FIXED: existing work order ID
          workOrder[0].work_order_number,
          `${stage} stage ${status}`,
          req.user?.name || "Manager",
          req.user?.role || "manager",
          `Manager updated ${stage} stage to ${status}${jamahWeight ? ` with jamah weight ${jamahWeight}g` : ""}`,
        ]
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
        error: error.message,
      })
    } finally {
      connection.release()
    }
  }
)

// Get manager dashboard statistics
router.get("/statistics", authenticateToken, async (req, res) => {
  try {
    const [stats] = await db.execute(`
      SELECT 
        COUNT(*) as total_orders,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
        SUM(CASE WHEN status = 'in-progress' THEN 1 ELSE 0 END) as in_progress_orders,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
        SUM(CASE WHEN status = 'dispatched' THEN 1 ELSE 0 END) as dispatched_orders
      FROM work_orders
    `)

    const [stageStats] = await db.execute(`
      SELECT 
        stage_name,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'in-progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'not-started' THEN 1 ELSE 0 END) as not_started
      FROM work_order_stages
      GROUP BY stage_name
    `)

    res.json({
      success: true,
      data: {
        overview: stats[0] || {},
        stages: stageStats || [],
      },
    })
  } catch (error) {
    console.error("Get manager statistics error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch statistics",
      error: error.message,
    })
  }
})

// Helper functions
function parseStagesInfo(stagesInfo) {
  if (!stagesInfo) return []

  try {
    return stagesInfo.split("|").map((stageStr) => {
      const [stageName, status, karigar, issueWeight, jamahWeight] = stageStr.split(":")
      return {
        id: `${stageName}_stage`,
        stageName,
        status: status || "not-started",
        karigar: karigar || null,
        issueWeight: Number.parseFloat(issueWeight) || 0,
        jamahWeight: Number.parseFloat(jamahWeight) || 0,
        approved: false,
      }
    })
  } catch (error) {
    console.error("Error parsing stages info:", error)
    return []
  }
}

function parseStonesInfo(stonesInfo) {
  if (!stonesInfo) return []

  try {
    return stonesInfo.split("|").map((stoneStr, index) => {
      const [type, pieces, weightGrams, weightCarats, isReceived] = stoneStr.split(":")
      return {
        id: `stone_${index}`,
        type: type || "Unknown",
        pieces: Number.parseInt(pieces) || 0,
        weightGrams: Number.parseFloat(weightGrams) || 0,
        weightCarats: Number.parseFloat(weightCarats) || 0,
        isReceived: isReceived === "1",
        isReturned: false,
      }
    })
  } catch (error) {
    console.error("Error parsing stones info:", error)
    return []
  }
}

function parseAssignmentsInfo(assignmentsInfo) {
  if (!assignmentsInfo) return []

  try {
    return assignmentsInfo.split("|").map((assignmentStr) => {
      const [stageType, workerId, workerName, assignedDate] = assignmentStr.split(":")
      return {
        stageType: stageType || "unknown",
        workerId: workerId || "",
        workerName: workerName || "Unassigned",
        assignedDate: assignedDate ? new Date(assignedDate) : new Date(),
      }
    })
  } catch (error) {
    console.error("Error parsing assignments info:", error)
    return []
  }
}

module.exports = router
