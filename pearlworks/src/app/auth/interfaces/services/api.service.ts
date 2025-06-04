import { Injectable } from "@angular/core"
import { HttpClient, HttpHeaders } from "@angular/common/http"
import { Observable } from "rxjs"
import { environment } from "../../../environments/environment"

@Injectable({
  providedIn: "root",
})
export class ApiService {
  private apiUrl = environment.apiUrl

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem("auth_token")
    return new HttpHeaders({
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
    })
  }

  // Auth endpoints
  login(credentials: { email: string; password: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/login`, credentials)
  }

  // Add logout method
  logout(): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/auth/logout`, 
      {},
      { headers: this.getHeaders() }
    )
  }

  // Work Orders endpoints
  getWorkOrders(filters?: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/work-orders`, {
      headers: this.getHeaders(),
      params: filters,
    })
  }

  createWorkOrder(workOrder: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/work-orders`, workOrder, {
      headers: this.getHeaders(),
    })
  }

  assignWorkers(workOrderId: string, assignments: any[]): Observable<any> {
    return this.http.put(
      `${this.apiUrl}/work-orders/${workOrderId}/assign-workers`,
      { assignments },
      {
        headers: this.getHeaders(),
      },
    )
  }

  // Add activity logs method
  getActivityLogs(): Observable<any> {
    return this.http.get(`${this.apiUrl}/work-orders/activity-logs`, {
      headers: this.getHeaders(),
    })
  }

  // Framing endpoints
  getAssignedOrders(stage: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/dashboard/assigned-orders/${stage}`, {
      headers: this.getHeaders(),
    })
  }

  updateStageStatus(workOrderId: string, updateRequest: any): Observable<any> {
    return this.http.put(
      `${this.apiUrl}/dashboard/update-stage/${workOrderId}`, 
      updateRequest,
      {
        headers: this.getHeaders(),
      }
    )
  }

  getFramingStatistics(): Observable<any> {
    return this.http.get(`${this.apiUrl}/framing/statistics`, {
      headers: this.getHeaders(),
    })
  }

  // Users endpoints
  getAllWorkers(): Observable<any> {
    return this.http.get(`${this.apiUrl}/users/workers`, {
      headers: this.getHeaders(),
    })
  }

  // Add workers by role method
  getWorkersByRole(role: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/users/workers/by-role/${role}`, {
      headers: this.getHeaders(),
    })
  }

  getCompletedOrders(): Observable<any> {
    return this.http.get(`${this.apiUrl}/dashboard/completed-orders`, {
      headers: this.getHeaders(),
    })
  }
}