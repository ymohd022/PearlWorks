export interface DispatchStatistics {
  overview: {
    totalDispatched: number
    dispatchedToday: number
    dispatchedThisWeek: number
    dispatchedThisMonth: number
    totalDelivered: number
    inTransit: number
    pendingDispatch: number
    readyForDispatch: number
    avgDispatchDays: number
  }
  courierServices: CourierServiceStats[]
  recentActivity: RecentDispatchActivity[]
}

export interface CourierServiceStats {
  courier_service: string
  count: number
  delivered: number
}

export interface RecentDispatchActivity {
  work_order_number: string
  party_name: string
  courier_service: string
  tracking_number: string
  dispatch_date: Date
  delivery_status: string
}

export interface TrackingInfo {
  work_order_number: string
  party_name: string
  product_type: string
  courier_service: string
  tracking_number: string
  dispatch_date: Date
  estimated_delivery_date: Date
  delivery_date: Date
  delivery_status: string
  recipient_name: string
  delivery_address: string
  dispatch_notes: string
}

export interface DeliveryStatusUpdate {
  deliveryStatus: string
  deliveryDate?: Date
  deliveryNotes?: string
  updatedBy: string
}
