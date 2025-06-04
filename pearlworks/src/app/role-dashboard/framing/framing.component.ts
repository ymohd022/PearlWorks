import { Component,  OnInit,  OnDestroy } from "@angular/core"
import  { FormBuilder } from "@angular/forms"
import { Subject, takeUntil } from "rxjs"
import  { MatSnackBar } from "@angular/material/snack-bar"
import  { MatDialog } from "@angular/material/dialog"
import { AssignedWorkOrder, StageUpdateRequest } from "../../auth/interfaces/role-dashboard.interface"
import { RoleDashboardService } from "../../auth/interfaces/services/role-dashboard.service"
import { AuthService } from "../../auth/interfaces/services/auth.service"
import { FramingUpdateComponent } from "./framing-update/framing-update.component"
import { Router } from '@angular/router';
@Component({
  selector: 'app-framing',
  standalone: false,
  templateUrl: './framing.component.html',
  styleUrl: './framing.component.css'
})
export class FramingComponent implements OnInit, OnDestroy {
  assignedOrders: AssignedWorkOrder[] = []
  loading = false
  updating = false
  statistics: any = {}
  private destroy$ = new Subject<void>()
  private currentUser: any;


  constructor(
    private roleDashboardService: RoleDashboardService,
    private authService: AuthService,
    private fb: FormBuilder,
    private router: Router,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
  ) {}

  

  ngOnInit(): void {
    this.loadAssignedOrders()
    this.loadStatistics()
  }

  ngOnDestroy(): void {
    this.destroy$.next()
    this.destroy$.complete()
  }

  loadAssignedOrders(): void {
    this.loading = true
    this.roleDashboardService
      .getAssignedWorkOrders("framing")
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (orders) => {
          this.assignedOrders = orders
          this.loading = false
        },
        error: (error) => {
          console.error("Error loading assigned orders:", error)
          this.snackBar.open("Failed to load assigned work orders", "Close", {
            duration: 5000,
            panelClass: ["error-snackbar"],
          })
          this.loading = false
        },
      })
  }

  loadStatistics(): void {
    // This would be implemented with a new API endpoint
    // For now, calculate from current orders
    this.calculateStatistics()
  }

  calculateStatistics(): void {
    const total = this.assignedOrders.length
    const pending = this.assignedOrders.filter((o) => o.status === "not-started").length
    const inProgress = this.assignedOrders.filter((o) => o.status === "in-progress").length
    const completed = this.assignedOrders.filter((o) => o.status === "completed").length
    const onHold = this.assignedOrders.filter((o) => o.status === "on-hold").length

    this.statistics = {
      total,
      pending,
      inProgress,
      completed,
      onHold,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    }
  }

  openUpdateDialog(order: AssignedWorkOrder): void {
    const dialogRef = this.dialog.open(FramingUpdateComponent, {
      width: "600px",
      data: { order },
    })

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.updateOrderStatus(order, result)
      }
    })
  }

  quickStatusUpdate(order: AssignedWorkOrder, newStatus: "in-progress" | "completed"): void {
    if (!this.currentUser) return

    const updateRequest: StageUpdateRequest = {
      stage: "framing",
      status: newStatus,
      updatedBy: this.currentUser.name,
      completedDate: newStatus === "completed" ? new Date() : undefined,
    }

    this.updateOrderStatus(order, updateRequest)
  }

  private updateOrderStatus(order: AssignedWorkOrder, updateRequest: StageUpdateRequest): void {
    this.updating = true

    this.roleDashboardService
      .updateStageStatus(order.id, updateRequest)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.snackBar.open(response.message, "Close", {
              duration: 3000,
              panelClass: ["success-snackbar"],
            })
            this.loadAssignedOrders()
            this.loadStatistics()
          } else {
            this.snackBar.open(response.message, "Close", {
              duration: 5000,
              panelClass: ["error-snackbar"],
            })
          }
          this.updating = false
        },
        error: (error) => {
          console.error("Error updating work order:", error)
          this.snackBar.open("Failed to update work order. Please try again.", "Close", {
            duration: 5000,
            panelClass: ["error-snackbar"],
          })
          this.updating = false
        },
      })
  }

  getStatusColor(status: string): string {
    const statusColors = {
      "not-started": "warn",
      "in-progress": "accent",
      completed: "primary",
      "on-hold": "warn",
    }
    return statusColors[status as keyof typeof statusColors] || "basic"
  }

  getStatusIcon(status: string): string {
    const statusIcons = {
      "not-started": "schedule",
      "in-progress": "autorenew",
      completed: "check_circle",
      "on-hold": "pause_circle",
    }
    return statusIcons[status as keyof typeof statusIcons] || "help"
  }

  formatDate(date: Date | undefined): string {
    if (!date) return "N/A"
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  calculateDaysRemaining(expectedDate: Date | undefined): number {
    if (!expectedDate) return 0
    const today = new Date()
    const expected = new Date(expectedDate)
    const diffTime = expected.getTime() - today.getTime()
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  isOverdue(expectedDate: Date | undefined): boolean {
    return this.calculateDaysRemaining(expectedDate) < 0
  }

    logout(): void {
  this.authService.logout();
  this.router.navigate(['/login']);
}

  refreshOrders(): void {
    this.loadAssignedOrders()
    this.loadStatistics()
  }
}
