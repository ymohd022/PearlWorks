const express = require("express")
const router = express.Router()
const db = require("../config/database")
const { authenticateToken } = require("../middleware/auth")

// Search party names
router.get("/party-names", authenticateToken, async (req, res) => {
  try {
    const { q } = req.query
    let query = `
      SELECT DISTINCT party_name as value, COUNT(*) as count
      FROM work_orders 
      WHERE party_name IS NOT NULL AND party_name != ''
    `
    const params = []

    if (q && q.length > 0) {
      query += ` AND party_name LIKE ?`
      params.push(`%${q}%`)
    }

    query += ` GROUP BY party_name ORDER BY count DESC, party_name ASC LIMIT 10`

    const [rows] = await db.execute(query, params)

    res.json({
      success: true,
      data: rows.map((row) => ({
        value: row.value,
        count: row.count,
      })),
    })
  } catch (error) {
    console.error("Error searching party names:", error)
    res.status(500).json({
      success: false,
      message: "Failed to search party names",
      error: error.message,
    })
  }
})

// Search item details
router.get("/item-details", authenticateToken, async (req, res) => {
  try {
    const { q } = req.query
    let query = `
      SELECT DISTINCT item_details as value, COUNT(*) as count
      FROM work_orders 
      WHERE item_details IS NOT NULL AND item_details != ''
    `
    const params = []

    if (q && q.length > 0) {
      query += ` AND item_details LIKE ?`
      params.push(`%${q}%`)
    }

    query += ` GROUP BY item_details ORDER BY count DESC, item_details ASC LIMIT 10`

    const [rows] = await db.execute(query, params)

    res.json({
      success: true,
      data: rows.map((row) => ({
        value: row.value,
        count: row.count,
      })),
    })
  } catch (error) {
    console.error("Error searching item details:", error)
    res.status(500).json({
      success: false,
      message: "Failed to search item details",
      error: error.message,
    })
  }
})

// Search model numbers
router.get("/model-numbers", authenticateToken, async (req, res) => {
  try {
    const { q } = req.query
    let query = `
      SELECT DISTINCT model_number as value, COUNT(*) as count
      FROM work_orders 
      WHERE model_number IS NOT NULL AND model_number != ''
    `
    const params = []

    if (q && q.length > 0) {
      query += ` AND model_number LIKE ?`
      params.push(`%${q}%`)
    }

    query += ` GROUP BY model_number ORDER BY count DESC, model_number ASC LIMIT 10`

    const [rows] = await db.execute(query, params)

    res.json({
      success: true,
      data: rows.map((row) => ({
        value: row.value,
        count: row.count,
      })),
    })
  } catch (error) {
    console.error("Error searching model numbers:", error)
    res.status(500).json({
      success: false,
      message: "Failed to search model numbers",
      error: error.message,
    })
  }
})

// Search descriptions
router.get("/descriptions", authenticateToken, async (req, res) => {
  try {
    const { q } = req.query
    let query = `
      SELECT DISTINCT description_of_work as value, COUNT(*) as count
      FROM work_orders 
      WHERE description_of_work IS NOT NULL AND description_of_work != ''
    `
    const params = []

    if (q && q.length > 0) {
      query += ` AND description_of_work LIKE ?`
      params.push(`%${q}%`)
    }

    query += ` GROUP BY description_of_work ORDER BY count DESC, description_of_work ASC LIMIT 10`

    const [rows] = await db.execute(query, params)

    res.json({
      success: true,
      data: rows.map((row) => ({
        value: row.value,
        count: row.count,
      })),
    })
  } catch (error) {
    console.error("Error searching descriptions:", error)
    res.status(500).json({
      success: false,
      message: "Failed to search descriptions",
      error: error.message,
    })
  }
})

// Search PO numbers
router.get("/po-numbers", authenticateToken, async (req, res) => {
  try {
    const { q } = req.query
    let query = `
      SELECT DISTINCT po_number as value, COUNT(*) as count
      FROM work_orders 
      WHERE po_number IS NOT NULL AND po_number != ''
    `
    const params = []

    if (q && q.length > 0) {
      query += ` AND po_number LIKE ?`
      params.push(`%${q}%`)
    }

    query += ` GROUP BY po_number ORDER BY count DESC, po_number ASC LIMIT 10`

    const [rows] = await db.execute(query, params)

    res.json({
      success: true,
      data: rows.map((row) => ({
        value: row.value,
        count: row.count,
      })),
    })
  } catch (error) {
    console.error("Error searching PO numbers:", error)
    res.status(500).json({
      success: false,
      message: "Failed to search PO numbers",
      error: error.message,
    })
  }
})

// Search stone types
router.get("/stone-types", authenticateToken, async (req, res) => {
  try {
    const { q } = req.query
    let query = `
      SELECT DISTINCT type as value, COUNT(*) as count
      FROM stones 
      WHERE type IS NOT NULL AND type != ''
    `
    const params = []

    if (q && q.length > 0) {
      query += ` AND type LIKE ?`
      params.push(`%${q}%`)
    }

    query += ` GROUP BY type ORDER BY count DESC, type ASC LIMIT 10`

    const [rows] = await db.execute(query, params)

    res.json({
      success: true,
      data: rows.map((row) => ({
        value: row.value,
        count: row.count,
      })),
    })
  } catch (error) {
    console.error("Error searching stone types:", error)
    res.status(500).json({
      success: false,
      message: "Failed to search stone types",
      error: error.message,
    })
  }
})

module.exports = router
