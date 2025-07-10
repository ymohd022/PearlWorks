import { Injectable } from "@angular/core"
import  { Observable } from "rxjs"
import  { ApiService } from "./api.service"
import  { DispatchOrder, DispatchUpdateRequest, DispatchStatistics } from "../dispatch.interface"
@Injectable({
  providedIn: 'root'
})
export class DispatchService {
  constructor(private apiService: ApiService) {}

  getAssignedOrders(): Observable<{ success: boolean; data: DispatchOrder[] }> {
    return this.apiService.getDispatchAssignedOrders()
  }

  updateDispatchStatus(orderId: string, updateRequest: DispatchUpdateRequest): Observable<any> {
    return this.apiService.updateDispatchStatus(orderId, updateRequest)
  }

  getStatistics(): Observable<{ success: boolean; data: DispatchStatistics }> {
    return this.apiService.getDispatchStatistics()
  }
}