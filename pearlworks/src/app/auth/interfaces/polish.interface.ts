export interface PolishStatistics {
  totalOrders: number
  pendingOrders: number
  inProgressOrders: number
  completedOrders: number
  onHoldOrders: number
  avgWeightDifference: string
  approvedOrders: number
  overdueOrders: number
  recentActivities: PolishActivity[]
}

export interface PolishActivity {
  action: string
  performedBy: string
  details: string
  createdAt: Date
  workOrderNumber: string
}

export interface PolishWorkOrder {
  id: string
  workOrderNumber: string
  partyName: string
  poNumber?: string
  poDate?: Date
  itemDetails: string
  modelNumber?: string
  descriptionOfWork?: string
  grossWeight?: number
  netWeight?: number
  expectedCompletionDate?: Date
  issueWeight: number
  jamahWeight?: number
  issueDate: Date
  jamahDate?: Date
  sortingIssue?: number
  sortingJamah?: number
  weightDifference?: number
  status: StageStatus
  approved: boolean
  notes?: string
  karigarName?: string
  assignedDate: Date
}

export interface Stone {
  id?: number
  type: string
  pieces: number
  weightGrams: number
  weightCarats: number
  createdAt?: Date
  returnedDate?: Date
}

export interface StonesData {
  receivedStones: Stone[]
  returnedStones: Stone[]
}

export interface PolishUpdateRequest {
  status: StageStatus
  jamahWeight?: number
  notes?: string
  completedDate?: Date
  sortingJamah?: number
  approved?: boolean
  weightDifference?: number
}

export type StageStatus = "not-started" | "in-progress" | "completed" | "on-hold"
