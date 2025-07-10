import { Injectable } from "@angular/core"
import {  Observable, BehaviorSubject } from "rxjs"
import { map, tap } from "rxjs/operators"
import  { ApiService } from "../services/api.service"
import  {
  WorkOrder,
  CreateWorkOrderRequest,
  ActivityLog,
  WorkOrderFilters,
  Worker,
  AssignedWorker,
  StageType,
} from "../../interfaces/work-order.interface"

@Injectable({
  providedIn: "root",
})
export class WorkOrderService {
  private workOrdersSubject = new BehaviorSubject<WorkOrder[]>([])
  public workOrders$ = this.workOrdersSubject.asObservable()

  constructor(private apiService: ApiService) {}

  getWorkOrders(filters?: WorkOrderFilters): Observable<WorkOrder[]> {
    return this.apiService.getWorkOrders(filters).pipe(
      map((response) => response.data || []),
      tap((orders) => this.workOrdersSubject.next(orders)),
    )
  }

  getStoneBalance(workOrderId: string, stage: string = 'setting'): Observable<any> {
  return this.apiService.getStoneBalance(workOrderId, stage);
}

  // Admin-specific method to get detailed work orders
  getAdminWorkOrders(filters?: WorkOrderFilters): Observable<WorkOrder[]> {
    return this.apiService.getDetailedWorkOrders(filters).pipe(
      map((response) => response.data || []),
      tap((orders) => this.workOrdersSubject.next(orders)),
    )
  }

  getWorkOrderById(id: string): Observable<WorkOrder | undefined> {
    return this.getWorkOrders().pipe(map((orders) => orders.find((wo) => wo.id === id)))
  }

  createWorkOrder(workOrder: CreateWorkOrderRequest): Observable<WorkOrder> {
    return this.apiService.createWorkOrder(workOrder).pipe(
      map((response) => response.data),
      tap(() => {
        // Refresh work orders list
        this.getWorkOrders().subscribe()
      }),
    )
  }

  assignWorkers(workOrderId: string, assignments: AssignedWorker[]): Observable<WorkOrder> {
    return this.apiService.assignWorkers(workOrderId, assignments).pipe(
      tap(() => {
        // Refresh work orders list
        this.getWorkOrders().subscribe()
      }),
      map((response) => response.data),
    )
  }

  getActivityLogs(): Observable<ActivityLog[]> {
    return this.apiService.getActivityLogs().pipe(map((response) => response.data || []))
  }

  // Admin-specific method to get detailed activity logs
  getAdminActivityLogs(limit?: number, workOrderId?: string): Observable<ActivityLog[]> {
    return this.apiService.getAdminActivityLogs(limit, workOrderId).pipe(map((response) => response.data || []))
  }

  getWorkersByRole(role?: StageType): Observable<Worker[]> {
    if (role) {
      return this.apiService.getWorkersByRole(role).pipe(map((response) => response.data || []))
    } else {
      return this.getAllWorkers()
    }
  }

  getAllWorkers(): Observable<Worker[]> {
    return this.apiService.getAllWorkers().pipe(map((response) => response.data || []))
  }

    // Get next work order number
  getNextWorkOrderNumber(): Observable<{ workOrderNumber: string }> {
    return this.apiService.getNextWorkOrderNumber()
  }

   getWorkOrderDetails(workOrderId: string): Observable<{ success: boolean; data: any }> {
    return this.apiService.getWorkOrderDetails(workOrderId)
  }
}
