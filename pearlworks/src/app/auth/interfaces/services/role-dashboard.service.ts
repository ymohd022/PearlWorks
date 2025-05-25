import { Injectable } from "@angular/core"
import  { HttpClient } from "@angular/common/http"
import { Observable, of, BehaviorSubject } from "rxjs"
import { delay } from "rxjs/operators"
import  {
  AssignedWorkOrder,
  StageUpdateRequest,
  StageUpdateResponse,
  StageType,
} from "../role-dashboard.interface"
import { AuthService } from "./auth.service"

@Injectable({
  providedIn: "root",
})
export class RoleDashboardService {
  private apiUrl = "/api"
  private assignedOrdersSubject = new BehaviorSubject<AssignedWorkOrder[]>([])
  public assignedOrders$ = this.assignedOrdersSubject.asObservable()

  // Mock data for assigned work orders
  private mockAssignedOrders: AssignedWorkOrder[] = [
    {
      id: "1",
      workOrderNumber: "WO/001",
      partyName: "ABC Jewelers",
      productType: "Gold Ring Set",
      issueWeight: 15.5,
      jamahWeight: 15.2,
      assignedDate: new Date("2024-01-15"),
      status: "completed",
      currentStage: "framing",
      notes: "Frame completed successfully",
      expectedCompletionDate: new Date("2024-01-25"),
    },
    {
      id: "2",
      workOrderNumber: "WO/002",
      partyName: "XYZ Gems",
      productType: "Pearl Necklace",
      issueWeight: 25.0,
      assignedDate: new Date("2024-01-16"),
      status: "in-progress",
      currentStage: "framing",
      expectedCompletionDate: new Date("2024-01-30"),
    },
    {
      id: "3",
      workOrderNumber: "WO/003",
      partyName: "Diamond Palace",
      productType: "Diamond Earrings",
      issueWeight: 8.5,
      assignedDate: new Date("2024-01-17"),
      status: "not-started",
      currentStage: "framing",
      expectedCompletionDate: new Date("2024-01-28"),
    },
    {
      id: "4",
      workOrderNumber: "WO/001",
      partyName: "ABC Jewelers",
      productType: "Gold Ring Set",
      issueWeight: 15.2,
      jamahWeight: 14.8,
      assignedDate: new Date("2024-01-17"),
      status: "in-progress",
      currentStage: "setting",
      notes: "Setting diamonds in progress",
      expectedCompletionDate: new Date("2024-01-25"),
    },
    {
      id: "5",
      workOrderNumber: "WO/004",
      partyName: "Royal Gems",
      productType: "Emerald Pendant",
      issueWeight: 12.0,
      assignedDate: new Date("2024-01-18"),
      status: "not-started",
      currentStage: "setting",
      expectedCompletionDate: new Date("2024-01-29"),
    },
    {
  id: "6",
  workOrderNumber: "WO/005",
  partyName: "Gems & Co.",
  productType: "Sapphire Ring",
  issueWeight: 10.5,
  assignedDate: new Date("2024-01-19"),
  status: "in-progress",
  currentStage: "polish", // <-- fix here
  expectedCompletionDate: new Date("2024-01-31"),
},
{
  id: "7",
  workOrderNumber: "WO/006",
  partyName: "Luxury Stones",
  productType: "Ruby Bracelet",
  issueWeight: 18.0,
  assignedDate: new Date("2024-01-20"),
  status: "not-started",
  currentStage: "polish", // <-- fix here
  expectedCompletionDate: new Date("2024-02-01"),
},
    {
      id: "8",
      workOrderNumber: "WO/007",
      partyName: "Elegant Jewelry",
      productType: "Amethyst Earrings",
      issueWeight: 9.2,
      assignedDate: new Date("2024-01-21"),
      status: "in-progress",
      currentStage: "repair",
      expectedCompletionDate: new Date("2024-02-02"),
    },
    {
      id: "9",
      workOrderNumber: "WO/008",
      partyName: "Precious Jewels",
      productType: "Topaz Necklace",
      issueWeight: 14.7,
      assignedDate: new Date("2024-01-22"),
      status: "not-started",
      currentStage: "repair",
      expectedCompletionDate: new Date("2024-02-03"),
    },
    {
      id: "10",
      workOrderNumber: "WO/009",
      partyName: "Golden Creations",
      productType: "Silver Anklet",
      issueWeight: 7.9,
      assignedDate: new Date("2024-01-23"),
      status: "completed",
      currentStage: "dispatch",
      expectedCompletionDate: new Date("2024-02-04"),
    },
  ]

  constructor(
    private http: HttpClient,
    private authService: AuthService,
  ) {}

  getAssignedWorkOrders(stage: StageType): Observable<AssignedWorkOrder[]> {
    // Filter mock data by stage and current user
    const userRole = this.authService.getUserRole()
    const filteredOrders = this.mockAssignedOrders.filter(
      (order) => order.currentStage === stage && (userRole === "admin" || userRole === "manager" || userRole === stage),
    )

    return of(filteredOrders).pipe(delay(500))
  }

  updateStageStatus(workOrderId: string, updateRequest: StageUpdateRequest): Observable<StageUpdateResponse> {
    // Mock API call - replace with actual HTTP request in production
    return this.mockUpdateStageStatus(workOrderId, updateRequest)
  }

  private mockUpdateStageStatus(
    workOrderId: string,
    updateRequest: StageUpdateRequest,
  ): Observable<StageUpdateResponse> {
    return new Observable((observer) => {
      setTimeout(() => {
        const orderIndex = this.mockAssignedOrders.findIndex((order) => order.id === workOrderId)

        if (orderIndex !== -1) {
          // Update the order
          this.mockAssignedOrders[orderIndex] = {
            ...this.mockAssignedOrders[orderIndex],
            status: updateRequest.status,
            notes: updateRequest.notes || this.mockAssignedOrders[orderIndex].notes,
            jamahWeight: updateRequest.jamahWeight || this.mockAssignedOrders[orderIndex].jamahWeight,
          }

          // If completed, add completion date
          if (updateRequest.status === "completed") {
            this.mockAssignedOrders[orderIndex] = {
              ...this.mockAssignedOrders[orderIndex],
              jamahWeight: updateRequest.jamahWeight || this.mockAssignedOrders[orderIndex].issueWeight,
            }
          }

          observer.next({
            success: true,
            message: `${updateRequest.stage} stage updated successfully`,
            workOrder: this.mockAssignedOrders[orderIndex],
          })
        } else {
          observer.next({
            success: false,
            message: "Work order not found",
          })
        }
        observer.complete()
      }, 1000) // Simulate network delay
    })
  }

  // Get work order by ID for detailed view
  getWorkOrderById(id: string): Observable<AssignedWorkOrder | undefined> {
    const order = this.mockAssignedOrders.find((wo) => wo.id === id)
    return of(order).pipe(delay(300))
  }

  // Refresh assigned orders
  refreshAssignedOrders(stage: StageType): void {
    this.getAssignedWorkOrders(stage).subscribe((orders) => {
      this.assignedOrdersSubject.next(orders)
    })
  }

  // Get completed work orders for dispatch
  getCompletedWorkOrders(): Observable<AssignedWorkOrder[]> {
    // Filter mock data for completed orders
    const completedOrders = this.mockAssignedOrders.filter((order) => order.status === "completed")
    return of(completedOrders).pipe(delay(500))
  }

 updateDispatchStatus(workOrderId: string, updateRequest: StageUpdateRequest): Observable<StageUpdateResponse> {
  // Mock API call for dispatch update
  return this.mockUpdateDispatchStatus(workOrderId, updateRequest)
}


 private mockUpdateDispatchStatus(workOrderId: string, updateRequest: StageUpdateRequest): Observable<StageUpdateResponse> {
  return new Observable((observer) => {
    setTimeout(() => {
      const orderIndex = this.mockAssignedOrders.findIndex((order) => order.id === workOrderId)

      if (orderIndex !== -1) {
        // remove the order from the mock data
        this.mockAssignedOrders.splice(orderIndex, 1)

        observer.next({
          success: true,
          message: `Work order dispatched successfully`,
        })
      } else {
        observer.next({
          success: false,
          message: "Work order not found",
        })
      }
      observer.complete()
    }, 1000) // Simulate network delay
  })
}
}