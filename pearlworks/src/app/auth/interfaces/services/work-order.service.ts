import { Injectable } from "@angular/core"
import  { HttpClient } from "@angular/common/http"
import {  Observable, of, BehaviorSubject } from "rxjs"
import { delay, map } from "rxjs/operators"
import  {
  WorkOrder,
  CreateWorkOrderRequest,
  ActivityLog,
  WorkOrderFilters,
  Worker,
  AssignedWorker,
  StageType,
} from "../work-order.interface"

@Injectable({
  providedIn: "root",
})
export class WorkOrderService {
  private apiUrl = "/api"
  private workOrdersSubject = new BehaviorSubject<WorkOrder[]>([])
  public workOrders$ = this.workOrdersSubject.asObservable()

  // Mock data
  private mockWorkOrders: WorkOrder[] = [
    {
      id: "1",
      workOrderNumber: "WO/001",
      partyName: "ABC Jewelers",
      poNumber: "PO123",
      poDate: new Date("2024-01-15"),
      itemDetails: "Gold Ring Set",
      modelNumber: "GR001",
      descriptionOfWork: "Setting diamonds and polishing",
      status: "in-progress",
      createdDate: new Date("2024-01-15"),
      expectedCompletionDate: new Date("2024-01-25"),
      grossWeight: 15.5,
      netWeight: 14.2,
      stages: [
        {
          id: "1",
          stageName: "framing",
          karigar: "John Doe",
          issueDate: new Date("2024-01-15"),
          issueWeight: 15.5,
          jamahDate: new Date("2024-01-17"),
          jamahWeight: 15.2,
          sortingIssue: 10,
          sortingJamah: 10,
          approved: true,
          status: "completed",
          difference: -0.3,
        },
        {
          id: "2",
          stageName: "setting",
          karigar: "Jane Smith",
          issueDate: new Date("2024-01-17"),
          issueWeight: 15.2,
          status: "in-progress",
          approved: false,
        },
      ],
      stones: [
        {
          id: "1",
          type: "Ruby",
          pieces: 20,
          weightGrams: 1.5,
          weightCarats: 7.5,
          isReceived: true,
          isReturned: false,
        },
        {
          id: "2",
          type: "CZ",
          pieces: 165,
          weightGrams: 1.2,
          weightCarats: 6.0,
          isReceived: true,
          isReturned: false,
        },
      ],
      assignedWorkers: [
        {
          stageType: "framing",
          workerId: "1",
          workerName: "John Doe",
          assignedDate: new Date("2024-01-15"),
        },
        {
          stageType: "setting",
          workerId: "2",
          workerName: "Jane Smith",
          assignedDate: new Date("2024-01-17"),
        },
      ],
    },
    {
      id: "2",
      workOrderNumber: "WO/002",
      partyName: "XYZ Gems",
      poNumber: "PO124",
      poDate: new Date("2024-01-16"),
      itemDetails: "Pearl Necklace",
      modelNumber: "PN002",
      descriptionOfWork: "Pearl setting and finishing",
      status: "pending",
      createdDate: new Date("2024-01-16"),
      expectedCompletionDate: new Date("2024-01-30"),
      grossWeight: 25.0,
      stages: [],
      stones: [],
      assignedWorkers: [],
    },
  ]

  private mockActivityLogs: ActivityLog[] = [
    {
      id: "1",
      workOrderId: "1",
      workOrderNumber: "WO/001",
      action: "Framing stage completed",
      performedBy: "John Doe",
      performedByRole: "framing",
      timestamp: new Date("2024-01-17T10:30:00"),
      details: "Completed framing with weight difference of -0.3g",
    },
    {
      id: "2",
      workOrderId: "1",
      workOrderNumber: "WO/001",
      action: "Setting stage started",
      performedBy: "Jane Smith",
      performedByRole: "setting",
      timestamp: new Date("2024-01-17T14:15:00"),
      details: "Started setting process",
    },
    {
      id: "3",
      workOrderId: "2",
      workOrderNumber: "WO/002",
      action: "Work order created",
      performedBy: "Manager User",
      performedByRole: "manager",
      timestamp: new Date("2024-01-16T09:00:00"),
      details: "New work order created for XYZ Gems",
    },
  ]

  private mockWorkers: Worker[] = [
    { id: "1", name: "John Doe", role: "framing", email: "john@shop.com", isActive: true },
    { id: "2", name: "Jane Smith", role: "setting", email: "jane@shop.com", isActive: true },
    { id: "3", name: "Mike Johnson", role: "polish", email: "mike@shop.com", isActive: true },
    { id: "4", name: "Sarah Wilson", role: "repair", email: "sarah@shop.com", isActive: true },
    { id: "5", name: "Tom Brown", role: "dispatch", email: "tom@shop.com", isActive: true },
    { id: "6", name: "Lisa Davis", role: "framing", email: "lisa@shop.com", isActive: true },
  ]

  constructor(private http: HttpClient) {
    this.workOrdersSubject.next(this.mockWorkOrders)
  }

  getWorkOrders(filters?: WorkOrderFilters): Observable<WorkOrder[]> {
    // Mock API call
    return of(this.mockWorkOrders).pipe(
      delay(500),
      map((orders) => {
        if (!filters) return orders

        return orders.filter((order) => {
          if (filters.status && order.status !== filters.status) return false
          if (filters.partyName && !order.partyName.toLowerCase().includes(filters.partyName.toLowerCase()))
            return false
          if (
            filters.workOrderNumber &&
            !order.workOrderNumber.toLowerCase().includes(filters.workOrderNumber.toLowerCase())
          )
            return false
          if (filters.dateFrom && order.createdDate < filters.dateFrom) return false
          if (filters.dateTo && order.createdDate > filters.dateTo) return false
          return true
        })
      }),
    )
  }

  getWorkOrderById(id: string): Observable<WorkOrder | undefined> {
    return of(this.mockWorkOrders.find((wo) => wo.id === id)).pipe(delay(300))
  }

  createWorkOrder(workOrder: CreateWorkOrderRequest): Observable<WorkOrder> {
  const newWorkOrder: WorkOrder = {
    id: (this.mockWorkOrders.length + 1).toString(),
    workOrderNumber: `WO/${String(this.mockWorkOrders.length + 1).padStart(3, "0")}`,
    ...workOrder,
    status: "pending",
    createdDate: new Date(),
    stages: [],
    stones: workOrder.stones.map((stone, idx) => ({
      ...stone,
      id: (idx + 1).toString(),
      isReturned: false,
    })),
    assignedWorkers: workOrder.assignedWorkers.map((aw) => ({
      ...aw,
      assignedDate: new Date(),
    })),
  }

  this.mockWorkOrders.push(newWorkOrder)
  this.workOrdersSubject.next([...this.mockWorkOrders])

  // Add activity log
  this.mockActivityLogs.push({
    id: (this.mockActivityLogs.length + 1).toString(),
    workOrderId: newWorkOrder.id,
    workOrderNumber: newWorkOrder.workOrderNumber,
    action: "Work order created",
    performedBy: "Manager User",
    performedByRole: "manager",
    timestamp: new Date(),
    details: `New work order created for ${newWorkOrder.partyName}`,
  })

  return of(newWorkOrder).pipe(delay(500))
}
  assignWorkers(workOrderId: string, assignments: AssignedWorker[]): Observable<WorkOrder> {
    const workOrder = this.mockWorkOrders.find((wo) => wo.id === workOrderId)
    if (!workOrder) {
      throw new Error("Work order not found")
    }

    workOrder.assignedWorkers = assignments
    workOrder.status = "in-progress"

    this.workOrdersSubject.next([...this.mockWorkOrders])

    // Add activity log
    this.mockActivityLogs.push({
      id: (this.mockActivityLogs.length + 1).toString(),
      workOrderId: workOrder.id,
      workOrderNumber: workOrder.workOrderNumber,
      action: "Workers assigned",
      performedBy: "Manager User",
      performedByRole: "manager",
      timestamp: new Date(),
      details: `Assigned workers to various stages`,
    })

    return of(workOrder).pipe(delay(500))
  }

  getActivityLogs(): Observable<ActivityLog[]> {
    return of(this.mockActivityLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())).pipe(delay(300))
  }

  getWorkersByRole(role?: StageType): Observable<Worker[]> {
    const workers = role
      ? this.mockWorkers.filter((w) => w.role === role && w.isActive)
      : this.mockWorkers.filter((w) => w.isActive)
    return of(workers).pipe(delay(200))
  }

  getAllWorkers(): Observable<Worker[]> {
    return of(this.mockWorkers.filter((w) => w.isActive)).pipe(delay(200))
  }
}
