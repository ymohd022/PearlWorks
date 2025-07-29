export interface DispatchOrder {
  id: string
  workOrderNumber: string
  partyName: string
  orderCompletedDate: Date | string
  grossWeight: number
  netWeight: number
  dispatchedBy: string
  status: "ready" | "dispatched"
  images: string[]
  expectedWastage?: number
  stones?: any[]
}

export interface DispatchUpdateRequest {
  orderCompletedDate: string
  dispatchedBy: string
  status: "dispatched"
  grossWeight: number // Add grossWeight
  images: string[] 
}

export interface DispatchStatistics {
  totalReady: number
  totalDispatched: number
  dispatchedToday: number
  dispatchedThisWeek: number
  dispatchedThisMonth: number
}
