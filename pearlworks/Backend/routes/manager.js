const express = require("express")
const { body, validationResult } = require("express-validator")
const db = require("../config/database")
const { authenticateToken, authorizeRoles } = require("../middleware/auth")

const router = express.Router()

// Get all work orders for manager (with detailed information)
router.get("/work-orders", authenticateToken,  async (req, res) => {
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
    })
  }
})

// Get stage-specific orders for manager
router.get("/stage-orders/:stage", authenticateToken, async (req, res) => {
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
        u.name as assigned_worker
      FROM work_orders wo
      JOIN worker_assignments wa ON wo.id = wa.work_order_id
      LEFT JOIN work_order_stages wos ON wo.id = wos.work_order_id AND wos.stage_name = ?
      LEFT JOIN users u ON wa.user_id = u.id
      WHERE wa.stage_type = ?
      ORDER BY wo.created_at DESC
    `

    const [orders] = await db.execute(query, [stage, stage])

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
      weightDifference: order.weight_difference,
      assignedWorker: order.assigned_worker,
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
    })
  }
})

// Update stage status (manager can update any stage)
router.put(
  "/update-stage/:workOrderId",
  [
    authenticateToken,
    body("stage").isIn(["framing", "setting", "polish", "repair", "dispatch"]),
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
          `INSERT INTO work_order_stages (
            work_order_id, stage_name, karigar_name, status, issue_date, 
            issue_weight, jamah_date, jamah_weight, sorting_issue, sorting_jamah, 
            weight_difference, approved, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          insertParams,
        )
      }

      // Update overall work order status if needed
      if (status === "completed") {
        // Check if all stages are completed
        const [stageCount] = await connection.execute(
          "SELECT COUNT(*) as total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed FROM work_order_stages WHERE work_order_id = ?",
          [workOrderId],
        )

        if (stageCount[0].total > 0 && stageCount[0].completed === stageCount[0].total) {
          await connection.execute("UPDATE work_orders SET status = 'completed', completed_date = ? WHERE id = ?", [
            currentDate,
            workOrderId,
          ])
        } else {
          await connection.execute("UPDATE work_orders SET status = 'in-progress' WHERE id = ?", [workOrderId])
        }
      }

      // Add activity log
      await connection.execute(
        `INSERT INTO activity_logs (work_order_id, work_order_number, action, performed_by, performed_by_role, details)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          workOrderId,
          workOrder[0].work_order_number,
          `${stage} stage ${status}`,
          req.user.name,
          req.user.role,
          `Manager updated ${stage} stage to ${status}${jamahWeight ? ` with jamah weight ${jamahWeight}g` : ""}`,
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
        overview: stats[0],
        stages: stageStats,
      },
    })
  } catch (error) {
    console.error("Get manager statistics error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch statistics",
    })
  }
})

// Helper functions
function parseStagesInfo(stagesInfo) {
  if (!stagesInfo) return []

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
}

function parseStonesInfo(stonesInfo) {
  if (!stonesInfo) return []

  return stonesInfo.split("|").map((stoneStr, index) => {
    const [type, pieces, weightGrams, weightCarats, isReceived] = stoneStr.split(":")
    return {
      id: `stone_${index}`,
      type,
      pieces: Number.parseInt(pieces) || 0,
      weightGrams: Number.parseFloat(weightGrams) || 0,
      weightCarats: Number.parseFloat(weightCarats) || 0,
      isReceived: isReceived === "1",
      isReturned: false,
    }
  })
}

function parseAssignmentsInfo(assignmentsInfo) {
  if (!assignmentsInfo) return []

  return assignmentsInfo.split("|").map((assignmentStr) => {
    const [stageType, workerId, workerName, assignedDate] = assignmentStr.split(":")
    return {
      stageType,
      workerId,
      workerName,
      assignedDate: new Date(assignedDate),
    }
  })
}

module.exports = router
