import { Component,  OnInit,  OnDestroy } from "@angular/core"
import {  FormBuilder,} from "@angular/forms"
import { Subject, takeUntil } from "rxjs"
import  { AssignedWorkOrder, StageUpdateRequest } from "../../auth/interfaces/role-dashboard.interface"
import { AuthService } from "../../auth/interfaces/services/auth.service"
import { RoleDashboardService } from "../../auth/interfaces/services/role-dashboard.service"
import { Router } from '@angular/router';
import  { MatDialog } from "@angular/material/dialog"
import  { MatSnackBar } from "@angular/material/snack-bar"
import { SettingWorkOrder, SettingStatistics, SettingUpdateRequest } from "../../auth/interfaces/setting.interface"
import { SettingUpdateDialogComponent } from "./setting-update-dialog/setting-update-dialog.component"
@Component({
  selector: 'app-setting',
  standalone: false,
  templateUrl: './setting.component.html',
  styleUrl: './setting.component.css'
})
export class SettingComponent implements OnInit, OnDestroy {
  assignedOrders: SettingWorkOrder[] = []
  statistics: SettingStatistics | null = null
  loading = false
  updating = false
  selectedOrder: SettingWorkOrder | null = null

  private destroy$ = new Subject<void>()
  private currentUser: any

  constructor(
    private roleDashboardService: RoleDashboardService,
    private authService: AuthService,
    private router: Router,
    private fb: FormBuilder,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {
    this.currentUser = this.authService.getUserData()
  }

  ngOnInit(): void {
    this.loadAssignedOrders()
    this.loadStatistics()
  }

  ngOnDestroy(): void {
    this.destroy$.next()
    this.destroy$.complete()
  }

loadAssignedOrders(): void {
  this.loading = true;
  this.roleDashboardService
    .getSettingWorkOrders() // Use the new specific method
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (orders) => {
        this.assignedOrders = orders;
        this.loading = false;
      },
      error: (error) => {
        console.error("Error loading assigned orders:", error);
        this.showSnackBar("Failed to load assigned work orders", "error");
        this.loading = false;
      },
    });
}

  loadStatistics(): void {
    this.roleDashboardService
      .getSettingStatistics()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.statistics = response.data
        },
        error: (error) => {
          console.error("Error loading statistics:", error)
        },
      })
  }

  openUpdateDialog(order: SettingWorkOrder): void {
    const dialogRef = this.dialog.open(SettingUpdateDialogComponent, {
      width: "90vw",
      maxWidth: "1200px",
      height: "90vh",
      data: {
        order: order,
        currentUser: this.currentUser,
      },
    })

    dialogRef.afterClosed().subscribe((result) => {
      if (result && result.updated) {
        this.loadAssignedOrders()
        this.loadStatistics()
        this.showSnackBar("Work order updated successfully", "success")
      }
    })
  }

  quickStatusUpdate(order: SettingWorkOrder, newStatus: "in-progress" | "completed"): void {
    if (!this.currentUser) return

    this.updating = true

    const updateRequest: SettingUpdateRequest = {
      stage: "setting",
      status: newStatus,
      updatedBy: this.currentUser.name,
      completedDate: newStatus === "completed" ? new Date() : undefined,
    }

    this.roleDashboardService
      .updateStageStatus(order.id, updateRequest)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.showSnackBar(response.message, "success")
            this.loadAssignedOrders()
            this.loadStatistics()
          } else {
            this.showSnackBar(response.message, "error")
          }
          this.updating = false
        },
        error: (error) => {
          console.error("Error updating work order:", error)
          this.showSnackBar("Failed to update work order. Please try again.", "error")
          this.updating = false
        },
      })
  }

  getStatusColor(status: string): string {
    const statusColors = {
      "not-started": "accent",
      "in-progress": "warn",
      completed: "primary",
      "on-hold": "warn",
    }
    return statusColors[status as keyof typeof statusColors] || "accent"
  }

  getStatusIcon(status: string): string {
    const statusIcons = {
      "not-started": "schedule",
      "in-progress": "autorenew",
      completed: "check_circle",
      "on-hold": "pause_circle_filled",
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

  private showSnackBar(message: string, type: "success" | "error"): void {
    this.snackBar.open(message, "Close", {
      duration: 5000,
      panelClass: type === "success" ? "success-snackbar" : "error-snackbar",
    })
  }

  logout(): void {
    this.authService.logout()
    this.router.navigate(["/login"])
  }

  refreshOrders(): void {
    this.loadAssignedOrders()
    this.loadStatistics()
  }
}