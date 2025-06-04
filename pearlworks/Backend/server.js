const express = require("express")
const cors = require("cors")
const helmet = require("helmet")
const rateLimit = require("express-rate-limit")
require("dotenv").config()

const authRoutes = require("./routes/auth")
const workOrderRoutes = require("./routes/workOrders")
const userRoutes = require("./routes/users")
const dashboardRoutes = require("./routes/dashboard")
const framingRoutes = require("./routes/framing")
const PORT = process.env.PORT || 3000
const app = express()

// Security middleware
app.use(helmet())
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:4200",
    credentials: true,
  }),
)

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
})
app.use(limiter)

// Body parsing middleware
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true }))

// Routes
app.use("/api/auth", authRoutes)
app.use("/api/work-orders", workOrderRoutes)
app.use("/api/users", userRoutes)
app.use("/api/dashboard", dashboardRoutes)
app.use("/api/framing", framingRoutes)

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() })
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({
    success: false,
    message: "Something went wrong!",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  })
})

// 404 handler
app.use((req, res) => {
    res.status(404).json({ success: false, message: "Route not found" })
  })

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

module.exports = app
