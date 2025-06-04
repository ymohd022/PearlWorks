import { Injectable } from "@angular/core"
import  { HttpClient } from "@angular/common/http"
import { BehaviorSubject,  Observable } from "rxjs"
import { map } from "rxjs/operators"
import { ApiService } from "./api.service"
import  { LoginResponse, User, UserRole } from "../../interfaces/auth.interface"

@Injectable({
  providedIn: "root",
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<User | null>(null)
  public currentUser$ = this.currentUserSubject.asObservable()

  constructor(
    private http: HttpClient,
    private apiService: ApiService,
  ) {
    // Check if user is already logged in
    const token = this.getToken()
    const userData = this.getUserData()
    if (token && userData) {
      this.currentUserSubject.next(userData)
    }
  }

  login(email: string, password: string): Observable<LoginResponse> {
    return this.apiService.login({ email, password }).pipe(
      map((response) => {
        if (response.success && response.user) {
          // Store token and user data
          localStorage.setItem("auth_token", response.token)
          localStorage.setItem("user_data", JSON.stringify(response.user))

          this.currentUserSubject.next(response.user)

          return {
            success: true,
            token: response.token,
            user: response.user,
          }
        } else {
          return {
            success: false,
            message: response.message || "Login failed",
          }
        }
      }),
    )
  }

  logout(): void {
    // Call API logout endpoint
    this.apiService.logout().subscribe({
      next: () => {
        this.clearLocalStorage()
      },
      error: () => {
        // Clear local storage even if API call fails
        this.clearLocalStorage()
      },
    })
  }

  private clearLocalStorage(): void {
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
