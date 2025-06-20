const express = require("express")
const { body, validationResult } = require("express-validator")
const db = require("../config/database")
const { authenticateToken, authorizeRoles } = require("../middleware/auth")

const router = express.Router()

// Get all work orders with detailed information for admin
router.get("/work-orders", authenticateToken,  async (req, res) => {
  try {
    const { status, partyName, workOrderNumber, dateFrom, dateTo } = req.query

    let query = `
      SELECT 
        wo.id,
        wo.work_order_number,
        wo.party_name,
        wo.po_number,
        wo.po_date,
        wo.item_details,
        wo.model_number,
        wo.description_of_work,
        wo.status,
        wo.gross_weight,
        wo.net_weight,
        wo.expected_completion_date,
        wo.completed_date,
        wo.dispatched_by,
        wo.dispatched_date,
        wo.created_at,
        wo.updated_at,
        u.name as created_by_name
      FROM work_orders wo
      LEFT JOIN users u ON wo.created_by = u.id
      WHERE 1=1
    `

    const params = []

    // Apply filters
    if (status) {
      query += " AND wo.status = ?"
      params.push(status)
    }

    if (partyName) {
      query += " AND wo.party_name LIKE ?"
      params.push(`%${partyName}%`)
    }

    if (workOrderNumber) {
      query += " AND wo.work_order_number LIKE ?"
      params.push(`%${workOrderNumber}%`)
    }

    if (dateFrom) {
      query += " AND wo.created_at >= ?"
      params.push(dateFrom)
    }

    if (dateTo) {
      query += " AND wo.created_at <= ?"
      params.push(dateTo)
    }

    query += " ORDER BY wo.created_at DESC"

    const [workOrders] = await db.execute(query, params)

    // Get stages for each work order
    const workOrdersWithDetails = await Promise.all(
      workOrders.map(async (wo) => {
        // Get stages
        const [stages] = await db.execute(
          `
          SELECT 
            wos.id,
            wos.stage_name,
            wos.karigar_name,
            wos.issue_date,
            wos.issue_weight,
            wos.jamah_date,
            wos.jamah_weight,
            wos.sorting_issue,
            wos.sorting_jamah,
            wos.weight_difference,
            wos.status,
            wos.approved,
            wos.notes,
            wos.created_at,
            wos.updated_at
          FROM work_order_stages wos
          WHERE wos.work_order_id = ?
          ORDER BY wos.created_at ASC
        `,
          [wo.id],
        )

        // Get stones
        const [stones] = await db.execute(
          `
          SELECT 
            s.id,
            s.type,
            s.pieces,
            s.weight_grams,
            s.weight_carats,
            s.is_received,
            s.created_at
          FROM stones s
          WHERE s.work_order_id = ?
          ORDER BY s.created_at ASC
        `,
          [wo.id],
        )

        // Get worker assignments
        const [assignments] = await db.execute(
          `
          SELECT 
            wa.id,
            wa.stage_type,
            wa.assigned_date,
            u.id as worker_id,
            u.name as worker_name,
            u.role as worker_role
          FROM worker_assignments wa
          JOIN users u ON wa.user_id = u.id
          WHERE wa.work_order_id = ?
          ORDER BY wa.assigned_date ASC
        `,
          [wo.id],
        )

        // Transform data to match frontend interface
        return {
          id: wo.id.toString(),
          workOrderNumber: wo.work_order_number,
          partyName: wo.party_name,
          poNumber: wo.po_number,
          poDate: wo.po_date,
          itemDetails: wo.item_details,
          modelNumber: wo.model_number,
          descriptionOfWork: wo.description_of_work,
          status: wo.status,
          grossWeight: wo.gross_weight,
          netWeight: wo.net_weight,
          expectedCompletionDate: wo.expected_completion_date,
          completedDate: wo.completed_date,
          dispatchedBy: wo.dispatched_by,
          dispatchedDate: wo.dispatched_date,
          createdDate: wo.created_at,
          updatedDate: wo.updated_at,
          createdByName: wo.created_by_name,
          stages: stages.map((stage) => ({
            id: stage.id.toString(),
            stageName: stage.stage_name,
            karigar: stage.karigar_name,
            issueDate: stage.issue_date,
            issueWeight: stage.issue_weight,
            jamahDate: stage.jamah_date,
            jamahWeight: stage.jamah_weight,
            sortingIssue: stage.sorting_issue,
            sortingJamah: stage.sorting_jamah,
            difference: stage.weight_difference,
            status: stage.status,
            approved: stage.approved,
            notes: stage.notes,
          })),
          stones: stones.map((stone) => ({
            id: stone.id.toString(),
            type: stone.type,
            pieces: stone.pieces,
            weightGrams: stone.weight_grams,
            weightCarats: stone.weight_carats,
            isReceived: stone.is_received,
            isReturned: false, // You might need to check returned_stones table
          })),
          assignedWorkers: assignments.map((assignment) => ({
            stageType: assignment.stage_type,
            workerId: assignment.worker_id.toString(),
            workerName: assignment.worker_name,
            assignedDate: assignment.assigned_date,
          })),
        }
      }),
    )

    res.json({
      success: true,
      data: workOrdersWithDetails,
    })
  } catch (error) {
    console.error("Get admin work orders error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch work orders",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    })
  }
})

// Get activity logs for admin
router.get("/activity-logs", authenticateToken,  async (req, res) => {
  try {
    const { limit = 50, workOrderId } = req.query

    let query = `
      SELECT 
        al.id,
        al.work_order_id,
        al.work_order_number,
        al.action,
        al.performed_by,
        al.performed_by_role,
        al.details,
        al.created_at as timestamp
      FROM activity_logs al
      WHERE 1=1
    `

    const params = []

    if (workOrderId) {
      query += " AND al.work_order_id = ?"
      params.push(workOrderId)
    }

    query += " ORDER BY al.created_at DESC LIMIT ?"
    params.push(Number.parseInt(limit))

    const [logs] = await db.execute(query, params)

    const transformedLogs = logs.map((log) => ({
      id: log.id.toString(),
      workOrderId: log.work_order_id.toString(),
      workOrderNumber: log.work_order_number,
      action: log.action,
      performedBy: log.performed_by,
      performedByRole: log.performed_by_role,
      details: log.details,
      timestamp: log.timestamp,
    }))

    res.json({
      success: true,
      data: transformedLogs,
    })
  } catch (error) {
    console.error("Get admin activity logs error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch activity logs",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    })
  }
})

// USER MANAGEMENT ROUTES

// Get all users with filtering
router.get("/users", authenticateToken, async (req, res) => {
  try {
    const { role, isActive, search } = req.query

    let query = `
      SELECT 
        id,
        email,
        name,
        role,
        is_active,
        created_at,
        updated_at
      FROM users
      WHERE 1=1
    `

    const params = []

    if (role) {
      query += " AND role = ?"
      params.push(role)
    }

    if (isActive !== undefined) {
      query += " AND is_active = ?"
      params.push(isActive === "true" ? 1 : 0)
    }

    if (search) {
      query += " AND (name LIKE ? OR email LIKE ?)"
      params.push(`%${search}%`, `%${search}%`)
    }

    query += " ORDER BY created_at DESC"

    const [users] = await db.execute(query, params)

    const transformedUsers = users.map((user) => ({
      id: user.id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: Boolean(user.is_active),
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    }))

    res.json({
      success: true,
      data: transformedUsers,
    })
  } catch (error) {
    console.error("Get users error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch users",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    })
  }
})

// Create new user
router.post(
  "/users",
  [
    authenticateToken,
    body("email").isEmail().normalizeEmail(),
    body("password").isLength({ min: 6 }),
    body("name").trim().isLength({ min: 2 }),
    body("role").isIn(["admin", "manager", "framing", "setting", "polish", "repair", "dispatch"]),
  ],
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

      const { email, password, name, role } = req.body

      // Check if user already exists
      const [existingUser] = await db.execute("SELECT id FROM users WHERE email = ?", [email])

      if (existingUser.length > 0) {
        return res.status(400).json({
          success: false,
          message: "User with this email already exists",
        })
      }

      // Hash password
      const saltRounds = 10
      const hashedPassword = await bcrypt.hash(password, saltRounds)

      // Create user
      const [result] = await db.execute(
        "INSERT INTO users (email, password, name, role, is_active) VALUES (?, ?, ?, ?, 1)",
        [email, hashedPassword, name, role],
      )

      // Get created user
      const [newUser] = await db.execute(
        "SELECT id, email, name, role, is_active, created_at, updated_at FROM users WHERE id = ?",
        [result.insertId],
      )

      res.status(201).json({
        success: true,
        message: "User created successfully",
        data: {
          id: newUser[0].id.toString(),
          email: newUser[0].email,
          name: newUser[0].name,
          role: newUser[0].role,
          isActive: Boolean(newUser[0].is_active),
          createdAt: newUser[0].created_at,
          updatedAt: newUser[0].updated_at,
        },
      })
    } catch (error) {
      console.error("Create user error:", error)
      res.status(500).json({
        success: false,
        message: "Failed to create user",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      })
    }
  },
)

// Update user
router.put(
  "/users/:userId",
  [
    authenticateToken,
    body("email").optional().isEmail().normalizeEmail(),
    body("password").optional().isLength({ min: 6 }),
    body("name").optional().trim().isLength({ min: 2 }),
    body("role").optional().isIn(["admin", "manager", "framing", "setting", "polish", "repair", "dispatch"]),
    body("isActive").optional().isBoolean(),
  ],
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

      const { userId } = req.params
      const { email, password, name, role, isActive } = req.body

      // Check if user exists
      const [existingUser] = await db.execute("SELECT id FROM users WHERE id = ?", [userId])

      if (existingUser.length === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        })
      }

      // Check if email is already taken by another user
      if (email) {
        const [emailCheck] = await db.execute("SELECT id FROM users WHERE email = ? AND id != ?", [email, userId])
        if (emailCheck.length > 0) {
          return res.status(400).json({
            success: false,
            message: "Email is already taken by another user",
          })
        }
      }

      // Build update query
      const updateFields = []
      const updateValues = []

      if (email) {
        updateFields.push("email = ?")
        updateValues.push(email)
      }

      if (password) {
        const hashedPassword = await bcrypt.hash(password, 10)
        updateFields.push("password = ?")
        updateValues.push(hashedPassword)
      }

      if (name) {
        updateFields.push("name = ?")
        updateValues.push(name)
      }

      if (role) {
        updateFields.push("role = ?")
        updateValues.push(role)
      }

      if (isActive !== undefined) {
        updateFields.push("is_active = ?")
        updateValues.push(isActive ? 1 : 0)
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No fields to update",
        })
      }

      updateFields.push("updated_at = CURRENT_TIMESTAMP")
      updateValues.push(userId)

      const updateQuery = `UPDATE users SET ${updateFields.join(", ")} WHERE id = ?`
      await db.execute(updateQuery, updateValues)

      // Get updated user
      const [updatedUser] = await db.execute(
        "SELECT id, email, name, role, is_active, created_at, updated_at FROM users WHERE id = ?",
        [userId],
      )

      res.json({
        success: true,
        message: "User updated successfully",
        data: {
          id: updatedUser[0].id.toString(),
          email: updatedUser[0].email,
          name: updatedUser[0].name,
          role: updatedUser[0].role,
          isActive: Boolean(updatedUser[0].is_active),
          createdAt: updatedUser[0].created_at,
          updatedAt: updatedUser[0].updated_at,
        },
      })
    } catch (error) {
      console.error("Update user error:", error)
      res.status(500).json({
        success: false,
        message: "Failed to update user",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      })
    }
  },
)

// Delete user
router.delete("/users/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params

    // Check if user exists
    const [existingUser] = await db.execute("SELECT id, email FROM users WHERE id = ?", [userId])

    if (existingUser.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    // Prevent admin from deleting themselves
    if (userId === req.user.id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account",
      })
    }

    // Check if user has any work order assignments
    const [assignments] = await db.execute("SELECT COUNT(*) as count FROM worker_assignments WHERE user_id = ?", [
      userId,
    ])

    if (assignments[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete user with existing work order assignments",
      })
    }

    // Delete user
    await db.execute("DELETE FROM users WHERE id = ?", [userId])

    res.json({
      success: true,
      message: "User deleted successfully",
    })
  } catch (error) {
    console.error("Delete user error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to delete user",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    })
  }
})

// Get user statistics
router.get("/user-statistics", authenticateToken,  async (req, res) => {
  try {
    // Get total users
    const [totalUsers] = await db.execute("SELECT COUNT(*) as count FROM users")

    // Get active users
    const [activeUsers] = await db.execute("SELECT COUNT(*) as count FROM users WHERE is_active = 1")

    // Get inactive users
    const [inactiveUsers] = await db.execute("SELECT COUNT(*) as count FROM users WHERE is_active = 0")

    // Get users by role
    const [usersByRole] = await db.execute(`
      SELECT 
        role,
        COUNT(*) as count
      FROM users
      WHERE is_active = 1
      GROUP BY role
    `)

    const roleStats = usersByRole.reduce((acc, item) => {
      acc[item.role] = item.count
      return acc
    }, {})

    res.json({
      success: true,
      data: {
        totalUsers: totalUsers[0].count,
        activeUsers: activeUsers[0].count,
        inactiveUsers: inactiveUsers[0].count,
        usersByRole: roleStats,
      },
    })
  } catch (error) {
    console.error("Get user statistics error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch user statistics",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    })
  }
})


// Get admin statistics
router.get("/statistics", authenticateToken,  async (req, res) => {
  try {
    // Get work order counts by status
    const [statusCounts] = await db.execute(`
      SELECT 
        status,
        COUNT(*) as count
      FROM work_orders
      GROUP BY status
    `)

    // Get stage performance
    const [stageStats] = await db.execute(`
      SELECT 
        stage_name,
        COUNT(*) as total_orders,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
        AVG(CASE 
          WHEN jamah_date IS NOT NULL AND issue_date IS NOT NULL 
          THEN DATEDIFF(jamah_date, issue_date) 
          ELSE NULL 
        END) as avg_completion_days
      FROM work_order_stages
      GROUP BY stage_name
    `)

    // Get worker performance
    const [workerStats] = await db.execute(`
      SELECT 
        u.name as worker_name,
        u.role as worker_role,
        COUNT(wos.id) as total_stages,
        SUM(CASE WHEN wos.status = 'completed' THEN 1 ELSE 0 END) as completed_stages,
        AVG(CASE 
          WHEN wos.jamah_date IS NOT NULL AND wos.issue_date IS NOT NULL 
          THEN DATEDIFF(wos.jamah_date, wos.issue_date) 
          ELSE NULL 
        END) as avg_completion_days
      FROM users u
      LEFT JOIN work_order_stages wos ON u.name = wos.karigar_name
      WHERE u.role IN ('framing', 'setting', 'polish', 'repair')
      GROUP BY u.id, u.name, u.role
      HAVING total_stages > 0
      ORDER BY completed_stages DESC
    `)

    // Get recent trends (last 30 days)
    const [trends] = await db.execute(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as orders_created
      FROM work_orders
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `)

    res.json({
      success: true,
      data: {
        statusCounts: statusCounts.reduce((acc, item) => {
          acc[item.status] = item.count
          return acc
        }, {}),
        stageStats,
        workerStats,
        trends,
      },
    })
  } catch (error) {
    console.error("Get admin statistics error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch statistics",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    })
  }
})

// Get detailed work order timeline
router.get("/work-order-timeline/:workOrderId", authenticateToken,  async (req, res) => {
  try {
    const { workOrderId } = req.params

    // Get work order basic info
    const [workOrder] = await db.execute(
      "SELECT work_order_number, party_name, created_at FROM work_orders WHERE id = ?",
      [workOrderId],
    )

    if (workOrder.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Work order not found",
      })
    }

    // Get detailed timeline from activity logs
    const [timeline] = await db.execute(
      `
      SELECT 
        action,
        performed_by,
        performed_by_role,
        details,
        created_at as timestamp
      FROM activity_logs
      WHERE work_order_id = ?
      ORDER BY created_at ASC
    `,
      [workOrderId],
    )

    res.json({
      success: true,
      data: {
        workOrder: workOrder[0],
        timeline,
      },
    })
  } catch (error) {
    console.error("Get work order timeline error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch work order timeline",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    })
  }
})

module.exports = router
