export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  success: boolean
  token?: string
  user?: User
  message?: string
}

export interface User {
  id: string
  email: string
  role: UserRole
  name: string
}

export type UserRole = "admin" | "manager" | "framing" | "setting" | "polish" | "repair" | "dispatch"

export interface RouteData {
  role?: UserRole | UserRole[]
}
