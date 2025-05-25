export interface AssignedWorkOrder {
  id: string
  workOrderNumber: string
  partyName: string
  productType: string
  issueWeight: number
  jamahWeight?: number
  assignedDate: Date
  status: StageStatus
  notes?: string
  expectedCompletionDate?: Date
  currentStage: StageType
}

export interface StageUpdateRequest {
  stage: StageType
  status: StageStatus
  updatedBy: string
  notes?: string
  jamahWeight?: number
  completedDate?: Date
}

export interface StageUpdateResponse {
  success: boolean
  message: string
  workOrder?: AssignedWorkOrder
}

export type StageStatus = "not-started" | "in-progress" | "completed" | "on-hold"
export type StageType = "framing" | "setting" | "polish" | "repair" | "dispatch"
