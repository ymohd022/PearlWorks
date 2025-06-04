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

@Component({
  selector: 'app-manager-dashboard',
  standalone: false,
  templateUrl: './manager-dashboard.component.html',
  styleUrl: './manager-dashboard.component.css'
})
export class ManagerDashboardComponent implements OnInit, OnDestroy {
  createOrderForm: FormGroup
  assignmentForm: FormGroup
  workOrders: WorkOrder[] = []
  workers: Worker[] = []
  loading = false
  submitting = false
  assigning = false
  successMessage = ""
  errorMessage = ""
  selectedOrderForAssignment: WorkOrder | null = null

  stageTypes: StageType[] = ["framing", "setting", "polish", "repair", "dispatch"]

  private destroy$ = new Subject<void>()

  constructor(
    private fb: FormBuilder,
    private workOrderService: WorkOrderService,
    private router: Router,
    private authService: AuthService
  ) {
    this.createOrderForm = this.fb.group({
      partyName: ["", [Validators.required, Validators.minLength(2)]],
      poNumber: [""],
      poDate: [""],
      itemDetails: ["", Validators.required],
      modelNumber: [""],
      descriptionOfWork: [""],
      expectedCompletionDate: [""],
      stones: this.fb.array([]),
      assignedWorkers: this.fb.array([]),
    })

    this.assignmentForm = this.fb.group({
      assignments: this.fb.array([]),
    })
  }

  ngOnInit(): void {
    this.loadWorkOrders()
    this.loadWorkers()
    this.addStoneRow()
  }

  ngOnDestroy(): void {
    this.destroy$.next()
    this.destroy$.complete()
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

  // Form Submission
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
      pending: "bg-warning text-dark",
      "in-progress": "bg-primary",
      completed: "bg-success",
      dispatched: "bg-info",
      cancelled: "bg-danger",
    }
    return statusClasses[status as keyof typeof statusClasses] || "bg-secondary"
  }

  formatDate(date: Date | undefined): string {
    if (!date) return "N/A"
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  logout(): void {
  this.authService.logout();
  this.router.navigate(['/login']);
}

  calculateProgress(workOrder: WorkOrder): number {
    if (workOrder.stages.length === 0) return 0
    const completedStages = workOrder.stages.filter((stage) => stage.status === "completed").length
    return Math.round((completedStages / workOrder.stages.length) * 100)
  }
}

