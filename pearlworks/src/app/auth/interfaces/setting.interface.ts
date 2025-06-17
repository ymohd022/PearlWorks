export interface SettingWorkOrder extends AssignedWorkOrder {
  modelNumber?: string
  descriptionOfWork?: string
  grossWeight?: number
  netWeight?: number
  weightDifference?: number
  stones: Stone[]
  returnedStones: ReturnedStone[]
  totalStones: number
  returnedStonesCount: number
  issueDate?: Date
  jamahDate?: Date
}

export interface Stone {
  id: string
  workOrderId: string
  type: string
  pieces: number
  weightGrams: number
  weightCarats: number
  isReceived: boolean
  createdAt?: Date
}

export interface ReturnedStone {
  id?: string
  workOrderId?: string
  stageName: string
  type: string
  pieces: number
  weightGrams: number
  weightCarats: number
  returnedBy?: string
  createdAt?: Date
}

export interface SettingUpdateRequest extends StageUpdateRequest {
  returnedStones?: ReturnedStone[]
  sortingIssue?: number
  sortingJamah?: number
  approved?: boolean
}

export interface SettingStatistics {
  totalOrders: number
  pendingOrders: number
  inProgressOrders: number
  completedOrders: number
  onHoldOrders: number
  avgWeightDifference: number
  approvedOrders: number
}

import type { AssignedWorkOrder, StageUpdateRequest } from "./role-dashboard.interface"
