const express = require("express")
const { body, validationResult } = require("express-validator")
const db = require("../config/database")
const { authenticateToken, authorizeRoles } = require("../middleware/auth")
const router = express.Router()

const fs = require("fs")
const path = require("path")
const multer = require("multer")

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "../uploads")
    // Create the directory if it doesn't exist
    fs.mkdirSync(uploadPath, { recursive: true })
    cb(null, uploadPath)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname))
  },
})
const upload = multer({ storage: storage })
// Get assigned work orders for framing
router.get("/assigned-orders", authenticateToken, authorizeRoles("framing", "admin", "manager"), async (req, res) => {
  try {
    const userId = req.user.id
    const userRole = req.user.role

    let query = `
      SELECT 
        wo.id,
        wo.work_order_number,
        wo.party_name,
        wo.item_details as product_type,
        wo.expected_completion_date,
        wo.created_at,
        wos.issue_weight,
        wos.jamah_weight,
        wos.status,
        wos.notes,
        wos.issue_date,
        wos.jamah_date,
        wos.sorting_issue,
        wos.sorting_jamah,
        wos.approved,
        wa.assigned_date,
        u.name as assigned_worker_name,
        u.email as assigned_worker_email
      FROM work_orders wo
      JOIN worker_assignments wa ON wo.id = wa.work_order_id
      LEFT JOIN work_order_stages wos ON wo.id = wos.work_order_id AND wos.stage_name = 'framing'
      LEFT JOIN users u ON wa.user_id = u.id
      WHERE wa.stage_type = 'framing'
    `

    const params = []

    // If user is framing worker, only show their assigned orders
    if (userRole === "framing") {
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
      issueWeight: order.issue_weight,
      jamahWeight: order.jamah_weight,
      assignedDate: order.assigned_date,
      status: order.status || "not-started",
      currentStage: "framing",
      notes: order.notes,
      expectedCompletionDate: order.expected_completion_date,
      issueDate: order.issue_date,
      jamahDate: order.jamah_date,
      sortingIssue: order.sorting_issue,
      sortingJamah: order.sorting_jamah,
      approved: order.approved || false,
      assignedWorkerName: order.assigned_worker_name || "Unassigned",
      assignedWorkerEmail: order.assigned_worker_email || "",
    }))

    res.json({
      success: true,
      data: transformedOrders,
    })
  } catch (error) {
    console.error("Get framing orders error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch assigned orders",
    })
  }
})

// Update framing stage status
router.put("/update-status/:workOrderId", authenticateToken, upload.array("updateImages", 5), async (req, res) => {
  const connection = await db.getConnection()

  try {
    await connection.beginTransaction()

    const { workOrderId } = req.params
    const { status, jamahWeight, sortingIssue, sortingJamah, notes, approved, addedStones } = req.body

    // Handle uploaded images
    let newImagePaths = []
    if (req.files && req.files.length > 0) {
      newImagePaths = req.files.map((file) => `/uploads/${file.filename}`)
    }

    // Get existing images
    const [existingOrder] = await connection.execute("SELECT images FROM work_orders WHERE id = ?", [workOrderId])

    let allImages = []
    if (existingOrder.length > 0 && existingOrder[0].images) {
      try {
        allImages = JSON.parse(existingOrder[0].images)
      } catch (e) {
        console.error("Error parsing existing images:", e)
      }
    }

    // Combine existing and new images
    allImages = [...allImages, ...newImagePaths]

    // Update work order with new status and images
    await connection.execute(
      `UPDATE work_orders SET 
        status = ?, 
        net_weight = ?, 
        images = ?,
        updated_at = NOW() 
       WHERE id = ?`,
      [status, jamahWeight || null, JSON.stringify(allImages), workOrderId],
    )

    // Insert or update framing stage record
    await connection.execute(
      `INSERT INTO work_order_stages (
        work_order_id, stage_name, status, jamah_weight, sorting_issue, 
        sorting_jamah, notes, approved, updated_at
      ) VALUES (?, 'framing', ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        jamah_weight = VALUES(jamah_weight),
        sorting_issue = VALUES(sorting_issue),
        sorting_jamah = VALUES(sorting_jamah),
        notes = VALUES(notes),
        approved = VALUES(approved),
        updated_at = NOW()`,
      [workOrderId, status, jamahWeight || 0, sortingIssue || 0, sortingJamah || 0, notes || "", approved ? 1 : 0],
    )

    // Handle added stones if provided
    if (addedStones) {
      let parsedStones = []
      try {
        parsedStones = typeof addedStones === "string" ? JSON.parse(addedStones) : addedStones
      } catch (e) {
        console.error("Error parsing added stones:", e)
      }

      if (parsedStones && parsedStones.length > 0) {
        for (const stone of parsedStones) {
          await connection.execute(
            `INSERT INTO stones (work_order_id, type, pieces, weight_grams, weight_carats, is_received, stage_added) 
             VALUES (?, ?, ?, ?, ?, 1, 'framing')`,
            [workOrderId, stone.type, stone.pieces, stone.weightGrams, stone.weightCarats],
          )
        }
      }
    }

    // Get work order number for activity log
    const [workOrder] = await connection.execute("SELECT work_order_number FROM work_orders WHERE id = ?", [
      workOrderId,
    ])

    // Add activity log
    await connection.execute(
      `INSERT INTO activity_logs (work_order_id, work_order_number, action, performed_by, performed_by_role, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        workOrderId,
        workOrder[0]?.work_order_number || "Unknown",
        "Framing stage updated",
        req.user?.name || "System",
        req.user?.role || "framing",
        `Status: ${status}${newImagePaths.length > 0 ? `, ${newImagePaths.length} images added` : ""}${notes ? `, Notes: ${notes}` : ""}`,
      ],
    )

    await connection.commit()

    res.json({
      success: true,
      message: "Framing stage updated successfully",
      data: {
        workOrderId,
        status,
        jamahWeight,
        images: allImages,
        notes,
      },
    })
  } catch (error) {
    await connection.rollback()
    console.error("Error updating framing stage:", error)

    // Clean up uploaded files on error
    if (req.files && req.files.length > 0) {
      req.files.forEach((file) => {
        const filePath = path.join(__dirname, "../uploads", file.filename)
        fs.unlink(filePath, (err) => {
          if (err) console.error("Error deleting file:", filePath, err)
        })
      })
    }

    res.status(500).json({
      success: false,
      message: "Failed to update framing stage",
      error: error.message,
    })
  } finally {
    connection.release()
  }
})

// Get framing stage details for a specific work order
router.get(
  "/details/:workOrderId",
  authenticateToken,
  authorizeRoles("framing", "admin", "manager"),
  async (req, res) => {
    try {
      const workOrderId = req.params.workOrderId

      const [stageDetails] = await db.execute(
        `
      SELECT 
        wos.*,
        wo.work_order_number,
        wo.party_name,
        wo.item_details,
        wo.expected_completion_date
      FROM work_order_stages wos
      JOIN work_orders wo ON wos.work_order_id = wo.id
      WHERE wos.work_order_id = ? AND wos.stage_name = 'framing'
    `,
        [workOrderId],
      )

      if (stageDetails.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Framing stage not found",
        })
      }

      res.json({
        success: true,
        data: stageDetails[0],
      })
    } catch (error) {
      console.error("Get framing details error:", error)
      res.status(500).json({
        success: false,
        message: "Failed to fetch framing details",
      })
    }
  },
)

// Get framing statistics for dashboard
router.get("/statistics", authenticateToken, authorizeRoles("framing", "admin", "manager"), async (req, res) => {
  try {
    const userId = req.user.id
    const userRole = req.user.role

    let whereClause = "WHERE wa.stage_type = 'framing'"
    const params = []

    if (userRole === "framing") {
      whereClause += " AND wa.user_id = ?"
      params.push(userId)
    }

    const [stats] = await db.execute(
      `
      SELECT 
        COUNT(*) as total_orders,
        SUM(CASE WHEN wos.status = 'not-started' OR wos.status IS NULL THEN 1 ELSE 0 END) as pending_orders,
        SUM(CASE WHEN wos.status = 'in-progress' THEN 1 ELSE 0 END) as in_progress_orders,
        SUM(CASE WHEN wos.status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
        SUM(CASE WHEN wos.status = 'on-hold' THEN 1 ELSE 0 END) as on_hold_orders,
        AVG(CASE WHEN wos.weight_difference IS NOT NULL THEN wos.weight_difference ELSE 0 END) as avg_weight_difference
      FROM work_orders wo
      JOIN worker_assignments wa ON wo.id = wa.work_order_id
      LEFT JOIN work_order_stages wos ON wo.id = wos.work_order_id AND wos.stage_name = 'framing'
      ${whereClause}
    `,
      params,
    )

    res.json({
      success: true,
      data: stats[0],
    })
  } catch (error) {
    console.error("Get framing statistics error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch statistics",
    })
  }
})

module.exports = router
