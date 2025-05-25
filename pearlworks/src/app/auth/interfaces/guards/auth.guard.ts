import { Injectable } from "@angular/core"
import  { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from "@angular/router"
import  { Observable } from "rxjs"
import  { AuthService } from "../services/auth.service"
import { UserRole } from "../auth.interface"

@Injectable({
  providedIn: "root",
})
export class AuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot,
  ): Observable<boolean> | Promise<boolean> | boolean {
    // Check if user is logged in
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(["/login"], {
        queryParams: { returnUrl: state.url },
      })
      return false
    }

    // Check role-based access
    const requiredRole = route.data["role"] as UserRole | UserRole[]

    if (requiredRole) {
      if (!this.authService.hasRole(requiredRole)) {
        // User doesn't have required role, redirect to their dashboard
        const userRole = this.authService.getUserRole()
        if (userRole) {
          const dashboardRoute = this.authService.getRoleDashboardRoute(userRole)
          this.router.navigate([dashboardRoute])
        } else {
          this.router.navigate(["/login"])
        }
        return false
      }
    }

    return true
  }
}
