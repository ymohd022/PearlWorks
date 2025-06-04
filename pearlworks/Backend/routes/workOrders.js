const express = require("express")
const { body, validationResult } = require("express-validator")
const db = require("../config/database")
const { authenticateToken, authorizeRoles } = require("../middleware/auth")

const router = express.Router()

// Get all work orders with filters
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { status, partyName, workOrderNumber, dateFrom, dateTo } = req.query

    let query = `
      SELECT wo.*, 
             COUNT(DISTINCT wa.id) as assigned_workers_count,
             COUNT(DISTINCT s.id) as stones_count
      FROM work_orders wo
      LEFT JOIN worker_assignments wa ON wo.id = wa.work_order_id
      LEFT JOIN stones s ON wo.id = s.work_order_id
      WHERE 1=1
    `

    const params = []

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
      params.push(dateTo + " 23:59:59")
    }

    query += " GROUP BY wo.id ORDER BY wo.created_at DESC"

    const [workOrders] = await db.execute(query, params)

    // Get stages and assigned workers for each work order
    for (const workOrder of workOrders) {
      // Get stages
      const [stages] = await db.execute("SELECT * FROM work_order_stages WHERE work_order_id = ? ORDER BY id", [
        workOrder.id,
      ])

      // Get assigned workers
      const [assignedWorkers] = await db.execute(
        `
        SELECT wa.*, u.name as worker_name, u.email as worker_email
        FROM worker_assignments wa
        JOIN users u ON wa.user_id = u.id
        WHERE wa.work_order_id = ?
      `,
        [workOrder.id],
      )

      // Get stones
      const [stones] = await db.execute("SELECT * FROM stones WHERE work_order_id = ?", [workOrder.id])

      workOrder.stages = stages
      workOrder.assignedWorkers = assignedWorkers
      workOrder.stones = stones
    }

    res.json({
      success: true,
      data: workOrders,
    })
  } catch (error) {
    console.error("Get work orders error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch work orders",
    })
  }
})

// Create new work order
router.post(
  "/",
  [
    authenticateToken,
    authorizeRoles("admin", "manager"),
    body("partyName").notEmpty().trim(),
    body("itemDetails").notEmpty().trim(),
    body("stones").isArray(),
  ],
  async (req, res) => {
    const connection = await db.getConnection()

    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        })
      }

      await connection.beginTransaction()

      const {
        partyName,
        poNumber,
        poDate,
        itemDetails,
        modelNumber,
        descriptionOfWork,
        expectedCompletionDate,
        stones,
        assignedWorkers,
      } = req.body

      // Generate work order number
      const [lastOrder] = await connection.execute("SELECT work_order_number FROM work_orders ORDER BY id DESC LIMIT 1")

      let nextNumber = 1
      if (lastOrder.length > 0) {
        const lastNumber = Number.parseInt(lastOrder[0].work_order_number.split("/")[1])
        nextNumber = lastNumber + 1
      }

      const workOrderNumber = `WO/${nextNumber.toString().padStart(3, "0")}`

      // Insert work order
      const [workOrderResult] = await connection.execute(
        `
      INSERT INTO work_orders (
        work_order_number, party_name, po_number, po_date, item_details,
        model_number, description_of_work, expected_completion_date, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
        [
          workOrderNumber,
          partyName,
          poNumber,
          poDate,
          itemDetails,
          modelNumber,
          descriptionOfWork,
          expectedCompletionDate,
          req.user.id,
        ],
      )

      const workOrderId = workOrderResult.insertId

      // Insert stones
      if (stones && stones.length > 0) {
        for (const stone of stones) {
          await connection.execute(
            `
          INSERT INTO stones (work_order_id, type, pieces, weight_grams, weight_carats)
          VALUES (?, ?, ?, ?, ?)
        `,
            [workOrderId, stone.type, stone.pieces, stone.weightGrams, stone.weightCarats],
          )
        }
      }

      // Insert worker assignments
      if (assignedWorkers && assignedWorkers.length > 0) {
        for (const assignment of assignedWorkers) {
          await connection.execute(
            `
          INSERT INTO worker_assignments (work_order_id, user_id, stage_type)
          VALUES (?, ?, ?)
        `,
            [workOrderId, assignment.workerId, assignment.stageType],
          )
        }

        // Update work order status to in-progress
        await connection.execute("UPDATE work_orders SET status = ? WHERE id = ?", ["in-progress", workOrderId])
      }

      // Add activity log
      await connection.execute(
        `
      INSERT INTO activity_logs (work_order_id, work_order_number, action, performed_by, performed_by_role, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
        [
          workOrderId,
          workOrderNumber,
          "Work order created",
          req.user.name,
          req.user.role,
          `New work order created for ${partyName}`,
        ],
      )

      await connection.commit()

      // Get the created work order with all details
      const [newWorkOrder] = await connection.execute("SELECT * FROM work_orders WHERE id = ?", [workOrderId])

      res.status(201).json({
        success: true,
        message: "Work order created successfully",
        data: newWorkOrder[0],
      })
    } catch (error) {
      await connection.rollback()
      console.error("Create work order error:", error)
      res.status(500).json({
        success: false,
        message: "Failed to create work order",
      })
    } finally {
      connection.release()
    }
  },
)

// Assign workers to work order
router.put(
  "/:id/assign-workers",
  [authenticateToken, authorizeRoles("admin", "manager"), body("assignments").isArray()],
  async (req, res) => {
    const connection = await db.getConnection()

    try {
      await connection.beginTransaction()

      const workOrderId = req.params.id
      const { assignments } = req.body

      // Delete existing assignments
      await connection.execute("DELETE FROM worker_assignments WHERE work_order_id = ?", [workOrderId])

      // Insert new assignments
      for (const assignment of assignments) {
        if (assignment.workerId) {
          await connection.execute(
            `
          INSERT INTO worker_assignments (work_order_id, user_id, stage_type)
          VALUES (?, ?, ?)
        `,
            [workOrderId, assignment.workerId, assignment.stageType],
          )
        }
      }

      // Update work order status
      await connection.execute("UPDATE work_orders SET status = ? WHERE id = ?", ["in-progress", workOrderId])

      // Get work order number for activity log
      const [workOrder] = await connection.execute("SELECT work_order_number FROM work_orders WHERE id = ?", [
        workOrderId,
      ])

      // Add activity log
      await connection.execute(
        `
      INSERT INTO activity_logs (work_order_id, work_order_number, action, performed_by, performed_by_role, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
        [
          workOrderId,
          workOrder[0].work_order_number,
          "Workers assigned",
          req.user.name,
          req.user.role,
          "Assigned workers to various stages",
        ],
      )

      await connection.commit()

      res.json({
        success: true,
        message: "Workers assigned successfully",
      })
    } catch (error) {
      await connection.rollback()
      console.error("Assign workers error:", error)
      res.status(500).json({
        success: false,
        message: "Failed to assign workers",
      })
    } finally {
      connection.release()
    }
  },
)

// Get activity logs
router.get("/activity-logs", authenticateToken, async (req, res) => {
  try {
    const [logs] = await db.execute(`
      SELECT * FROM activity_logs 
      ORDER BY created_at DESC 
      LIMIT 50
    `)

    res.json({
      success: true,
      data: logs,
    })
  } catch (error) {
    console.error("Get activity logs error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch activity logs",
    })
  }
})

module.exports = router
