import { Injectable } from "@angular/core"
import {  HttpClient, HttpHeaders } from "@angular/common/http"
import  { Observable } from "rxjs"
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

    getData(): Observable<any> {
    return this.http.get(`${this.apiUrl}/data`, { headers: this.getHeaders() })
  }

  postData(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/data`, data, { headers: this.getHeaders() })
  }

  getStoneBalance(workOrderId: string, stage: string): Observable<any> {
  return this.http.get(`${this.apiUrl}/work-orders/${workOrderId}/stone-balance`, {
    headers: this.getHeaders(),
    params: { stage }
  });
}

  updateData(id: string, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/data/${id}`, data, { headers: this.getHeaders() })
  }

  deleteData(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/data/${id}`, { headers: this.getHeaders() })
  }

  // Auth endpoints
  login(credentials: { email: string; password: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/login`, credentials)
  }

  logout(): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/logout`, {}, { headers: this.getHeaders() })
  }

  getWorkOrder(workOrderId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/work-orders/${workOrderId}`, { headers: this.getHeaders() })
  }

  // Work Orders endpoints
  getWorkOrders(filters?: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/work-orders`, {
      headers: this.getHeaders(),
      params: filters || {},
    })
  }

// FIXED: Create work order with image upload support
  createWorkOrder(workOrder: any): Observable<any> {
    const formData = new FormData()

    // Add basic work order data
    Object.keys(workOrder).forEach((key) => {
      if (key === "images" && workOrder[key]) {
        // Handle file uploads
        for (let i = 0; i < workOrder[key].length; i++) {
          formData.append("images", workOrder[key][i])
        }
      } else if (key === "stones" || key === "assignedWorkers") {
        // Handle arrays as JSON strings
        formData.append(key, JSON.stringify(workOrder[key] || []))
      } else if (workOrder[key] !== null && workOrder[key] !== undefined) {
        formData.append(key, workOrder[key])
      }
    })

    // Don't set Content-Type header - let browser set it with boundary for FormData
    const token = localStorage.getItem("auth_token")
    const headers = new HttpHeaders({
      Authorization: token ? `Bearer ${token}` : "",
    })

    return this.http.post(`${this.apiUrl}/work-orders`, formData, { headers })
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

    // Get next work order number
  getNextWorkOrderNumber(): Observable<any> {
    return this.http.get(`${this.apiUrl}/work-orders/next-number`, {
      headers: this.getHeaders(),
    })
  }

  getWorkOrderDetails(workOrderId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/work-orders/${workOrderId}/details`, {
      headers: this.getHeaders(),
    })
  }

  
  // Manager-specific endpoints
  getManagerWorkOrders(filters?: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/manager/work-orders`, {
      headers: this.getHeaders(),
      params: filters || {},
    })
  }

  getManagerStageOrders(stage: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/manager/stage-orders/${stage}`, {
      headers: this.getHeaders(),
    })
  }

  getDispatchReadyOrders(): Observable<any>
{
  return this.http.get(`${this.apiUrl}/dispatch/ready-orders`, {
    headers: this.getHeaders(),
  });
}





  // Add this method to ApiService
updateManagerStageStatus(workOrderId: string, updateRequest: any): Observable<any> {
  // Handle image uploads separately
  if (updateRequest.updateImages && updateRequest.updateImages.length > 0) {
    const formData = new FormData();
    
    // Add all form fields
    Object.keys(updateRequest).forEach(key => {
      if (key === 'updateImages') {
        updateRequest[key].forEach((file: File) => {
          formData.append('updateImages', file);
        });
      } else {
        formData.append(key, updateRequest[key]);
      }
    });
    
    const token = localStorage.getItem('auth_token');
    const headers = new HttpHeaders({
      Authorization: token ? `Bearer ${token}` : '',
    });
    
    return this.http.put(
      `${this.apiUrl}/manager/update-stage/${workOrderId}`, 
      formData, 
      { headers }
    );
  }
  
  // Regular request without images
  return this.http.put(
    `${this.apiUrl}/manager/update-stage/${workOrderId}`, 
    updateRequest, 
    { headers: this.getHeaders() }
  );
}

getDispatchAssignedOrders(): Observable<any>
{
  return this.http.get(`${this.apiUrl}/dispatch/assigned-orders`, {
    headers: this.getHeaders(),
  });
}

updateDispatchStatus(orderId: string, updateRequest: any): Observable<any>
{
  return this.http.put(
    `${this.apiUrl}/dispatch/update-status/${orderId}`, 
    updateRequest, 
    {
      headers: this.getHeaders(),
    }
  );
}

getDispatchStatistics(): Observable<any>
{
  return this.http.get(`${this.apiUrl}/dispatch/statistics`, {
    headers: this.getHeaders(),
  });
}

  getManagerStatistics(): Observable<any> {
    return this.http.get(`${this.apiUrl}/manager/statistics`, {
      headers: this.getHeaders(),
    })
  }

  // Admin-specific endpoints
  getDetailedWorkOrders(filters?: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/admin/work-orders`, {
      headers: this.getHeaders(),
      params: filters || {},
    })
  }

  getAdminActivityLogs(limit?: number, workOrderId?: string): Observable<any> {
    const params: any = {}
    if (limit) params.limit = limit.toString()
    if (workOrderId) params.workOrderId = workOrderId

    return this.http.get(`${this.apiUrl}/admin/activity-logs`, {
      headers: this.getHeaders(),
      params,
    })
  }

  getAdminStatistics(): Observable<any> {
    return this.http.get(`${this.apiUrl}/admin/statistics`, {
      headers: this.getHeaders(),
    })
  }

  getWorkOrderTimeline(workOrderId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/admin/work-order-timeline/${workOrderId}`, {
      headers: this.getHeaders(),
    })
  }

  // User Management endpoints
  getUsers(filters?: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/admin/users`, {
      headers: this.getHeaders(),
      params: filters || {},
    })
  }

  createUser(user: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/admin/users`, user, {
      headers: this.getHeaders(),
    })
  }

  updateUser(userId: string, user: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/admin/users/${userId}`, user, {
      headers: this.getHeaders(),
    })
  }

  deleteUser(userId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/admin/users/${userId}`, {
      headers: this.getHeaders(),
    })
  }

  getUserStatistics(): Observable<any> {
    return this.http.get(`${this.apiUrl}/admin/user-statistics`, {
      headers: this.getHeaders(),
    })
  }

  // Role Dashboard endpoints
  getAssignedOrders(stage: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${stage}/assigned-orders`, {
      headers: this.getHeaders(),
    })
  }

 updateStageStatus(workOrderId: string, updateRequest: any): Observable<any> {
    const stage = updateRequest.stage

    // Check if there are images to upload
    if (updateRequest.updateImages && updateRequest.updateImages.length > 0) {
      const formData = new FormData()

      // Add all form fields
      Object.keys(updateRequest).forEach((key) => {
        if (key === "updateImages") {
          // Handle file uploads
          for (let i = 0; i < updateRequest[key].length; i++) {
            formData.append("updateImages", updateRequest[key][i])
          }
        } else if (key === "addedStones" || key === "receivedStones" || key === "returnedStones") {
          // Handle arrays as JSON strings
          formData.append(key, JSON.stringify(updateRequest[key] || []))
        } else if (updateRequest[key] !== null && updateRequest[key] !== undefined) {
          formData.append(key, updateRequest[key])
        }
      })

      // Don't set Content-Type header for FormData
      const token = localStorage.getItem("auth_token")
      const headers = new HttpHeaders({
        Authorization: token ? `Bearer ${token}` : "",
      })

      return this.http.put(`${this.apiUrl}/${stage}/update-status/${workOrderId}`, formData, { headers })
    } else {
      // Regular JSON request if no images
      return this.http.put(`${this.apiUrl}/${stage}/update-status/${workOrderId}`, updateRequest, {
        headers: this.getHeaders(),
      })
    }
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

  // Polish endpoints
  getPolishStatistics(): Observable<any> {
    return this.http.get(`${this.apiUrl}/polish/statistics`, {
      headers: this.getHeaders(),
    })
  }

  returnStones(workOrderId: string, stones: any[]): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/polish/stones/${workOrderId}/return`,
      { stones },
      {
        headers: this.getHeaders(),
      },
    )
  }

  // Repair endpoints
  getRepairStatistics(): Observable<any> {
    return this.http.get(`${this.apiUrl}/repair/statistics`, {
      headers: this.getHeaders(),
    })
  }

  getRepairWorkOrder(workOrderId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/repair/work-order/${workOrderId}`, {
      headers: this.getHeaders(),
    })
  }

  // Dispatch endpoints
  // getDispatchStatistics(): Observable<any> {
  //   return this.http.get(`${this.apiUrl}/dispatch/statistics`, {
  //     headers: this.getHeaders(),
  //   })
  // }

  getTrackingInfo(workOrderId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/dispatch/tracking/${workOrderId}`, {
      headers: this.getHeaders(),
    })
  }

  updateDeliveryStatus(workOrderId: string, statusUpdate: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/dispatch/delivery-status/${workOrderId}`, statusUpdate, {
      headers: this.getHeaders(),
    })
  }
}