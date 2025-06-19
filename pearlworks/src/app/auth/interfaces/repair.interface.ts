export interface RepairStatistics {
  totalAssigned: number
  notStarted: number
  inProgress: number
  completed: number
  onHold: number
  overdue: number
  avgCompletionDays: number
  completionRate: string
  recentActivity: RepairActivity[]
  weightStats: RepairWeightStats
}

export interface RepairActivity {
  workOrderNumber: string
  partyName: string
  status: string
  updatedAt: Date
  notes?: string
}

export interface RepairWeightStats {
  totalIssueWeight: number
  totalJamahWeight: number
  avgIssueWeight: number
  avgJamahWeight: number
  completedWithWeight: number
}

export interface RepairWorkOrder {
  id: string
  workOrderNumber: string
  partyName: string
  productType: string
  descriptionOfWork?: string
  issueWeight: number
  jamahWeight?: number
  assignedDate: Date
  status: "not-started" | "in-progress" | "completed" | "on-hold"
  notes?: string
  expectedCompletionDate?: Date
  currentStage: string
}

export const REPAIR_TYPES = [
  "Stone Replacement",
  "Prong Repair",
  "Ring Sizing",
  "Chain Repair",
  "Clasp Repair",
  "Pearl Restringing",
  "Surface Restoration",
  "Structural Repair",
  "Soldering",
  "Polishing Touch-up",
  "Engraving Repair",
  "Setting Repair",
  "Other",
] as const

export type RepairType = (typeof REPAIR_TYPES)[number]
