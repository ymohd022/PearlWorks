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

  logout(): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/logout`, {}, { headers: this.getHeaders() })
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

  getActivityLogs(): Observable<any> {
    return this.http.get(`${this.apiUrl}/work-orders/activity-logs`, {
      headers: this.getHeaders(),
    })
  }

  // Role Dashboard endpoints
getAssignedOrders(stage: string): Observable<any> {
  return this.http.get(`${this.apiUrl}/dashboard/assigned-orders/${stage}`, {
    headers: this.getHeaders(),
  });
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

  // Statistics endpoints
  getFramingStatistics(): Observable<any> {
    return this.http.get(`${this.apiUrl}/framing/statistics`, {
      headers: this.getHeaders(),
    })
  }

  getSettingStatistics(): Observable<any> {
    return this.http.get(`${this.apiUrl}/setting/statistics`, {
      headers: this.getHeaders(),
    })
  }

  // Stones endpoints
  getStones(workOrderId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/setting/stones/${workOrderId}`, {
      headers: this.getHeaders(),
    })
  }

  // Users endpoints
  getAllWorkers(): Observable<any> {
    return this.http.get(`${this.apiUrl}/users/workers`, {
      headers: this.getHeaders(),
    })
  }

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
