const express = require("express")
const db = require("../config/database")
const { authenticateToken, authorizeRoles } = require("../middleware/auth")

const router = express.Router()

// Get all workers
router.get("/workers", authenticateToken, async (req, res) => {
  try {
    const { role } = req.query

    let query = "SELECT id, name, email, role FROM users WHERE is_active = TRUE"
    const params = []

    if (role) {
      query += " AND role = ?"
      params.push(role)
    }

    query += " ORDER BY name"

    const [workers] = await db.execute(query, params)

    res.json({
      success: true,
      data: workers,
    })
  } catch (error) {
    console.error("Get workers error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch workers",
    })
  }
})

// Get workers by role
router.get("/workers/by-role/:role", authenticateToken, async (req, res) => {
  try {
    const { role } = req.params

    const [workers] = await db.execute(
      "SELECT id, name, email, role FROM users WHERE role = ? AND is_active = TRUE ORDER BY name",
      [role],
    )

    res.json({
      success: true,
      data: workers,
    })
  } catch (error) {
    console.error("Get workers by role error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch workers",
    })
  }
})

module.exports = router
