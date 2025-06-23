import { Component,  OnInit,  OnDestroy } from "@angular/core"
import {  FormBuilder, FormGroup, Validators, FormArray } from "@angular/forms"
import { Subject, takeUntil } from "rxjs"
import  {
  WorkOrder,
  CreateWorkOrderRequest,
  Worker,
  StageType,
  AssignedWorker,
} from "../../work-order.interface"
import  { WorkOrderService } from "../../services/work-order.service"
import { Router } from '@angular/router';
import { AuthService } from "../../services/auth.service"
import { RoleDashboardService } from "../../services/role-dashboard.service"

@Component({
  selector: 'app-manager-dashboard',
  standalone: false,
  templateUrl: './manager-dashboard.component.html',
  styleUrl: './manager-dashboard.component.css'
})
export class ManagerDashboardComponent implements OnInit, OnDestroy {
  // Tab management
  selectedTabIndex = 0

  // Forms
  createOrderForm!: FormGroup
  assignmentForm!: FormGroup
  stageUpdateForm!: FormGroup

  // Data
  workOrders: WorkOrder[] = []
  workers: Worker[] = []
  stageWorkOrders: { [key: string]: any[] } = {}

  // Loading states
  loading = false
  submitting = false
  assigning = false
  updatingStage = false

  // Messages
  successMessage = ""
  errorMessage = ""

  // Selected items
  selectedOrderForAssignment: WorkOrder | null = null
  selectedStageOrder: any = null
  selectedStage: StageType = "framing"

  // Constants
  stageTypes: StageType[] = ["framing", "setting", "polish", "repair", "dispatch"]
  stageIcons = {
    framing: "build",
    setting: "settings",
    polish: "auto_fix_high",
    repair: "build_circle",
    dispatch: "local_shipping",
  }

  private destroy$ = new Subject<void>()

  constructor(
    private fb: FormBuilder,
    private workOrderService: WorkOrderService,
    private roleDashboardService: RoleDashboardService,
    private router: Router,
    private authService: AuthService,
  ) {
    this.initializeForms()
  }

  ngOnInit(): void {
    this.loadWorkOrders()
    this.loadWorkers()
    this.loadStageData()
  }

  ngOnDestroy(): void {
    this.destroy$.next()
    this.destroy$.complete()
  }

  private initializeForms(): void {
    this.createOrderForm = this.fb.group({
      partyName: ["", [Validators.required, Validators.minLength(2)]],
      poNumber: [""],
      poDate: [""],
      itemDetails: ["", Validators.required],
      modelNumber: [""],
      descriptionOfWork: [""],
      expectedCompletionDate: [""],
      grossWeight: [0, [Validators.min(0)]],
      netWeight: [0, [Validators.min(0)]],
      stones: this.fb.array([]),
      assignedWorkers: this.fb.array([]),
    })

    this.assignmentForm = this.fb.group({
      assignments: this.fb.array([]),
    })

    this.stageUpdateForm = this.fb.group({
      status: ["", Validators.required],
      jamahWeight: [0],
      sortingIssue: [0],
      sortingJamah: [0],
      notes: [""],
      approved: [false],
    })

    this.addStoneRow()
  }

  // Tab Management
  onTabChange(index: number): void {
    this.selectedTabIndex = index
    if (index > 0) {
      const stage = this.stageTypes[index - 1]
      this.selectedStage = stage
      this.loadStageOrders(stage)
    }
  }

  // Data Loading
  loadWorkOrders(): void {
    this.loading = true
    this.workOrderService
      .getWorkOrders()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (orders) => {
          this.workOrders = orders
          this.loading = false
        },
        error: (error) => {
          console.error("Error loading work orders:", error)
          this.errorMessage = "Failed to load work orders"
          this.loading = false
          this.clearMessages()
        },
      })
  }

  loadWorkers(): void {
    this.workOrderService
      .getAllWorkers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (workers) => {
          this.workers = workers
        },
        error: (error) => {
          console.error("Error loading workers:", error)
          this.errorMessage = "Failed to load workers"
          this.clearMessages()
        },
      })
  }

  loadStageData(): void {
    this.stageTypes.forEach((stage) => {
      this.loadStageOrders(stage)
    })
  }

  loadStageOrders(stage: StageType): void {
    this.roleDashboardService
      .getAssignedWorkOrders(stage)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (orders) => {
          this.stageWorkOrders[stage] = orders
        },
        error: (error) => {
          console.error(`Error loading ${stage} orders:`, error)
        },
      })
  }

  // Form Array Getters
  get stones(): FormArray {
    return this.createOrderForm.get("stones") as FormArray
  }

  get assignedWorkers(): FormArray {
    return this.createOrderForm.get("assignedWorkers") as FormArray
  }

  get assignments(): FormArray {
    return this.assignmentForm.get("assignments") as FormArray
  }

  // Stone Management
  addStoneRow(): void {
    const stoneGroup = this.fb.group({
      type: ["", Validators.required],
      pieces: [0, [Validators.required, Validators.min(1)]],
      weightGrams: [0, [Validators.required, Validators.min(0.01)]],
      weightCarats: [0, [Validators.required, Validators.min(0.01)]],
      isReceived: [true],
    })
    this.stones.push(stoneGroup)
  }

  removeStoneRow(index: number): void {
    if (this.stones.length > 1) {
      this.stones.removeAt(index)
    }
  }

  // Worker Assignment for New Orders
  addWorkerAssignment(): void {
    const workerGroup = this.fb.group({
      stageType: ["", Validators.required],
      workerId: ["", Validators.required],
      workerName: [""],
    })
    this.assignedWorkers.push(workerGroup)
  }

  removeWorkerAssignment(index: number): void {
    this.assignedWorkers.removeAt(index)
  }

  onWorkerChange(index: number): void {
    const assignment = this.assignedWorkers.at(index)
    const workerId = assignment.get("workerId")?.value
    const worker = this.workers.find((w) => w.id === workerId)

    if (worker) {
      assignment.patchValue({
        workerName: worker.name,
        stageType: worker.role,
      })
    }
  }

  getWorkersByStage(stageType: string): Worker[] {
    return this.workers.filter((w) => w.role === stageType)
  }

  // Work Order Creation
  onSubmitOrder(): void {
    if (this.createOrderForm.invalid) {
      this.markFormGroupTouched(this.createOrderForm)
      return
    }

    this.submitting = true
    this.clearMessages()

    const formValue = this.createOrderForm.value
    const createRequest: CreateWorkOrderRequest = {
      ...formValue,
      poDate: formValue.poDate ? new Date(formValue.poDate) : undefined,
      expectedCompletionDate: formValue.expectedCompletionDate ? new Date(formValue.expectedCompletionDate) : undefined,
    }

    this.workOrderService
      .createWorkOrder(createRequest)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (workOrder) => {
          this.successMessage = `Work order ${workOrder.workOrderNumber} created successfully!`
          this.createOrderForm.reset()
          this.stones.clear()
          this.assignedWorkers.clear()
          this.addStoneRow()
          this.loadWorkOrders()
          this.submitting = false
          this.clearMessages()
        },
        error: (error) => {
          console.error("Error creating work order:", error)
          this.errorMessage = "Failed to create work order. Please try again."
          this.submitting = false
          this.clearMessages()
        },
      })
  }

  // Worker Assignment for Existing Orders
  openAssignmentModal(workOrder: WorkOrder): void {
    this.selectedOrderForAssignment = workOrder
    this.setupAssignmentForm(workOrder)
  }

  setupAssignmentForm(workOrder: WorkOrder): void {
    this.assignments.clear()

    this.stageTypes.forEach((stageType) => {
      const existingAssignment = workOrder.assignedWorkers.find((aw) => aw.stageType === stageType)

      const assignmentGroup = this.fb.group({
        stageType: [stageType],
        workerId: [existingAssignment?.workerId || ""],
        workerName: [existingAssignment?.workerName || ""],
      })

      this.assignments.push(assignmentGroup)
    })
  }

  onAssignmentWorkerChange(index: number): void {
    const assignment = this.assignments.at(index)
    const workerId = assignment.get("workerId")?.value
    const worker = this.workers.find((w) => w.id === workerId)

    if (worker) {
      assignment.patchValue({
        workerName: worker.name,
      })
    }
  }

  submitAssignments(): void {
    if (!this.selectedOrderForAssignment) return

    this.assigning = true
    this.clearMessages()

    const assignments: AssignedWorker[] = this.assignments.value
      .filter((a: any) => a.workerId)
      .map((a: any) => ({
        stageType: a.stageType,
        workerId: a.workerId,
        workerName: a.workerName,
        assignedDate: new Date(),
      }))

    this.workOrderService
      .assignWorkers(this.selectedOrderForAssignment.id, assignments)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updatedOrder) => {
          this.successMessage = `Workers assigned successfully to ${updatedOrder.workOrderNumber}!`
          this.selectedOrderForAssignment = null
          this.loadWorkOrders()
          this.loadStageData()
          this.assigning = false
          this.clearMessages()
        },
        error: (error) => {
          console.error("Error assigning workers:", error)
          this.errorMessage = "Failed to assign workers. Please try again."
          this.assigning = false
          this.clearMessages()
        },
      })
  }

  closeAssignmentModal(): void {
    this.selectedOrderForAssignment = null
    this.assignments.clear()
  }

  // Stage Update Management
  openStageUpdateModal(order: any, stage: StageType): void {
    this.selectedStageOrder = order
    this.selectedStage = stage

    this.stageUpdateForm.patchValue({
      status: order.status || "not-started",
      jamahWeight: order.jamahWeight || 0,
      sortingIssue: order.sortingIssue || 0,
      sortingJamah: order.sortingJamah || 0,
      notes: order.notes || "",
      approved: order.approved || false,
    })
  }

  submitStageUpdate(): void {
    if (!this.selectedStageOrder || this.stageUpdateForm.invalid) return

    this.updatingStage = true
    this.clearMessages()

    const updateRequest = {
      stage: this.selectedStage,
      ...this.stageUpdateForm.value,
    }

    this.roleDashboardService
      .updateStageStatus(this.selectedStageOrder.id, updateRequest)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.successMessage = response.message
          this.selectedStageOrder = null
          this.loadStageOrders(this.selectedStage)
          this.updatingStage = false
          this.clearMessages()
        },
        error: (error) => {
          console.error("Error updating stage:", error)
          this.errorMessage = "Failed to update stage. Please try again."
          this.updatingStage = false
          this.clearMessages()
        },
      })
  }

  closeStageUpdateModal(): void {
    this.selectedStageOrder = null
    this.stageUpdateForm.reset()
  }

  // Utility Methods
  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach((key) => {
      const control = formGroup.get(key)
      control?.markAsTouched()

      if (control instanceof FormArray) {
        control.controls.forEach((arrayControl) => {
          if (arrayControl instanceof FormGroup) {
            this.markFormGroupTouched(arrayControl)
          }
        })
      }
    })
  }

  private clearMessages(): void {
    setTimeout(() => {
      this.successMessage = ""
      this.errorMessage = ""
    }, 5000)
  }

  getStatusBadgeClass(status: string): string {
    const statusClasses = {
      "not-started": "mat-chip-outlined",
      "in-progress": "mat-primary",
      completed: "mat-accent",
      "on-hold": "mat-warn",
      dispatched: "mat-primary",
    }
    return statusClasses[status as keyof typeof statusClasses] || "mat-chip-outlined"
  }

  formatDate(date: Date | string | undefined): string {
    if (!date) return "N/A"
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  calculateProgress(workOrder: WorkOrder): number {
    if (workOrder.stages.length === 0) return 0
    const completedStages = workOrder.stages.filter((stage) => stage.status === "completed").length
    return Math.round((completedStages / workOrder.stages.length) * 100)
  }

  // Stone weight conversion methods
  onWeightGramsChange(index: number, event: any): void {
    const value = Number.parseFloat(event.target.value) || 0
    const carats = (value * 5).toFixed(3)
    const stoneControl = this.stones.at(index)
    stoneControl.patchValue(
      {
        weightCarats: Number.parseFloat(carats),
      },
      { emitEvent: false },
    )
  }

  onWeightCaratsChange(index: number, event: any): void {
    const value = Number.parseFloat(event.target.value) || 0
    const grams = (value / 5).toFixed(3)
    const stoneControl = this.stones.at(index)
    stoneControl.patchValue(
      {
        weightGrams: Number.parseFloat(grams),
      },
      { emitEvent: false },
    )
  }

  formatWeight(value: number): string {
    return value ? value.toFixed(3) : "0.000"
  }

  logout(): void {
    this.authService.logout()
    this.router.navigate(["/login"])
  }
}
