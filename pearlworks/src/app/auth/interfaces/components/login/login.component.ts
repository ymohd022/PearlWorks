import { Component,  OnInit } from "@angular/core"
import {  FormBuilder,  FormGroup, Validators } from "@angular/forms"
import  { Router, ActivatedRoute } from "@angular/router"
import  { AuthService } from "../../services/auth.service"
import { UserRole } from "../../auth.interface"

@Component({
  selector: 'app-login',
  standalone: false,
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup
  loading = false
  errorMessage = ""
  returnUrl = ""

  constructor(
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
  ) {
    this.loginForm = this.formBuilder.group({
      email: ["", [Validators.required, Validators.email]],
      password: ["", [Validators.required, Validators.minLength(6)]],
    })
  }

  ngOnInit(): void {
    // Get return url from route parameters or default to '/'
    this.returnUrl = this.route.snapshot.queryParams["returnUrl"] || "/"

    // Redirect if already logged in
    if (this.authService.isLoggedIn()) {
      const userRole = this.authService.getUserRole()
      if (userRole) {
        const dashboardRoute = this.authService.getRoleDashboardRoute(userRole)
        this.router.navigate([dashboardRoute])
      }
    }
  }

  get f() {
    return this.loginForm.controls
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.markFormGroupTouched()
      return
    }

    this.loading = true
    this.errorMessage = ""

    const { email, password } = this.loginForm.value

    this.authService.login(email, password).subscribe({
      next: (response) => {
        this.loading = false

        if (response.success && response.user) {
          // Redirect based on user role
          const dashboardRoute = this.authService.getRoleDashboardRoute(response.user.role)

          // Use return URL if it matches the user's role, otherwise use role-based dashboard
          if (this.returnUrl !== "/" && this.isAuthorizedForReturnUrl(response.user.role)) {
            this.router.navigate([this.returnUrl])
          } else {
            this.router.navigate([dashboardRoute])
          }
        } else {
          this.errorMessage = response.message || "Login failed. Please try again."
        }
      },
      error: (error) => {
        this.loading = false
        this.errorMessage = "An error occurred. Please try again."
        console.error("Login error:", error)
      },
    })
  }

  private isAuthorizedForReturnUrl(userRole: UserRole): boolean {
    // Simple check - you can make this more sophisticated based on your routing structure
    const roleRoutes: Record<UserRole, string[]> = {
      admin: ["/admin", "/manager", "/framing", "/setting", "/polish", "/repair", "/dispatch"],
      manager: ["/manager", "/framing", "/setting", "/polish", "/repair", "/dispatch"],
      framing: ["/framing"],
      setting: ["/setting"],
      polish: ["/polish"],
      repair: ["/repair"],
      dispatch: ["/dispatch"],
    }

    const allowedRoutes = roleRoutes[userRole] || []
    return allowedRoutes.some((route) => this.returnUrl.startsWith(route))
  }

  private markFormGroupTouched(): void {
    Object.keys(this.loginForm.controls).forEach((key) => {
      const control = this.loginForm.get(key)
      control?.markAsTouched()
    })
  }

  // Quick login methods for testing
  quickLogin(role: UserRole): void {
    const credentials = {
      admin: { email: "admin@shop.com", password: "123456" },
      manager: { email: "manager@shop.com", password: "123456" },
      framing: { email: "framing@shop.com", password: "123456" },
      setting: { email: "setting@shop.com", password: "123456" },
      polish: { email: "polish@shop.com", password: "123456" },
      repair: { email: "repair@shop.com", password: "123456" },
      dispatch: { email: "dispatch@shop.com", password: "123456" },
    }

    const cred = credentials[role]
    this.loginForm.patchValue(cred)
    this.onSubmit()
  }
}

