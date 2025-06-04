import { Component,  OnInit,  OnDestroy } from "@angular/core"
import {  FormBuilder,  FormGroup, Validators } from "@angular/forms"
import { Subject, takeUntil } from "rxjs"
import  { AssignedWorkOrder, StageUpdateRequest } from "../../auth/interfaces/role-dashboard.interface"
import { RoleDashboardService } from "../../auth/interfaces/services/role-dashboard.service"
import { AuthService } from "../../auth/interfaces/services/auth.service"
import { Router } from '@angular/router';

@Component({
  selector: 'app-repair',
  standalone: false,
  templateUrl: './repair.component.html',
  styleUrl: './repair.component.css'
})
export class RepairComponent implements OnInit, OnDestroy {
  assignedOrders: AssignedWorkOrder[] = []
  loading = false
  updating = false
  successMessage = ""
  errorMessage = ""
  selectedOrder: AssignedWorkOrder | null = null
  updateForm: FormGroup

  private destroy$ = new Subject<void>()
  private currentUser: any

  constructor(
    private roleDashboardService: RoleDashboardService,
    private authService: AuthService,
     private router: Router,
    private fb: FormBuilder,
  ) {
    this.updateForm = this.fb.group({
      status: ["", Validators.required],
      jamahWeight: ["", [Validators.min(0.01)]],
      notes: [""],
      repairType: [""],
    })
    this.currentUser = this.authService.getUserData()
  }

  ngOnInit(): void {
    this.loadAssignedOrders()
  }

  ngOnDestroy(): void {
    this.destroy$.next()
    this.destroy$.complete()
  }

  loadAssignedOrders(): void {
    this.loading = true
    this.roleDashboardService
      .getAssignedWorkOrders("repair")
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (orders) => {
          this.assignedOrders = orders
          this.loading = false
        },
        error: (error) => {
          console.error("Error loading assigned orders:", error)
          this.errorMessage = "Failed to load assigned work orders"
          this.loading = false
          this.clearMessages()
        },
      })
  }

  openUpdateModal(order: AssignedWorkOrder): void {
    this.selectedOrder = order
    this.updateForm.patchValue({
      status: order.status,
      jamahWeight: order.jamahWeight || "",
      notes: order.notes || "",
      repairType: "",
    })
  }

  closeUpdateModal(): void {
    this.selectedOrder = null
    this.updateForm.reset()
  }

  onSubmitUpdate(): void {
    if (this.updateForm.invalid || !this.selectedOrder || !this.currentUser) {
      return
    }

    this.updating = true
    this.clearMessages()

    const formValue = this.updateForm.value
    const repairNotes = formValue.repairType
      ? `${formValue.repairType}: ${formValue.notes || "Repair completed"}`
      : formValue.notes || undefined

    const updateRequest: StageUpdateRequest = {
      stage: "repair",
      status: formValue.status,
      updatedBy: this.currentUser.name,
      notes: repairNotes,
      jamahWeight: formValue.jamahWeight ? Number.parseFloat(formValue.jamahWeight) : undefined,
      completedDate: formValue.status === "completed" ? new Date() : undefined,
    }

    this.roleDashboardService
      .updateStageStatus(this.selectedOrder.id, updateRequest)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.successMessage = response.message
            this.loadAssignedOrders()
            this.closeUpdateModal()
          } else {
            this.errorMessage = response.message
          }
          this.updating = false
          this.clearMessages()
        },
        error: (error) => {
          console.error("Error updating work order:", error)
          this.errorMessage = "Failed to update work order. Please try again."
          this.updating = false
          this.clearMessages()
        },
      })
  }

  quickStatusUpdate(order: AssignedWorkOrder, newStatus: "in-progress" | "completed"): void {
    if (!this.currentUser) return

    this.updating = true
    this.clearMessages()

    const updateRequest: StageUpdateRequest = {
      stage: "repair",
      status: newStatus,
      updatedBy: this.currentUser.name,
      completedDate: newStatus === "completed" ? new Date() : undefined,
      notes: newStatus === "completed" ? "Repair work completed successfully" : undefined,
    }

    this.roleDashboardService
      .updateStageStatus(order.id, updateRequest)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.successMessage = response.message
            this.loadAssignedOrders()
          } else {
            this.errorMessage = response.message
          }
          this.updating = false
          this.clearMessages()
        },
        error: (error) => {
          console.error("Error updating work order:", error)
          this.errorMessage = "Failed to update work order. Please try again."
          this.updating = false
          this.clearMessages()
        },
      })
  }

  getStatusBadgeClass(status: string): string {
    const statusClasses = {
      "not-started": "bg-light text-dark",
      "in-progress": "bg-warning text-dark",
      completed: "bg-success",
      "on-hold": "bg-danger",
    }
    return statusClasses[status as keyof typeof statusClasses] || "bg-secondary"
  }

  getStatusIcon(status: string): string {
    const statusIcons = {
      "not-started": "fas fa-clock",
      "in-progress": "fas fa-spinner",
      completed: "fas fa-check-circle",
      "on-hold": "fas fa-pause-circle",
    }
    return statusIcons[status as keyof typeof statusIcons] || "fas fa-question-circle"
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

  private clearMessages(): void {
    setTimeout(() => {
      this.successMessage = ""
      this.errorMessage = ""
    }, 5000)
  }

    logout(): void {
  this.authService.logout();
  this.router.navigate(['/login']);
}

  refreshOrders(): void {
    this.loadAssignedOrders()
  }
}
