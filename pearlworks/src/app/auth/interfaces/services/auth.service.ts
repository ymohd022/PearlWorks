import { Injectable } from "@angular/core"
import  { HttpClient } from "@angular/common/http"
import { BehaviorSubject, Observable } from "rxjs"
import { LoginResponse, User, UserRole } from "../auth.interface"

@Injectable({
  providedIn: "root",
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<User | null>(null)
  public currentUser$ = this.currentUserSubject.asObservable()

  // Mock user database
  private mockUsers = [
    { id: "1", email: "admin@shop.com", password: "123456", role: "admin" as UserRole, name: "Admin User" },
    { id: "2", email: "manager@shop.com", password: "123456", role: "manager" as UserRole, name: "Manager User" },
    { id: "3", email: "framing@shop.com", password: "123456", role: "framing" as UserRole, name: "Framing Specialist" },
    { id: "4", email: "setting@shop.com", password: "123456", role: "setting" as UserRole, name: "Setting Specialist" },
    { id: "5", email: "polish@shop.com", password: "123456", role: "polish" as UserRole, name: "Polish Specialist" },
    { id: "6", email: "repair@shop.com", password: "123456", role: "repair" as UserRole, name: "Repair Specialist" },
    { id: "7", email: "dispatch@shop.com", password: "123456", role: "dispatch" as UserRole, name: "Dispatch Manager" },
  ]

  constructor(private http: HttpClient) {
    // Check if user is already logged in
    const token = this.getToken()
    const userData = this.getUserData()
    if (token && userData) {
      this.currentUserSubject.next(userData)
    }
  }

  login(email: string, password: string): Observable<LoginResponse> {
    // Mock API call - replace with actual HTTP request in production
    return this.mockLogin(email, password)
  }

  private mockLogin(email: string, password: string): Observable<LoginResponse> {
    // Simulate API delay
    return new Observable((observer) => {
      setTimeout(() => {
        const user = this.mockUsers.find((u) => u.email === email && u.password === password)

        if (user) {
          const token = this.generateMockToken(user)
          const userData: User = {
            id: user.id,
            email: user.email,
            role: user.role,
            name: user.name,
          }

          // Store token and user data
          localStorage.setItem("auth_token", token)
          localStorage.setItem("user_data", JSON.stringify(userData))

          this.currentUserSubject.next(userData)

          observer.next({
            success: true,
            token,
            user: userData,
          })
        } else {
          observer.next({
            success: false,
            message: "Invalid email or password",
          })
        }
        observer.complete()
      }, 1000) // Simulate network delay
    })
  }

  private generateMockToken(user: any): string {
    // Generate a mock JWT token
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))
    const payload = btoa(
      JSON.stringify({
        sub: user.id,
        email: user.email,
        role: user.role,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24 hours
      }),
    )
    const signature = btoa("mock-signature")

    return `${header}.${payload}.${signature}`
  }

  logout(): void {
    localStorage.removeItem("auth_token")
    localStorage.removeItem("user_data")
    this.currentUserSubject.next(null)
  }

  getToken(): string | null {
    return localStorage.getItem("auth_token")
  }

  getUserData(): User | null {
    const userData = localStorage.getItem("user_data")
    return userData ? JSON.parse(userData) : null
  }

  getUserRole(): UserRole | null {
    const user = this.getUserData()
    return user ? user.role : null
  }

  isLoggedIn(): boolean {
    const token = this.getToken()
    const user = this.getUserData()
    return !!(token && user)
  }

  hasRole(requiredRole: UserRole | UserRole[]): boolean {
    const userRole = this.getUserRole()
    if (!userRole) return false

    if (Array.isArray(requiredRole)) {
      return requiredRole.includes(userRole)
    }

    return userRole === requiredRole
  }

  getRoleDashboardRoute(role: UserRole): string {
    const roleRoutes: Record<UserRole, string> = {
      admin: "/admin",
      manager: "/manager",
      framing: "/framing",
      setting: "/setting",
      polish: "/polish",
      repair: "/repair",
      dispatch: "/dispatch",
    }

    return roleRoutes[role] || "/dashboard"
  }
}
