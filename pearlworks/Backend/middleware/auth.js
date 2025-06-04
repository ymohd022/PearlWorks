const jwt = require("jsonwebtoken")
const db = require("../config/database")

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"]
  const token = authHeader && authHeader.split(" ")[1]

  if (!token) {
    return res.status(401).json({ success: false, message: "Access token required" })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key")

    // Get user from database
    const [users] = await db.execute("SELECT id, email, name, role, is_active FROM users WHERE id = ?", [
      decoded.userId,
    ])

    if (users.length === 0 || !users[0].is_active) {
      return res.status(401).json({ success: false, message: "Invalid token" })
    }

    req.user = users[0]
    next()
  } catch (error) {
    return res.status(403).json({ success: false, message: "Invalid token" })
  }
}

const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Insufficient permissions.",
      })
    }
    next()
  }
}

module.exports = { authenticateToken, authorizeRoles }
