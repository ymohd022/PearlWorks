import { Component,  OnInit,  OnDestroy } from "@angular/core"
import {  FormBuilder,  FormGroup, Validators } from "@angular/forms"
import { Subject, takeUntil } from "rxjs"
import  { AssignedWorkOrder, StageUpdateRequest } from "../../auth/interfaces/role-dashboard.interface"
import { RoleDashboardService } from "../../auth/interfaces/services/role-dashboard.service"
import { AuthService } from "../../auth/interfaces/services/auth.service"
import { Router } from '@angular/router';
import  { MatDialog } from "@angular/material/dialog"
import { PolishUpdateDialogComponent } from "./polish-update-dialog/polish-update-dialog.component"
import { StonesDialogComponent } from "./stones-dialog/stones-dialog.component"
import { PolishStatistics } from "../../auth/interfaces/polish.interface"
import { MatSnackBar } from "@angular/material/snack-bar"

@Component({
  selector: 'app-polish',
  standalone: false,
  templateUrl: './polish.component.html',
  styleUrl: './polish.component.css'
})
export class PolishComponent implements OnInit, OnDestroy {
  assignedOrders: AssignedWorkOrder[] = []
  statistics: PolishStatistics | null = null
  loading = false
  updating = false

  private destroy$ = new Subject<void>()
  private currentUser: any

  // Display columns for the table
  displayedColumns: string[] = [
    "workOrderNumber",
    "partyName",
    "productType",
    "issueWeight",
    "jamahWeight",
    "status",
    "assignedDate",
    "actions",
  ]

  constructor(
    private roleDashboardService: RoleDashboardService,
    private authService: AuthService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {
    this.currentUser = this.authService.getUserData()
  }

  ngOnInit(): void {
    // Initialize currentUser if not already set
    if (!this.currentUser) {
      this.currentUser = this.authService.getUserData()
    }
    this.loadData()
  }

  ngOnDestroy(): void {
    this.destroy$.next()
    this.destroy$.complete()
  }

  loadData(): void {
    this.loading = true

    // Load assigned orders and statistics
    Promise.all([this.loadAssignedOrders(), this.loadStatistics()]).finally(() => {
      this.loading = false
    })
  }

  loadAssignedOrders(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log("Loading assigned orders for polish...") // Add logging

      this.roleDashboardService
        .getAssignedWorkOrders("polish")
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (orders) => {
            console.log("Received orders:", orders) // Add logging
            this.assignedOrders = orders
            resolve()
          },
          error: (error) => {
            console.error("Error loading assigned orders:", error)
            console.error("Error details:", error.error) // Add more detailed logging
            this.showSnackBar(
              "Failed to load assigned work orders: " + (error.error?.message || error.message),
              "error",
            )
            reject(error)
          },
        })
    })
  }

  loadStatistics(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log("Loading polish statistics...") // Add logging

      this.roleDashboardService
        .getPolishStatistics()
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => {
            console.log("Received statistics:", response) // Add logging
            this.statistics = response.data
            resolve()
          },
          error: (error) => {
            console.error("Error loading statistics:", error)
            console.error("Error details:", error.error) // Add more detailed logging
            // Don't show error for statistics as it's not critical
            this.statistics = {
              totalOrders: 0,
              pendingOrders: 0,
              inProgressOrders: 0,
              completedOrders: 0,
              onHoldOrders: 0,
              avgWeightDifference: "0.000",
              approvedOrders: 0,
              overdueOrders: 0,
              recentActivities: [],
            }
            resolve() // Resolve anyway to not block the UI
          },
        })
    })
  }

  openUpdateDialog(order: AssignedWorkOrder): void {
    const dialogRef = this.dialog.open(PolishUpdateDialogComponent, {
      width: "800px",
      maxWidth: "95vw",
      data: { order },
    })

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadData()
        this.showSnackBar("Work order updated successfully", "success")
      }
    })
  }

  openStonesDialog(order: AssignedWorkOrder): void {
    const dialogRef = this.dialog.open(StonesDialogComponent, {
      width: "900px",
      maxWidth: "95vw",
      data: { workOrderId: order.id, workOrderNumber: order.workOrderNumber },
    })

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.showSnackBar("Stones data updated successfully", "success")
      }
    })
  }

  quickStatusUpdate(order: AssignedWorkOrder, newStatus: "in-progress" | "completed"): void {
    if (!this.currentUser) return

    this.updating = true

    const updateRequest = {
      stage: "polish" as const,
      status: newStatus,
      updatedBy: this.currentUser.name,
      completedDate: newStatus === "completed" ? new Date() : undefined,
      notes: newStatus === "completed" ? "Polish completed with final finish" : undefined,
    }

    this.roleDashboardService
      .updateStageStatus(order.id, updateRequest)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.showSnackBar(response.message, "success")
            this.loadData()
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

  refreshData(): void {
    this.loadData()
  }

  private showSnackBar(message: string, type: "success" | "error"): void {
    this.snackBar.open(message, "Close", {
      duration: 5000,
      panelClass: type === "success" ? "success-snackbar" : "error-snackbar",
    })
  }
}
