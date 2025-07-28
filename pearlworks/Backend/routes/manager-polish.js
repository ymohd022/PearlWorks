const express = require("express")
const router = express.Router()
const db = require("../config/database")
const { authenticateToken } = require("../middleware/auth")
const multer = require("multer")
const path = require("path")
const fs = require("fs")

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "../uploads")
    fs.mkdirSync(uploadPath, { recursive: true })
    cb(null, uploadPath)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname))
  },
})
const upload = multer({ storage: storage })

// Get polish orders assigned to polish stage (for manager)
router.get("/assigned-orders", authenticateToken, async (req, res) => {
  try {
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
        u.name as assigned_worker_name,
        GROUP_CONCAT(DISTINCT CONCAT(s.type, ':', s.pieces, ':', s.weight_grams, ':', s.weight_carats) SEPARATOR '|') as stones_info
      FROM work_orders wo
      JOIN worker_assignments wa ON wo.id = wa.work_order_id
      LEFT JOIN work_order_stages wos ON wo.id = wos.work_order_id AND wos.stage_name = 'polish'
      LEFT JOIN users u ON wa.user_id = u.id
      LEFT JOIN stones s ON wo.id = s.work_order_id
      WHERE wa.stage_type = 'polish'
        AND wo.status != 'cancelled'
      GROUP BY wo.id, wa.assigned_date, u.name
      ORDER BY wo.created_at DESC
    `

    const [orders] = await db.execute(query)

    const transformedOrders = orders.map((order) => ({
      id: order.id.toString(),
      workOrderNumber: order.work_order_number,
      partyName: order.party_name,
      poNumber: order.po_number,
      poDate: order.po_date,
      itemDetails: order.product_type || "N/A",
      descriptionOfWork: order.description_of_work,
      productType: order.product_type || "N/A",
      issueWeight: order.issue_weight || 0,
      jamahWeight: order.jamah_weight || 0,
      grossWeight: order.gross_weight || 0,
      netWeight: order.net_weight || 0,
      expectedCompletionDate: order.expected_completion_date,
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
      stones: parseStonesInfo(order.stones_info) || [],
    }))

    res.json({
      success: true,
      data: transformedOrders,
    })
  } catch (error) {
    console.error("Get polish orders error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch polish orders",
      error: error.message,
    })
  }
})

// Update polish stage status (manager)
router.put("/update-status/:workOrderId", upload.array("updateImages"), authenticateToken, async (req, res) => {
  const connection = await db.getConnection()

  try {
    await connection.beginTransaction()

    const workOrderId = req.params.workOrderId
    const { status, jamahWeight, notes, sortingIssue, sortingJamah, approved, karigarName, issueDate, jamahDate } =
      req.body

    // Handle uploaded images
    let newImagePaths = []
    if (req.files && req.files.length > 0) {
      newImagePaths = req.files.map((file) => `/uploads/${file.filename}`)
    }

    // Get work order details
    const [workOrder] = await connection.execute(
      "SELECT id, work_order_number, gross_weight, images FROM work_orders WHERE id = ?",
      [workOrderId],
    )

    if (workOrder.length === 0) {
      await connection.rollback()
      return res.status(404).json({
        success: false,
        message: "Work order not found",
      })
    }

    // Update images if new ones were uploaded
    let allImages = []
    if (workOrder[0].images) {
      try {
        allImages = JSON.parse(workOrder[0].images)
      } catch (e) {
        console.error("Error parsing existing images:", e)
      }
    }
    allImages = [...allImages, ...newImagePaths]

    await connection.execute("UPDATE work_orders SET images = ? WHERE id = ?", [JSON.stringify(allImages), workOrderId])

    // Check if polish stage exists
    const [existingStage] = await connection.execute(
      "SELECT id, issue_weight FROM work_order_stages WHERE work_order_id = ? AND stage_name = ?",
      [workOrderId, "polish"],
    )

    const currentDate = new Date()

    // Calculate weight difference
    let calculatedWeightDiff = 0
    if (jamahWeight && existingStage.length > 0) {
      const issueWeight = existingStage[0].issue_weight || workOrder[0].gross_weight || 0
      calculatedWeightDiff = Number.parseFloat(jamahWeight) - Number.parseFloat(issueWeight)
    }

    if (existingStage.length > 0) {
      // Update existing stage
      let updateQuery = `UPDATE work_order_stages SET 
        status = ?, 
        notes = ?, 
        updated_at = ?,
        karigar_name = ?`

      const updateParams = [status, notes || null, currentDate, karigarName || null]

      if (status === "in-progress" && !existingStage[0].issue_date) {
        updateQuery += ", issue_date = ?, issue_weight = ?"
        updateParams.push(issueDate || currentDate, workOrder[0].gross_weight || 0)
      }

      if (status === "completed" && jamahWeight) {
        updateQuery += ", jamah_date = ?, jamah_weight = ?, sorting_jamah = ?, approved = ?, weight_difference = ?"
        updateParams.push(
          jamahDate || currentDate,
          jamahWeight,
          sortingJamah || null,
          approved || false,
          calculatedWeightDiff,
        )
      }

      if (sortingIssue !== undefined) {
        updateQuery += ", sorting_issue = ?"
        updateParams.push(sortingIssue)
      }

      updateQuery += " WHERE id = ?"
      updateParams.push(existingStage[0].id)

      await connection.execute(updateQuery, updateParams)
    } else {
      // Create new polish stage
      await connection.execute(
        `INSERT INTO work_order_stages (
          work_order_id, stage_name, status, notes, 
          issue_weight, karigar_name, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          workOrderId,
          "polish",
          status,
          notes || null,
          workOrder[0].gross_weight || 0,
          karigarName || null,
          currentDate,
          currentDate,
        ],
      )
    }

    // Update overall work order status
    if (status === "completed") {
      await connection.execute("UPDATE work_orders SET status = 'completed', completed_date = ? WHERE id = ?", [
        currentDate,
        workOrderId,
      ])
    } else if (status === "in-progress") {
      await connection.execute("UPDATE work_orders SET status = 'in-progress' WHERE id = ?", [workOrderId])
    }

    // Add activity log
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
        `Polish stage ${status}`,
        req.user?.name || "Manager",
        req.user?.role || "manager",
        `Manager updated polish stage: ${activityDetails}`,
      ],
    )

    await connection.commit()

    res.json({
      success: true,
      message: `Polish stage updated successfully`,
    })
  } catch (error) {
    await connection.rollback()
    console.error("Update polish stage error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to update polish stage",
      error: error.message,
    })
  } finally {
    connection.release()
  }
})

// Get polish statistics for manager
router.get("/statistics", authenticateToken, async (req, res) => {
  try {
    const [stats] = await db.execute(`
      SELECT 
        COUNT(*) as total_orders,
        SUM(CASE WHEN wos.status = 'not-started' OR wos.status IS NULL THEN 1 ELSE 0 END) as pending_orders,
        SUM(CASE WHEN wos.status = 'in-progress' THEN 1 ELSE 0 END) as in_progress_orders,
        SUM(CASE WHEN wos.status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
        SUM(CASE WHEN wos.status = 'on-hold' THEN 1 ELSE 0 END) as on_hold_orders,
        AVG(CASE WHEN wos.weight_difference IS NOT NULL THEN wos.weight_difference ELSE 0 END) as avg_weight_difference,
        SUM(CASE WHEN wos.approved = 1 THEN 1 ELSE 0 END) as approved_orders,
        SUM(CASE WHEN wo.expected_completion_date < CURDATE() AND wos.status != 'completed' THEN 1 ELSE 0 END) as overdue_orders
      FROM work_orders wo
      JOIN worker_assignments wa ON wo.id = wa.work_order_id
      LEFT JOIN work_order_stages wos ON wo.id = wos.work_order_id AND wos.stage_name = 'polish'
      WHERE wa.stage_type = 'polish'
        AND wo.status != 'cancelled'
    `)

    // Get recent activities
    const [activities] = await db.execute(`
      SELECT 
        al.action,
        al.performed_by,
        al.details,
        al.created_at,
        wo.work_order_number
      FROM activity_logs al
      JOIN work_orders wo ON al.work_order_id = wo.id
      JOIN worker_assignments wa ON wo.id = wa.work_order_id
      WHERE wa.stage_type = 'polish'
        AND al.action LIKE '%polish%'
      ORDER BY al.created_at DESC
      LIMIT 10
    `)

    res.json({
      success: true,
      data: {
        totalOrders: stats[0].total_orders || 0,
        pendingOrders: stats[0].pending_orders || 0,
        inProgressOrders: stats[0].in_progress_orders || 0,
        completedOrders: stats[0].completed_orders || 0,
        onHoldOrders: stats[0].on_hold_orders || 0,
        avgWeightDifference: Number.parseFloat(stats[0].avg_weight_difference || 0).toFixed(3),
        approvedOrders: stats[0].approved_orders || 0,
        overdueOrders: stats[0].overdue_orders || 0,
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

// Helper function to parse stones info
function parseStonesInfo(stonesInfo) {
  if (!stonesInfo) return []

  try {
    return stonesInfo.split("|").map((stoneStr, index) => {
      const [type, pieces, weightGrams, weightCarats] = stoneStr.split(":")
      return {
        id: `stone_${index}`,
        type: type || "Unknown",
        pieces: Number.parseInt(pieces) || 0,
        weightGrams: Number.parseFloat(weightGrams) || 0,
        weightCarats: Number.parseFloat(weightCarats) || 0,
      }
    })
  } catch (error) {
    console.error("Error parsing stones info:", error)
    return []
  }
}

module.exports = router
