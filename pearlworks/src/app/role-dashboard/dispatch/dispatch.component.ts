import { Component,  OnInit,  OnDestroy } from "@angular/core"
import {  FormBuilder,  FormGroup, Validators } from "@angular/forms"
import { Subject, takeUntil } from "rxjs"
import  { AssignedWorkOrder, StageUpdateRequest } from "../../auth/interfaces/role-dashboard.interface"
import { RoleDashboardService } from "../../auth/interfaces/services/role-dashboard.service"
import { AuthService } from "../../auth/interfaces/services/auth.service"
import { Router } from '@angular/router';
import { DispatchStatistics } from "../../auth/interfaces/dispatch.interface"

@Component({
  selector: 'app-dispatch',
  standalone: false,
  templateUrl: './dispatch.component.html',
  styleUrl: './dispatch.component.css'
})
export class DispatchComponent implements OnInit, OnDestroy {
  readyToDispatchOrders: AssignedWorkOrder[] = []
  loading = false
  updating = false
  successMessage = ""
  errorMessage = ""
  selectedOrder: AssignedWorkOrder | null = null
  updateForm: FormGroup

  private destroy$ = new Subject<void>()
  private currentUser: any

  // Add these properties to the component class:
  statistics: DispatchStatistics | null = null
  showStatistics = false
  searchTerm = ""
  statusFilter = "all"
  selectedTrackingInfo: any = null // TrackingInfo type does not exist, use any

  constructor(
    private roleDashboardService: RoleDashboardService,
    private authService: AuthService,
    private fb: FormBuilder,
    private router: Router,
  ) {
    this.updateForm = this.fb.group({
      status: ["", Validators.required],
      dispatchDate: [new Date().toISOString().split("T")[0], Validators.required],
      notes: [""],
      courierService: [""],
    })
  }

  // Add these methods:
  ngOnInit(): void {
    this.loadReadyToDispatchOrders()
    this.loadStatistics()
  }

  ngOnDestroy(): void {
    this.destroy$.next()
    this.destroy$.complete()
  }

  loadStatistics(): void {
    this.roleDashboardService
      .getDispatchStatistics()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.statistics = response.data
          }
        },
        error: (error) => {
          console.error("Error loading dispatch statistics:", error)
        },
      })
  }

  toggleStatistics(): void {
    this.showStatistics = !this.showStatistics
  }

  get filteredOrders(): AssignedWorkOrder[] {
    let filtered = this.readyToDispatchOrders

    // Apply search filter
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase()
      filtered = filtered.filter(
        (order) =>
          order.workOrderNumber.toLowerCase().includes(term) ||
          order.partyName.toLowerCase().includes(term) ||
          order.productType.toLowerCase().includes(term),
      )
    }

    // Apply status filter
    if (this.statusFilter !== "all") {
      filtered = filtered.filter((order) => order.status === this.statusFilter)
    }

    return filtered
  }

  viewTracking(order: AssignedWorkOrder): void {
    this.roleDashboardService
      .getTrackingInfo(order.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            // If you want to use tracking info, define a property like:
            // this.trackingInfo = response.data
            // For now, just log it
            console.log('Tracking info:', response.data)
          }
        },
        error: (error) => {
          console.error("Error loading tracking info:", error)
          this.errorMessage = "Failed to load tracking information"
          this.clearMessages()
        },
      })
  }

  closeTrackingModal(): void {
    // If you want to clear tracking info, do it here
    // this.trackingInfo = null
  }

  loadReadyToDispatchOrders(): void {
    this.loading = true
    this.roleDashboardService
      .getCompletedWorkOrders()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (orders) => {
          this.readyToDispatchOrders = orders
          this.loading = false
        },
        error: (error) => {
          console.error("Error loading ready to dispatch orders:", error)
          this.errorMessage = "Failed to load ready to dispatch orders"
          this.loading = false
          this.clearMessages()
        },
      })
  }

  openDispatchModal(order: AssignedWorkOrder): void {
    this.selectedOrder = order
    this.updateForm.patchValue({
      status: order.status === "completed" ? "dispatched" : order.status,
      dispatchDate: new Date().toISOString().split("T")[0],
      notes: "",
      courierService: "",
    })
  }

  closeDispatchModal(): void {
    this.selectedOrder = null
    this.updateForm.reset()
  }

  onSubmitDispatch(): void {
    if (this.updateForm.invalid || !this.selectedOrder || !this.currentUser) {
      return
    }

    this.updating = true
    this.clearMessages()

    const formValue = this.updateForm.value
    const dispatchNotes = formValue.courierService
      ? `Dispatched via ${formValue.courierService}: ${formValue.notes || "Item dispatched successfully"}`
      : formValue.notes || "Item dispatched successfully"

    const updateRequest: StageUpdateRequest = {
      stage: "dispatch",
      status: formValue.status,
      updatedBy: this.currentUser.name,
      notes: dispatchNotes,
      completedDate: formValue.status === "dispatched" ? new Date(formValue.dispatchDate) : undefined,
    }

    this.roleDashboardService
      .updateDispatchStatus(this.selectedOrder.id, updateRequest)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.successMessage = response.message
            this.loadReadyToDispatchOrders()
            this.closeDispatchModal()
          } else {
            this.errorMessage = response.message
          }
          this.updating = false
          this.clearMessages()
        },
        error: (error) => {
          console.error("Error updating dispatch status:", error)
          this.errorMessage = "Failed to update dispatch status. Please try again."
          this.updating = false
          this.clearMessages()
        },
      })
  }

  quickDispatch(order: AssignedWorkOrder): void {
    if (!this.currentUser) return

    this.updating = true
    this.clearMessages()

    const updateRequest: StageUpdateRequest = {
      stage: "dispatch",
      status: "dispatched",
      updatedBy: this.currentUser.name,
      notes: "Item dispatched successfully",
      completedDate: new Date(),
    }

    this.roleDashboardService
      .updateDispatchStatus(order.id, updateRequest)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.successMessage = response.message
            this.loadReadyToDispatchOrders()
          } else {
            this.errorMessage = response.message
          }
          this.updating = false
          this.clearMessages()
        },
        error: (error) => {
          console.error("Error dispatching order:", error)
          this.errorMessage = "Failed to dispatch order. Please try again."
          this.updating = false
          this.clearMessages()
        },
      })
  }

  getStatusBadgeClass(status: string): string {
    const statusClasses = {
      completed: "bg-success",
      dispatched: "bg-info",
      "on-hold": "bg-warning text-dark",
    }
    return statusClasses[status as keyof typeof statusClasses] || "bg-secondary"
  }

  getStatusIcon(status: string): string {
    const statusIcons = {
      completed: "fas fa-check-circle",
      dispatched: "fas fa-shipping-fast",
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
    this.loadReadyToDispatchOrders()
  }
}

