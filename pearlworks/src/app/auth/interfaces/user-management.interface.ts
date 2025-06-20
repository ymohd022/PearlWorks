export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  isActive: boolean
  createdAt: Date | string
  updatedAt: Date | string
}

export interface CreateUserRequest {
  email: string
  password: string
  name: string
  role: UserRole
}

export interface UpdateUserRequest {
  email?: string
  name?: string
  role?: UserRole
  isActive?: boolean
  password?: string
}

export interface UserFilters {
  role?: UserRole
  isActive?: boolean
  search?: string
}

export type UserRole = "admin" | "manager" | "framing" | "setting" | "polish" | "repair" | "dispatch"

export interface UserStatistics {
  totalUsers: number
  activeUsers: number
  inactiveUsers: number
  usersByRole: Record<UserRole, number>
}
