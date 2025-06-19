import { Component,  OnInit,  OnDestroy } from "@angular/core"
import {  FormBuilder,  FormGroup, Validators } from "@angular/forms"
import { Subject, takeUntil, forkJoin} from "rxjs"
import  { AssignedWorkOrder, StageUpdateRequest } from "../../auth/interfaces/role-dashboard.interface"
import { RoleDashboardService } from "../../auth/interfaces/services/role-dashboard.service"
import { AuthService } from "../../auth/interfaces/services/auth.service"
import { Router } from '@angular/router';
import { RepairStatistics, RepairType } from "../../auth/interfaces/repair.interface"
import { REPAIR_TYPES } from "../../auth/interfaces/repair.interface"

@Component({
  selector: 'app-repair',
  standalone: false,
  templateUrl: './repair.component.html',
  styleUrl: './repair.component.css'
})
export class RepairComponent implements OnInit, OnDestroy {
  assignedOrders: AssignedWorkOrder[] = []
  filteredOrders: AssignedWorkOrder[] = []
  statistics: RepairStatistics | null = null
  loading = false
  updating = false
  loadingStats = false
  successMessage = ""
  errorMessage = ""
  selectedOrder: AssignedWorkOrder | null = null
  updateForm: FormGroup
  searchTerm = ""
  statusFilter = "all"
  showStatistics = false

  repairTypes: readonly RepairType[] = REPAIR_TYPES // Declare repairTypes using REPAIR_TYPES

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
  }

  ngOnInit(): void {
    this.loadData()
  }

  ngOnDestroy(): void {
    this.destroy$.next()
    this.destroy$.complete()
  }

  loadData(): void {
    this.loading = true
    this.loadingStats = true

    forkJoin({
      orders: this.roleDashboardService.getAssignedWorkOrders("repair"),
      statistics: this.roleDashboardService.getRepairStatistics(),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.assignedOrders = data.orders
          this.filteredOrders = [...this.assignedOrders]
          this.statistics = data.statistics.data
          this.loading = false
          this.loadingStats = false
          this.applyFilters()
        },
        error: (error) => {
          console.error("Error loading data:", error)
          this.errorMessage = "Failed to load repair data"
          this.loading = false
          this.loadingStats = false
          this.clearMessages()
        },
      })
  }

  loadAssignedOrders(): void {
    this.loading = true
    this.roleDashboardService
      .getAssignedWorkOrders("repair")
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (orders) => {
          this.assignedOrders = orders
          this.filteredOrders = [...orders]
          this.loading = false
          this.applyFilters()
        },
        error: (error) => {
          console.error("Error loading assigned orders:", error)
          this.errorMessage = "Failed to load assigned work orders"
          this.loading = false
          this.clearMessages()
        },
      })
  }

  applyFilters(): void {
    let filtered = [...this.assignedOrders]

    // Apply search filter
    if (this.searchTerm.trim()) {
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

    this.filteredOrders = filtered
  }

  onSearchChange(): void {
    this.applyFilters()
  }

  onStatusFilterChange(): void {
    this.applyFilters()
  }

  toggleStatistics(): void {
    this.showStatistics = !this.showStatistics
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
    this.authService.logout()
    this.router.navigate(["/login"])
  }

  refreshOrders(): void {
    this.loadAssignedOrders()
  }
}
