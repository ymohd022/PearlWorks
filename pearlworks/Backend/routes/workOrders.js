const express = require("express")
const router = express.Router()
const db = require("../config/database")
const { authenticateToken } = require("../middleware/auth")
const upload = require("../middleware/upload")
const fs = require("fs")
const path = require("path")
const multer = require("multer")
// Get next work order number - NEW ENDPOINT

// Configure multer for file uploads
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

// const upload = multer({ storage: storage })



router.get("/next-number", authenticateToken, async (req, res) => {
  try {
    // Get the latest work order number
    const [rows] = await db.execute("SELECT work_order_number FROM work_orders ORDER BY id DESC LIMIT 1")

    let nextNumber = "WO001"

    if (rows.length > 0 && rows[0].work_order_number) {
      const lastNumber = rows[0].work_order_number
      // Extract number from WO001, WO002, etc.
      const match = lastNumber.match(/WO(\d+)/)
      if (match) {
        const lastNum = Number.parseInt(match[1])
        const nextNum = lastNum + 1
        nextNumber = `WO${nextNum.toString().padStart(3, "0")}`
      }
    }

    res.json({
      success: true,
      workOrderNumber: nextNumber,
    })
  } catch (error) {
    console.error("Error generating work order number:", error)
    res.status(500).json({
      success: false,
      message: "Failed to generate work order number",
      error: error.message,
    })
  }
})

// Get all work orders
router.get("/", authenticateToken, async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT 
        wo.*,
        GROUP_CONCAT(DISTINCT CONCAT(wos.stage_name, ':', wos.status) SEPARATOR '|') as stages_info,
        GROUP_CONCAT(DISTINCT CONCAT(wa.stage_type, ':', wa.user_id, ':', u.name) SEPARATOR '|') as assignments_info
      FROM work_orders wo
      LEFT JOIN work_order_stages wos ON wo.id = wos.work_order_id
      LEFT JOIN worker_assignments wa ON wo.id = wa.work_order_id
      LEFT JOIN users u ON wa.user_id = u.id
      GROUP BY wo.id
      ORDER BY wo.created_at DESC
    `)

    // Transform data to match frontend interface
    const transformedOrders = rows.map((order) => ({
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
      grossWeight: order.gross_weight || 0,
      netWeight: order.net_weight || 0,
      dispatchedBy: order.dispatched_by,
      stages: parseStagesInfo(order.stages_info),
      stones: [], // Will be populated separately if needed
      assignedWorkers: parseAssignmentsInfo(order.assignments_info),
    }))

    res.json({
      success: true,
      data: transformedOrders,
    })
  } catch (error) {
    console.error("Error fetching work orders:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch work orders",
      error: error.message,
    })
  }
})

// Create a new work order with file upload support - FIXED
router.post("/", authenticateToken, upload.array("images", 5), async (req, res) => {
  const connection = await db.getConnection()

  try {
    await connection.beginTransaction()

    const { partyName, poNumber, poDate, itemDetails, modelNumber, descriptionOfWork, expectedCompletionDate } =
      req.body

    // Parse stones and assignedWorkers from JSON strings
    let stones = []
    let assignedWorkers = []

    try {
      stones = req.body.stones ? JSON.parse(req.body.stones) : []
    } catch (e) {
      console.error("Error parsing stones:", e)
    }

    try {
      assignedWorkers = req.body.assignedWorkers ? JSON.parse(req.body.assignedWorkers) : []
    } catch (e) {
      console.error("Error parsing assignedWorkers:", e)
    }

    // Handle uploaded images
    let imagePaths = []
    if (req.files && req.files.length > 0) {
      imagePaths = req.files.map((file) => `/uploads/${file.filename}`)
    }

    // Generate work order number
    const [lastOrder] = await connection.execute("SELECT work_order_number FROM work_orders ORDER BY id DESC LIMIT 1")

    let workOrderNumber = "WO001"
    if (lastOrder.length > 0 && lastOrder[0].work_order_number) {
      const lastNumber = lastOrder[0].work_order_number
      const match = lastNumber.match(/WO(\d+)/)
      if (match) {
        const lastNum = Number.parseInt(match[1])
        const nextNum = lastNum + 1
        workOrderNumber = `WO${nextNum.toString().padStart(3, "0")}`
      }
    }

    // Insert work order with images
    const [result] = await connection.execute(
      `INSERT INTO work_orders (
        work_order_number, party_name, po_number, po_date, item_details, 
        model_number, description_of_work, status, expected_completion_date, 
        images, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        workOrderNumber,
        partyName,
        poNumber || null,
        poDate || null,
        itemDetails,
        modelNumber || null,
        descriptionOfWork || null,
        "pending",
        expectedCompletionDate || null,
        imagePaths.length > 0 ? JSON.stringify(imagePaths) : null,
        req.user?.id || 1,
      ],
    )

    const workOrderId = result.insertId

    // Insert stones if provided
    if (stones && stones.length > 0) {
      for (const stone of stones) {
        await connection.execute(
          `INSERT INTO stones (work_order_id, type, pieces, weight_grams, weight_carats, is_received) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [workOrderId, stone.type, stone.pieces, stone.weightGrams, stone.weightCarats, stone.isReceived ? 1 : 0],
        )
      }
    }

    // Insert worker assignments if provided
    if (assignedWorkers && assignedWorkers.length > 0) {
      for (const assignment of assignedWorkers) {
        await connection.execute(
          `INSERT INTO worker_assignments (work_order_id, user_id, stage_type, assigned_date, assigned_by) 
           VALUES (?, ?, ?, NOW(), ?)`,
          [workOrderId, assignment.workerId, assignment.stageType, req.user?.id || 1],
        )
      }
    }

    // Add activity log
    await connection.execute(
      `INSERT INTO activity_logs (work_order_id, work_order_number, action, performed_by, performed_by_role, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        workOrderId,
        workOrderNumber,
        "Work order created",
        req.user?.name || "System",
        req.user?.role || "manager",
        `Work order ${workOrderNumber} created for ${partyName} with ${imagePaths.length} images`,
      ],
    )

    await connection.commit()

    res.status(201).json({
      success: true,
      message: "Work order created successfully",
      data: {
        id: workOrderId,
        workOrderNumber,
        partyName,
        poNumber,
        poDate,
        itemDetails,
        modelNumber,
        descriptionOfWork,
        status: "pending",
        expectedCompletionDate,
        images: imagePaths,
        stones,
        assignedWorkers,
      },
    })
  } catch (error) {
    await connection.rollback()
    console.error("Error creating work order:", error)

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
      message: "Failed to create work order",
      error: error.message,
    })
  } finally {
    connection.release()
  }
})

// Assign workers to work order - NEW ENDPOINT
router.put("/:id/assign-workers", authenticateToken, async (req, res) => {
  const connection = await db.getConnection()

  try {
    await connection.beginTransaction()

    const workOrderId = req.params.id
    const { assignments } = req.body

    // Get work order details
    const [workOrder] = await connection.execute("SELECT work_order_number, party_name FROM work_orders WHERE id = ?", [
      workOrderId,
    ])

    if (workOrder.length === 0) {
      await connection.rollback()
      return res.status(404).json({
        success: false,
        message: "Work order not found",
      })
    }

    // Delete existing assignments
    await connection.execute("DELETE FROM worker_assignments WHERE work_order_id = ?", [workOrderId])

    // Insert new assignments
    for (const assignment of assignments) {
      await connection.execute(
        `INSERT INTO worker_assignments (work_order_id, user_id, stage_type, assigned_date, assigned_by) 
         VALUES (?, ?, ?, NOW(), ?)`,
        [workOrderId, assignment.workerId, assignment.stageType, req.user?.id || 1],
      )
    }

    // Add activity log
    await connection.execute(
      `INSERT INTO activity_logs (work_order_id, work_order_number, action, performed_by, performed_by_role, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        workOrderId,
        workOrder[0].work_order_number,
        "Workers assigned",
        req.user?.name || "System",
        req.user?.role || "manager",
        `Workers assigned to ${assignments.length} stages`,
      ],
    )

    await connection.commit()

    res.json({
      success: true,
      message: "Workers assigned successfully",
      data: {
        id: workOrderId,
        workOrderNumber: workOrder[0].work_order_number,
        partyName: workOrder[0].party_name,
        assignedWorkers: assignments,
      },
    })
  } catch (error) {
    await connection.rollback()
    console.error("Error assigning workers:", error)
    res.status(500).json({
      success: false,
      message: "Failed to assign workers",
      error: error.message,
    })
  } finally {
    connection.release()
  }
})

// Get a single work order by ID
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const [rows] = await db.execute("SELECT * FROM work_orders WHERE id = ?", [id])

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Work order not found",
      })
    }

    res.json({
      success: true,
      data: rows[0],
    })
  } catch (error) {
    console.error("Error fetching work order:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch work order",
      error: error.message,
    })
  }
})

// Update a work order
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const { partyName, poNumber, poDate, itemDetails, modelNumber, descriptionOfWork, status, expectedCompletionDate } =
      req.body

    const [result] = await db.execute(
      `UPDATE work_orders SET 
        party_name = ?, po_number = ?, po_date = ?, item_details = ?, 
        model_number = ?, description_of_work = ?, status = ?, 
        expected_completion_date = ?, updated_at = NOW()
       WHERE id = ?`,
      [partyName, poNumber, poDate, itemDetails, modelNumber, descriptionOfWork, status, expectedCompletionDate, id],
    )

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Work order not found",
      })
    }

    res.json({
      success: true,
      message: "Work order updated successfully",
      data: {
        id,
        partyName,
        poNumber,
        poDate,
        itemDetails,
        modelNumber,
        descriptionOfWork,
        status,
        expectedCompletionDate,
      },
    })
  } catch (error) {
    console.error("Error updating work order:", error)
    res.status(500).json({
      success: false,
      message: "Failed to update work order",
      error: error.message,
    })
  }
})

// Delete a work order
router.delete("/:id", authenticateToken, async (req, res) => {
  const connection = await db.getConnection()

  try {
    await connection.beginTransaction()

    const { id } = req.params

    // Delete related records first
    await connection.execute("DELETE FROM worker_assignments WHERE work_order_id = ?", [id])
    await connection.execute("DELETE FROM work_order_stages WHERE work_order_id = ?", [id])
    await connection.execute("DELETE FROM stones WHERE work_order_id = ?", [id])
    await connection.execute("DELETE FROM activity_logs WHERE work_order_id = ?", [id])

    // Delete work order
    const [result] = await connection.execute("DELETE FROM work_orders WHERE id = ?", [id])

    if (result.affectedRows === 0) {
      await connection.rollback()
      return res.status(404).json({
        success: false,
        message: "Work order not found",
      })
    }

    await connection.commit()

    res.json({
      success: true,
      message: "Work order deleted successfully",
    })
  } catch (error) {
    await connection.rollback()
    console.error("Error deleting work order:", error)
    res.status(500).json({
      success: false,
      message: "Failed to delete work order",
      error: error.message,
    })
  } finally {
    connection.release()
  }
})

// Upload images for a work order
router.post("/:id/images", authenticateToken, upload.array("images", 5), async (req, res) => {
  try {
    const { id } = req.params
    const files = req.files

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No images uploaded",
      })
    }

    // Construct the image paths
    const images = files.map((file) => `/uploads/${file.filename}`)

    // Get existing images from the database
    const [rows] = await db.execute("SELECT images FROM work_orders WHERE id = ?", [id])
    let existingImages = []

    if (rows.length > 0 && rows[0].images) {
      try {
        existingImages = JSON.parse(rows[0].images)
      } catch (error) {
        console.error("Error parsing existing images:", error)
        existingImages = []
      }
    }

    // Combine existing and new images
    const allImages = [...existingImages, ...images]

    // Update the work order with the new image paths
    await db.execute("UPDATE work_orders SET images = ? WHERE id = ?", [JSON.stringify(allImages), id])

    res.status(200).json({
      success: true,
      message: "Images uploaded successfully",
      data: {
        images: allImages,
      },
    })
  } catch (error) {
    console.error("Error uploading images:", error)

    // If an error occurs during upload, attempt to delete the uploaded files
    if (req.files && req.files.length > 0) {
      req.files.forEach((file) => {
        const filePath = path.join(__dirname, "../uploads", file.filename)
        fs.unlink(filePath, (err) => {
          if (err) {
            console.error("Error deleting file:", filePath, err)
          } else {
            console.log("File deleted:", filePath)
          }
        })
      })
    }

    res.status(500).json({
      success: false,
      message: "Failed to upload images",
      error: error.message,
    })
  }
})

// Get work order details with images and stones
router.get("/:id/details", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params

    // Get work order with stones and images
    const workOrderQuery = `
      SELECT wo.*, 
             GROUP_CONCAT(DISTINCT CONCAT(s.type, ':', s.pieces, ':', s.weight_grams, ':', s.weight_carats) SEPARATOR '|') as stones_info
      FROM work_orders wo
      LEFT JOIN stones s ON wo.id = s.work_order_id
      WHERE wo.id = ?
      GROUP BY wo.id
    `

    const [workOrderRows] = await db.execute(workOrderQuery, [id])

    if (workOrderRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Work order not found",
      })
    }

    const workOrder = workOrderRows[0]

    // Parse images from JSON if they exist
    let images = []
    if (workOrder.images) {
      try {
        images = JSON.parse(workOrder.images)
        // Convert relative paths to full URLs if needed
        images = images.map((img) => {
          if (img.startsWith("/uploads/")) {
            return `${req.protocol}://${req.get("host")}${img}`
          }
          return img
        })
      } catch (e) {
        console.error("Error parsing images:", e)
      }
    }

    // Parse stones
    let stones = []
    if (workOrder.stones_info) {
      stones = parseStonesInfo(workOrder.stones_info)
    }

    // Get assignment date for the current stage
    const assignmentQuery = `
      SELECT assigned_date, assigned_by, u.name as assigned_by_name
      FROM worker_assignments wa
      LEFT JOIN users u ON wa.assigned_by = u.id
      WHERE work_order_id = ? 
      ORDER BY assigned_date DESC 
      LIMIT 1
    `

    const [assignmentRows] = await db.execute(assignmentQuery, [id])
    const assignedDate = assignmentRows.length > 0 ? assignmentRows[0].assigned_date : null

    res.json({
      success: true,
      data: {
        ...workOrder,
        images,
        stones,
        assignedDate,
      },
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

// Helper functions
function parseStagesInfo(stagesInfo) {
  if (!stagesInfo) return []

  try {
    return stagesInfo.split("|").map((stageStr) => {
      const [stageName, status] = stageStr.split(":")
      return {
        id: `${stageName}_stage`,
        stageName,
        status: status || "not-started",
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
      const [type, pieces, weightGrams, weightCarats] = stoneStr.split(":")
      return {
        id: `stone_${index}`,
        type: type || "Unknown",
        pieces: Number.parseInt(pieces) || 0,
        weightGrams: Number.parseFloat(weightGrams) || 0,
        weightCarats: Number.parseFloat(weightCarats) || 0,
        isReceived: true,
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
      const [stageType, workerId, workerName] = assignmentStr.split(":")
      return {
        stageType: stageType || "unknown",
        workerId: workerId || "",
        workerName: workerName || "Unassigned",
        assignedDate: new Date(),
      }
    })
  } catch (error) {
    console.error("Error parsing assignments info:", error)
    return []
  }
}

module.exports = router
