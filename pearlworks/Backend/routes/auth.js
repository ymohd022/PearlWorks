const express = require("express")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const { body, validationResult } = require("express-validator")
const db = require("../config/database")
const { authenticateToken } = require("../middleware/auth")

const router = express.Router()

// Login
router.post(
  "/login",
  [body("email").isEmail().normalizeEmail(), body("password").isLength({ min: 6 })],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        })
      }

      const { email, password } = req.body

      // Get user from database
      const [users] = await db.execute("SELECT * FROM users WHERE email = ? AND is_active = TRUE", [email])

      if (users.length === 0) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password",
        })
      }

      const user = users[0]

      // For demo purposes, we'll accept '123456' as password for all users
      // In production, use proper password hashing
      const isValidPassword = password === "123456" || (await bcrypt.compare(password, user.password))

      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password",
        })
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET || "your-secret-key",
        { expiresIn: "24h" },
      )

      // Remove password from response
      const { password: _, ...userWithoutPassword } = user

      res.json({
        success: true,
        token,
        user: userWithoutPassword,
      })
    } catch (error) {
      console.error("Login error:", error)
      res.status(500).json({
        success: false,
        message: "Internal server error",
      })
    }
  },
)

// Get current user
router.get("/me", authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: req.user,
  })
})

// Logout (client-side token removal)
router.post("/logout", authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: "Logged out successfully",
  })
})

module.exports = router
