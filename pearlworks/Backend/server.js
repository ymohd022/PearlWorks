const express = require("express")
const cors = require("cors")
const helmet = require("helmet")
const rateLimit = require("express-rate-limit")
const path = require("path")
require("dotenv").config()

const authRoutes = require("./routes/auth")
const workOrderRoutes = require("./routes/workOrders")
const userRoutes = require("./routes/users")
const dashboardRoutes = require("./routes/dashboard")
const framingRoutes = require("./routes/framing")
const polishRoutes = require("./routes/polish")
const repairRoutes = require("./routes/repair")
const dispatchRoutes = require("./routes/dispatch")
const adminRoutes = require("./routes/admin")
const managerRoutes = require("./routes/manager")
const settingRoutes = require("./routes/setting")
const autocompleteRoutes = require("./routes/autocomplete")
const managerPolishRoutes = require("./routes/manager-polish")

const PORT = process.env.PORT || 3000
const app = express()

// Security middleware
app.use(helmet())
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:4200" || "http://localhost:3000",
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
app.use("/uploads", (req, res, next) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
}, express.static(path.join(__dirname, "uploads")));
// Routes
app.use("/api/auth", authRoutes)
app.use("/api/work-orders", workOrderRoutes)
app.use("/api/users", userRoutes)
app.use("/api/dashboard", dashboardRoutes)
app.use("/api/framing", framingRoutes)
app.use("/api/polish", polishRoutes)
app.use("/api/repair", repairRoutes)
app.use("/api/dispatch", dispatchRoutes)
app.use("/api/admin", adminRoutes)
app.use("/api/manager", managerRoutes)
app.use("/api/setting", settingRoutes)
app.use('/api/autocomplete', autocompleteRoutes)
app.use("/api/manager/polish", managerPolishRoutes)

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
