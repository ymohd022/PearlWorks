import { Injectable } from "@angular/core"
import  { Observable } from "rxjs"
import { map } from "rxjs/operators"
import { ApiService } from "./api.service"
import  {
  AssignedWorkOrder,
  StageUpdateRequest,
  StageUpdateResponse,
  StageType,
} from "../../interfaces/role-dashboard.interface"
import { SettingStatistics, SettingWorkOrder } from "../setting.interface"

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

  getSettingStatistics(): Observable<{ success: boolean; data: SettingStatistics }> {
    return this.apiService.getSettingStatistics()
  }

  getFramingStatistics(): Observable<{ success: boolean; data: any }> {
    return this.apiService.getFramingStatistics()
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

  getStones(workOrderId: string): Observable<any> {
    return this.apiService.getStones(workOrderId)
  }
  getSettingWorkOrders(): Observable<SettingWorkOrder[]> {
  return this.apiService.getAssignedOrders("setting").pipe(
    map((response: any) => response.data as SettingWorkOrder[])
  );
}
}
