import { Injectable } from "@angular/core"
import  { Observable } from "rxjs"
import { map } from "rxjs/operators"
import  { ApiService } from "../services/api.service"
import  {
  AssignedWorkOrder,
  StageUpdateRequest,
  StageUpdateResponse,
  StageType,
} from "../../interfaces/role-dashboard.interface"

@Injectable({
  providedIn: "root",
})
export class RoleDashboardService {
  constructor(private apiService: ApiService) {}

  getAssignedWorkOrders(stage: StageType): Observable<AssignedWorkOrder[]> {
    return this.apiService.getAssignedOrders(stage).pipe(map((response) => response.data))
  }

  updateStageStatus(workOrderId: string, updateRequest: StageUpdateRequest): Observable<StageUpdateResponse> {
    return this.apiService.updateStageStatus(workOrderId, updateRequest).pipe(
      map((response) => ({
        success: response.success,
        message: response.message,
        workOrder: response.data,
      })),
    )
  }

  getWorkOrderById(id: string): Observable<AssignedWorkOrder | undefined> {
    // This would need to be implemented in the API if needed
    throw new Error("Method not implemented in API")
  }

  refreshAssignedOrders(stage: StageType): void {
    this.getAssignedWorkOrders(stage).subscribe()
  }

  getCompletedWorkOrders(): Observable<AssignedWorkOrder[]> {
    return this.apiService.getCompletedOrders().pipe(map((response) => response.data))
  }

  updateDispatchStatus(workOrderId: string, updateRequest: StageUpdateRequest): Observable<StageUpdateResponse> {
    return this.updateStageStatus(workOrderId, updateRequest)
  }
}
