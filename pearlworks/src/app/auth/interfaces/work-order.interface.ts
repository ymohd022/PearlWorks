export interface WorkOrder {
  id: string
  workOrderNumber: string
  partyName: string
  poNumber?: string
  poDate?: string
  itemDetails?: string
  modelNumber?: string
  approxWeight?: number;
  descriptionOfWork?: string
  status: WorkOrderStatus
  createdDate: string
  expectedCompletionDate?: string
  completedDate?: string
  grossWeight?: number
  netWeight?: number
  dispatchedBy?: string
  stages: WorkOrderStage[]
  stones: Stone[]
  assignedWorkers: AssignedWorker[]
}

export interface WorkOrderStage {
  id: string
  stageName: StageType
  karigar?: string
  issueDate?: string
  issueWeight?: number
  jamahDate?: string
  jamahWeight?: number
  sortingIssue?: number
  sortingJamah?: number
  approved: boolean
  status: StageStatus
  difference?: number
}

export interface Stone {
  id: string
  type: string
  pieces: number
  weightGrams: number
  weightCarats: number
  isReceived: boolean
  isReturned: boolean
}

export interface AssignedWorker {
  stageType: StageType
  workerId: string
  workerName: string
  assignedDate: string
}

export interface ActivityLog {
  id: string
  workOrderId: string
  workOrderNumber: string
  action: string
  performedBy: string
  performedByRole: string
  timestamp: Date
  details?: string
}

export interface CreateWorkOrderRequest {
  workOrderNumber?: string
  partyName: string
  poNumber?: string
  poDate?: string // Changed from Date to string
  itemDetails?: string
  modelNumber?: string
  approxWeight?: number
  descriptionOfWork?: string
  expectedCompletionDate?: string // Changed from Date to string
  images?: File[] // Add images property
  stones: Omit<Stone, "id" | "isReturned">[]
  assignedWorkers: Omit<AssignedWorker, "assignedDate">[]
}

export type WorkOrderStatus = "pending" | "in-progress" | "completed" | "dispatched" | "cancelled"
export type StageStatus = "not-started" | "in-progress" | "completed" | "on-hold" | "dispatched"
export type StageType = "framing" | "setting" | "polish" | "repair" | "dispatch"

export interface WorkOrderFilters {
  status?: WorkOrderStatus
  dateFrom?: Date
  dateTo?: Date
  partyName?: string
  workOrderNumber?: string
}

export interface Worker {
  id: string
  name: string
  role: StageType
  email: string
  isActive: boolean
}
