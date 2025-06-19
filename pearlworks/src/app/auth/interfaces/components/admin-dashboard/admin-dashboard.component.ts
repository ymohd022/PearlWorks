import { Component,  OnInit,  OnDestroy } from "@angular/core"
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from "rxjs"
import  { FormBuilder, FormGroup } from "@angular/forms"
import  { WorkOrder, ActivityLog, WorkOrderFilters } from "../../work-order.interface"
import { WorkOrderService } from "../../services/work-order.service"
import { Router } from '@angular/router';
import { AuthService } from "../../services/auth.service"

@Component({
  selector: 'app-admin-dashboard',
  standalone: false,
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.css'
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  workOrders: WorkOrder[] = []
  activityLogs: ActivityLog[] = []
  filteredWorkOrders: WorkOrder[] = []
  loading = false
  activityLoading = false
  expandedOrderId: string | null = null

  filterForm: FormGroup
  private destroy$ = new Subject<void>()

  constructor(
    private workOrderService: WorkOrderService,
    private fb: FormBuilder,
    private router: Router,
    private authService: AuthService,
  ) {
    this.filterForm = this.fb.group({
      status: [""],
      dateFrom: [""],
      dateTo: [""],
      partyName: [""],
      workOrderNumber: [""],
    })
  }

  ngOnInit(): void {
    this.loadWorkOrders()
    this.loadActivityLogs()
    this.setupFilters()
  }

  ngOnDestroy(): void {
    this.destroy$.next()
    this.destroy$.complete()
  }

  private setupFilters(): void {
    this.filterForm.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.applyFilters()
      })
  }

  loadWorkOrders(): void {
    this.loading = true
    // Use admin-specific method to get detailed work orders
    this.workOrderService
      .getAdminWorkOrders()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (orders) => {
          console.log("Loaded work orders:", orders) // Debug log
          this.workOrders = orders || []
          this.filteredWorkOrders = orders || []
          this.loading = false
        },
        error: (error) => {
          console.error("Error loading work orders:", error)
          this.workOrders = []
          this.filteredWorkOrders = []
          this.loading = false
        },
      })
  }

  loadActivityLogs(): void {
    this.activityLoading = true
    // Use admin-specific method to get detailed activity logs
    this.workOrderService
      .getAdminActivityLogs(10)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (logs) => {
          console.log("Loaded activity logs:", logs) // Debug log
          this.activityLogs = logs || []
          this.activityLoading = false
        },
        error: (error) => {
          console.error("Error loading activity logs:", error)
          this.activityLogs = []
          this.activityLoading = false
        },
      })
  }

  applyFilters(): void {
    const filters: WorkOrderFilters = this.filterForm.value

    // Remove empty values
    Object.keys(filters).forEach((key) => {
      if (!filters[key as keyof WorkOrderFilters]) {
        delete filters[key as keyof WorkOrderFilters]
      }
    })

    this.loading = true
    this.workOrderService
      .getAdminWorkOrders(filters)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (orders) => {
          this.filteredWorkOrders = orders || []
          this.loading = false
        },
        error: (error) => {
          console.error("Error filtering work orders:", error)
          this.filteredWorkOrders = []
          this.loading = false
        },
      })
  }

  clearFilters(): void {
    this.filterForm.reset()
    this.filteredWorkOrders = this.workOrders
  }

  toggleOrderDetails(orderId: string): void {
    this.expandedOrderId = this.expandedOrderId === orderId ? null : orderId
  }

  getStatusBadgeClass(status: string): string {
    const statusClasses = {
      pending: "bg-warning text-dark",
      "in-progress": "bg-primary",
      completed: "bg-success",
      dispatched: "bg-info",
      cancelled: "bg-danger",
    }
    return statusClasses[status as keyof typeof statusClasses] || "bg-secondary"
  }

  getStageBadgeClass(status: string): string {
    const statusClasses = {
      "not-started": "bg-light text-dark",
      "in-progress": "bg-warning text-dark",
      completed: "bg-success",
      "on-hold": "bg-danger",
    }
    return statusClasses[status as keyof typeof statusClasses] || "bg-secondary"
  }

  formatDate(date: Date | string | undefined): string {
    if (!date) return "N/A"
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  formatDateTime(date: Date | string): string {
    return new Date(date).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  calculateProgress(workOrder: WorkOrder): number {
    if (!workOrder.stages || workOrder.stages.length === 0) return 0
    const completedStages = workOrder.stages.filter((stage) => stage.status === "completed").length
    return Math.round((completedStages / workOrder.stages.length) * 100)
  }

  logout(): void {
    this.authService.logout()
    this.router.navigate(["/login"])
  }

  refreshData(): void {
    this.loadWorkOrders()
    this.loadActivityLogs()
  }
}
