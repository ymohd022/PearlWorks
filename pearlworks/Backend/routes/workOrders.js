const express = require("express")
const router = express.Router()
const db = require("../config/database")
const { authenticateToken } = require("../middleware/auth")
const upload = require("../middleware/upload")
const fs = require("fs")
const path = require("path")
const multer = require("multer")

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

router.get("/next-number", authenticateToken, async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT work_order_number FROM work_orders ORDER BY id DESC LIMIT 1")

    let nextNumber = "WO001"

    if (rows.length > 0 && rows[0].work_order_number) {
      const lastNumber = rows[0].work_order_number
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
        GROUP_CONCAT(DISTINCT CONCAT(wa.stage_type, ':', wa.user_id, ':', u.name, ':', wa.assigned_date) SEPARATOR '|') as assignments_info
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
      stones: [],
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

// Get stone balance summary for a work order - FIXED to properly consider received stones
router.get("/:id/stone-balance", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const { stage = "setting" } = req.query

    // Get comprehensive stone balance including received stones from work order creation
    const [balanceRows] = await db.execute(
      `
      SELECT 
        wo.id as work_order_id,
        wo.work_order_number,
        -- Original received stones from work order creation (is_received = 1)
        COALESCE(SUM(CASE WHEN s.is_received = 1 AND (s.stage_added = 'original' OR s.stage_added IS NULL) THEN s.weight_grams ELSE 0 END), 0) as original_received_grams,
        COALESCE(SUM(CASE WHEN s.is_received = 1 AND (s.stage_added = 'original' OR s.stage_added IS NULL) THEN s.weight_carats ELSE 0 END), 0) as original_received_carats,
        -- Additional stones added during the specific stage
        COALESCE(SUM(CASE WHEN s.stage_added = ? AND s.is_received = 1 THEN s.weight_grams ELSE 0 END), 0) as stage_added_grams,
        COALESCE(SUM(CASE WHEN s.stage_added = ? AND s.is_received = 1 THEN s.weight_carats ELSE 0 END), 0) as stage_added_carats,
        -- All received stones (original + stage added)
        COALESCE(SUM(CASE WHEN s.is_received = 1 THEN s.weight_grams ELSE 0 END), 0) as total_received_grams,
        COALESCE(SUM(CASE WHEN s.is_received = 1 THEN s.weight_carats ELSE 0 END), 0) as total_received_carats,
        -- Returned stones for the specific stage
        COALESCE(rs_summary.returned_grams, 0) as returned_stones_grams,
        COALESCE(rs_summary.returned_carats, 0) as returned_stones_carats
      FROM work_orders wo
      LEFT JOIN stones s ON wo.id = s.work_order_id
      LEFT JOIN (
        SELECT 
          work_order_id,
          SUM(weight_grams) as returned_grams,
          SUM(weight_carats) as returned_carats
        FROM returned_stones 
        WHERE stage_name = ?
        GROUP BY work_order_id
      ) rs_summary ON wo.id = rs_summary.work_order_id
      WHERE wo.id = ?
      GROUP BY wo.id, wo.work_order_number
    `,
      [stage, stage, stage, id],
    )

    // Get detailed breakdown by stone type - FIXED to properly consider received stones
    const [detailRows] = await db.execute(
      `
      SELECT 
        COALESCE(s.type, rs.type) as type,
        -- Original received stones by type
        COALESCE(s_summary.original_received_pieces, 0) as original_received_pieces,
        COALESCE(s_summary.original_received_grams, 0) as original_received_grams,
        COALESCE(s_summary.original_received_carats, 0) as original_received_carats,
        -- Stage added stones by type
        COALESCE(s_summary.stage_added_pieces, 0) as stage_added_pieces,
        COALESCE(s_summary.stage_added_grams, 0) as stage_added_grams,
        COALESCE(s_summary.stage_added_carats, 0) as stage_added_carats,
        -- Total received stones by type
        COALESCE(s_summary.total_received_pieces, 0) as total_received_pieces,
        COALESCE(s_summary.total_received_grams, 0) as total_received_grams,
        COALESCE(s_summary.total_received_carats, 0) as total_received_carats,
        -- Returned stones by type
        COALESCE(rs.returned_pieces, 0) as returned_pieces,
        COALESCE(rs.returned_grams, 0) as returned_grams,
        COALESCE(rs.returned_carats, 0) as returned_carats,
        -- Remaining stones calculation (total received - returned)
        (COALESCE(s_summary.total_received_grams, 0) - COALESCE(rs.returned_grams, 0)) as remaining_grams,
        (COALESCE(s_summary.total_received_carats, 0) - COALESCE(rs.returned_carats, 0)) as remaining_carats
      FROM (
        SELECT DISTINCT type FROM stones WHERE work_order_id = ? AND is_received = 1
        UNION
        SELECT DISTINCT type FROM returned_stones WHERE work_order_id = ? AND stage_name = ?
      ) stone_types
      LEFT JOIN (
        SELECT 
          type,
          -- Original received stones (from work order creation)
          SUM(CASE WHEN is_received = 1 AND (stage_added = 'original' OR stage_added IS NULL) THEN pieces ELSE 0 END) as original_received_pieces,
          SUM(CASE WHEN is_received = 1 AND (stage_added = 'original' OR stage_added IS NULL) THEN weight_grams ELSE 0 END) as original_received_grams,
          SUM(CASE WHEN is_received = 1 AND (stage_added = 'original' OR stage_added IS NULL) THEN weight_carats ELSE 0 END) as original_received_carats,
          -- Stage added stones
          SUM(CASE WHEN stage_added = ? AND is_received = 1 THEN pieces ELSE 0 END) as stage_added_pieces,
          SUM(CASE WHEN stage_added = ? AND is_received = 1 THEN weight_grams ELSE 0 END) as stage_added_grams,
          SUM(CASE WHEN stage_added = ? AND is_received = 1 THEN weight_carats ELSE 0 END) as stage_added_carats,
          -- Total received stones
          SUM(CASE WHEN is_received = 1 THEN pieces ELSE 0 END) as total_received_pieces,
          SUM(CASE WHEN is_received = 1 THEN weight_grams ELSE 0 END) as total_received_grams,
          SUM(CASE WHEN is_received = 1 THEN weight_carats ELSE 0 END) as total_received_carats
        FROM stones 
        WHERE work_order_id = ?
        GROUP BY type
      ) s_summary ON stone_types.type = s_summary.type
      LEFT JOIN (
        SELECT 
          type,
          SUM(pieces) as returned_pieces,
          SUM(weight_grams) as returned_grams,
          SUM(weight_carats) as returned_carats
        FROM returned_stones 
        WHERE work_order_id = ? AND stage_name = ?
        GROUP BY type
      ) rs ON stone_types.type = rs.type
      LEFT JOIN stones s ON stone_types.type = s.type AND s.work_order_id = ?
      ORDER BY stone_types.type
    `,
      [id, id, stage, stage, stage, stage, id, id, stage, id],
    )

    const balance = balanceRows[0] || {
      original_received_grams: 0,
      original_received_carats: 0,
      stage_added_grams: 0,
      stage_added_carats: 0,
      total_received_grams: 0,
      total_received_carats: 0,
      returned_stones_grams: 0,
      returned_stones_carats: 0,
    }

    // Calculate remaining stones (total received - returned)
    const remainingGrams = balance.total_received_grams - balance.returned_stones_grams
    const remainingCarats = balance.total_received_carats - balance.returned_stones_carats

    res.json({
      success: true,
      data: {
        summary: {
          originalReceivedStones: {
            grams: Number.parseFloat(balance.original_received_grams.toFixed(3)),
            carats: Number.parseFloat(balance.original_received_carats.toFixed(3)),
          },
          stageAddedStones: {
            grams: Number.parseFloat(balance.stage_added_grams.toFixed(3)),
            carats: Number.parseFloat(balance.stage_added_carats.toFixed(3)),
          },
          totalReceivedStones: {
            grams: Number.parseFloat(balance.total_received_grams.toFixed(3)),
            carats: Number.parseFloat(balance.total_received_carats.toFixed(3)),
          },
          returnedStones: {
            grams: Number.parseFloat(balance.returned_stones_grams.toFixed(3)),
            carats: Number.parseFloat(balance.returned_stones_carats.toFixed(3)),
          },
          remainingStones: {
            grams: Number.parseFloat(remainingGrams.toFixed(3)),
            carats: Number.parseFloat(remainingCarats.toFixed(3)),
          },
          difference: {
            grams: Number.parseFloat(remainingGrams.toFixed(3)),
            carats: Number.parseFloat(remainingCarats.toFixed(3)),
          },
        },
        stoneDetails: detailRows.map((row) => ({
          type: row.type,
          originalReceived: {
            pieces: row.original_received_pieces,
            grams: Number.parseFloat((row.original_received_grams || 0).toFixed(3)),
            carats: Number.parseFloat((row.original_received_carats || 0).toFixed(3)),
          },
          stageAdded: {
            pieces: row.stage_added_pieces,
            grams: Number.parseFloat((row.stage_added_grams || 0).toFixed(3)),
            carats: Number.parseFloat((row.stage_added_carats || 0).toFixed(3)),
          },
          totalReceived: {
            pieces: row.total_received_pieces,
            grams: Number.parseFloat((row.total_received_grams || 0).toFixed(3)),
            carats: Number.parseFloat((row.total_received_carats || 0).toFixed(3)),
          },
          returned: {
            pieces: row.returned_pieces,
            grams: Number.parseFloat((row.returned_grams || 0).toFixed(3)),
            carats: Number.parseFloat((row.returned_carats || 0).toFixed(3)),
          },
          remaining: {
            grams: Number.parseFloat((row.remaining_grams || 0).toFixed(3)),
            carats: Number.parseFloat((row.remaining_carats || 0).toFixed(3)),
          },
        })),
      },
    })
  } catch (error) {
    console.error("Error fetching stone balance:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch stone balance",
      error: error.message,
    })
  }
})

// Create a new work order with file upload support
router.post("/", authenticateToken, upload.array("images", 5), async (req, res) => {
  const connection = await db.getConnection()

  try {
    await connection.beginTransaction()

    const { partyName, poNumber, poDate, itemDetails, modelNumber, descriptionOfWork, expectedCompletionDate } =
      req.body

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

    let imagePaths = []
    if (req.files && req.files.length > 0) {
      imagePaths = req.files.map((file) => `/uploads/${file.filename}`)
    }

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

    if (stones && stones.length > 0) {
      for (const stone of stones) {
        await connection.execute(
          `INSERT INTO stones (work_order_id, type, pieces, weight_grams, weight_carats, is_received, stage_added) 
           VALUES (?, ?, ?, ?, ?, ?, 'original')`,
          [workOrderId, stone.type, stone.pieces, stone.weightGrams, stone.weightCarats, stone.isReceived ? 1 : 0],
        )
      }
    }

    if (assignedWorkers && assignedWorkers.length > 0) {
      for (const assignment of assignedWorkers) {
        await connection.execute(
          `INSERT INTO worker_assignments (work_order_id, user_id, stage_type, assigned_date, assigned_by) 
           VALUES (?, ?, ?, NOW(), ?)`,
          [workOrderId, assignment.workerId, assignment.stageType, req.user?.id || 1],
        )
      }
    }

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

// Assign workers to work order
router.put("/:id/assign-workers", authenticateToken, async (req, res) => {
  const connection = await db.getConnection()

  try {
    await connection.beginTransaction()

    const workOrderId = req.params.id
    const { assignments } = req.body

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

    await connection.execute("DELETE FROM worker_assignments WHERE work_order_id = ?", [workOrderId])

    for (const assignment of assignments) {
      await connection.execute(
        `INSERT INTO worker_assignments (work_order_id, user_id, stage_type, assigned_date, assigned_by) 
         VALUES (?, ?, ?, NOW(), ?)`,
        [workOrderId, assignment.workerId, assignment.stageType, req.user?.id || 1],
      )
    }

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

    await connection.execute("DELETE FROM worker_assignments WHERE work_order_id = ?", [id])
    await connection.execute("DELETE FROM work_order_stages WHERE work_order_id = ?", [id])
    await connection.execute("DELETE FROM stones WHERE work_order_id = ?", [id])
    await connection.execute("DELETE FROM returned_stones WHERE work_order_id = ?", [id])
    await connection.execute("DELETE FROM activity_logs WHERE work_order_id = ?", [id])

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

    const images = files.map((file) => `/uploads/${file.filename}`)

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

    const allImages = [...existingImages, ...images]

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

    const workOrderQuery = `
      SELECT wo.*, 
             GROUP_CONCAT(DISTINCT CONCAT(s.type, ':', s.pieces, ':', s.weight_grams, ':', s.weight_carats, ':', COALESCE(s.stage_added, 'original'), ':', s.is_received) SEPARATOR '|') as stones_info
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

    let images = []
    if (workOrder.images) {
      try {
        images = JSON.parse(workOrder.images)
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

    let stones = []
    if (workOrder.stones_info) {
      stones = parseStonesInfo(workOrder.stones_info)
    }

    const assignmentQuery = `
      SELECT assigned_date, assigned_by, u.name as assigned_by_name, u2.name as assigned_worker_name, u2.email as assigned_worker_email
      FROM worker_assignments wa
      LEFT JOIN users u ON wa.assigned_by = u.id
      LEFT JOIN users u2 ON wa.user_id = u2.id
      WHERE work_order_id = ? 
      ORDER BY assigned_date DESC 
      LIMIT 1
    `

    const [assignmentRows] = await db.execute(assignmentQuery, [id])
    const assignedDate = assignmentRows.length > 0 ? assignmentRows[0].assigned_date : null
    const assignedWorkerName = assignmentRows.length > 0 ? assignmentRows[0].assigned_worker_name : null
    const assignedWorkerEmail = assignmentRows.length > 0 ? assignmentRows[0].assigned_worker_email : null

    res.json({
      success: true,
      data: {
        ...workOrder,
        images,
        stones,
        assignedDate,
        assignedWorkerName,
        assignedWorkerEmail,
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
      const [type, pieces, weightGrams, weightCarats, stageAdded, isReceived] = stoneStr.split(":")
      return {
        id: `stone_${index}`,
        type: type || "Unknown",
        pieces: Number.parseInt(pieces) || 0,
        weightGrams: Number.parseFloat(weightGrams) || 0,
        weightCarats: Number.parseFloat(weightCarats) || 0,
        isReceived: isReceived === "1",
        isReturned: false,
        stageAdded: stageAdded || "original",
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
