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
import { AutocompleteService } from "../../services/autocomplete.service"
import { AutocompleteOption } from "../../services/autocomplete.service"

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

  // Image upload
  selectedImages: File[] = []
  imagePreviewUrls: string[] = []

  // Constants
  stageTypes: StageType[] = ["framing", "setting", "polish", "repair", "dispatch"]
  stageIcons = {
    framing: "build",
    setting: "settings",
    polish: "auto_fix_high",
    repair: "build_circle",
    dispatch: "local_shipping",
  }

  // Add these properties after the existing ones
  selectedOrderForDetail: any = null
  detailImages: string[] = []
  updateImages: File[] = []
  updateImagePreviewUrls: string[] = []

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
    this.setupDateSubscriptions()
  }

  ngOnDestroy(): void {
    this.destroy$.next()
    this.destroy$.complete()
  }

  private initializeForms(): void {
    this.createOrderForm = this.fb.group({
      workOrderNumber: [{ value: "", disabled: true }], // Auto-generated, read-only
      partyName: ["", [Validators.required, Validators.minLength(2)]],
      poNumber: [""],
      poDate: [""],
      itemDetails: ["", Validators.required],
      descriptionOfWork: [""],
      expectedCompletionDate: [""],
      images: [[]],
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
      // Setting-specific fields
      receivedStones: this.fb.array([]),
      returnedStones: this.fb.array([]),
      weightDifference: [{ value: 0, disabled: true }],
      issueDate: [""],
      jamahDate: [""],
      stoneBalance: [{ value: 0, disabled: true }],
      addedStones: this.fb.array([]),
      updateImages: [[]],
    })

    this.addStoneRow()
    this.generateWorkOrderNumber()
  }

  onPartyNameSelected(option: AutocompleteOption): void {
    console.log("Party name selected:", option)
    // You can add additional logic here if needed
  }


  // Generate auto work order number
  generateWorkOrderNumber(): void {
    this.workOrderService.getNextWorkOrderNumber().subscribe({
      next: (response) => {
        this.createOrderForm.patchValue({
          workOrderNumber: response.workOrderNumber,
        })
      },
      error: (error) => {
        console.error("Error generating work order number:", error)
        // Fallback to timestamp-based number
        const timestamp = Date.now().toString().slice(-4)
        this.createOrderForm.patchValue({
          workOrderNumber: `AB${timestamp}`,
        })
      },
    })
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

  // Image Upload Methods
  onFileSelected(event: any): void {
    const files = event.target.files
    if (files) {
      this.processSelectedFiles(files)
    }
  }

  onCameraCapture(): void {
    // Create a file input for camera capture
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*"
    input.capture = "environment" // Use rear camera
    input.onchange = (event: any) => {
      const files = event.target.files
      if (files) {
        this.processSelectedFiles(files)
      }
    }
    input.click()
  }

  private processSelectedFiles(files: FileList): void {
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.type.startsWith("image/")) {
        this.selectedImages.push(file)

        // Create preview URL
        const reader = new FileReader()
        reader.onload = (e: any) => {
          this.imagePreviewUrls.push(e.target.result)
        }
        reader.readAsDataURL(file)
      }
    }

    // Update form control
    this.createOrderForm.patchValue({
      images: this.selectedImages,
    })
  }

  removeImage(index: number): void {
    this.selectedImages.splice(index, 1)
    this.imagePreviewUrls.splice(index, 1)
    this.createOrderForm.patchValue({
      images: this.selectedImages,
    })
  }

  // Data Loading - FIXED with error handling
  loadWorkOrders(): void {
    this.loading = true
    this.workOrderService
      .getWorkOrders()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (orders) => {
          this.workOrders = orders || []
          this.loading = false
        },
        error: (error) => {
          console.error("Error loading work orders:", error)
          this.errorMessage = "Failed to load work orders"
          this.workOrders = [] // Initialize as empty array
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
          this.workers = workers || []
        },
        error: (error) => {
          console.error("Error loading workers:", error)
          this.errorMessage = "Failed to load workers"
          this.workers = [] // Initialize as empty array
          this.clearMessages()
        },
      })
  }

  loadStageData(): void {
    this.stageTypes.forEach((stage) => {
      this.loadStageOrders(stage)
    })
  }

  // FIXED with proper error handling
  loadStageOrders(stage: StageType): void {
    this.roleDashboardService
      .getAssignedWorkOrders(stage)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (orders) => {
          this.stageWorkOrders[stage] = orders || []
        },
        error: (error) => {
          console.error(`Error loading ${stage} orders:`, error)
          this.stageWorkOrders[stage] = [] // Initialize as empty array
          // Don't show error message for individual stage loading failures
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

  get receivedStones(): FormArray {
    return this.stageUpdateForm.get("receivedStones") as FormArray
  }

  get returnedStones(): FormArray {
    return this.stageUpdateForm.get("returnedStones") as FormArray
  }

  // Stone Management
  addStoneRow(): void {
    const stoneGroup = this.fb.group({
      type: ["", Validators.required],
      pieces: [0, [Validators.required, Validators.min(1)]],
      weightGrams: [0, [Validators.required, Validators.min(0.001)]],
      weightCarats: [0, [Validators.required, Validators.min(0.001)]],
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

  private formatDateForBackend(date: Date): string {
  return date.toISOString().split('T')[0];
}



  // FIXED with null check
  getWorkersByStage(stageType: string): Worker[] {
    if (!this.workers || !Array.isArray(this.workers)) {
      return []
    }
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

    const formValue = this.createOrderForm.getRawValue()

    // Create the request object with proper file handling
    const createRequest: CreateWorkOrderRequest = {
      workOrderNumber: formValue.workOrderNumber,
      partyName: formValue.partyName,
      poNumber: formValue.poNumber,
      poDate: formValue.poDate ? this.formatDateForBackend(formValue.poDate) : undefined,
      itemDetails: formValue.itemDetails,
      modelNumber: formValue.modelNumber,
      descriptionOfWork: formValue.descriptionOfWork,
       expectedCompletionDate: formValue.expectedCompletionDate 
    ? this.formatDateForBackend(formValue.expectedCompletionDate) 
    : undefined, // Keep as string
      images: this.selectedImages, // Pass the actual File objects
      stones: formValue.stones || [],
      assignedWorkers: formValue.assignedWorkers || [],
    }

    console.log("Creating work order with images:", this.selectedImages.length)

    this.workOrderService
      .createWorkOrder(createRequest)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (workOrder) => {
          this.successMessage = `Work order ${workOrder.workOrderNumber} created successfully!`
          this.resetForm()
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

  // Reset form after successful creation
  resetForm(): void {
    this.createOrderForm.reset()
    this.stones.clear()
    this.assignedWorkers.clear()
    this.selectedImages = []
    this.imagePreviewUrls = []
    this.addStoneRow()
    this.generateWorkOrderNumber()
  }

  // Worker Assignment for Existing Orders
  openAssignmentModal(workOrder: WorkOrder): void {
    this.selectedOrderForAssignment = workOrder
    this.setupAssignmentForm(workOrder)
  }

  setupAssignmentForm(workOrder: WorkOrder): void {
    this.assignments.clear()

    this.stageTypes.forEach((stageType) => {
      const existingAssignment = workOrder.assignedWorkers?.find((aw) => aw.stageType === stageType)

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
      issueDate: order.issueDate || "",
      jamahDate: order.jamahDate || "",
    })

    // Clear and reset form arrays
    this.addedStones.clear()
    this.updateImages = []
    this.updateImagePreviewUrls = []

    // Add default stone if none exist
    if (this.addedStones.length === 0) {
      this.addStoneToUpdate()
    }

    // Load stones for setting stage
    if (stage === "setting") {
      this.loadSettingStones(order.id)
    }

    // Calculate initial stone balance
    this.calculateStoneBalance()
  }

  submitStageUpdate(): void {
    if (!this.selectedStageOrder || this.stageUpdateForm.invalid) return

    this.updatingStage = true
    this.clearMessages()

    const formValue = this.stageUpdateForm.value
    const updateRequest: any = {
      stage: this.selectedStage,
      status: formValue.status,
      jamahWeight: formValue.jamahWeight,
      sortingIssue: formValue.sortingIssue,
      sortingJamah: formValue.sortingJamah,
      notes: formValue.notes,
      approved: formValue.approved,
      issueDate: formValue.issueDate,
      jamahDate: formValue.jamahDate,
      updateImages: this.updateImages, // Include uploaded images
    }

    // Include stones data for framing stage
    if (this.selectedStage === "framing" && this.addedStones.length > 0) {
      updateRequest.addedStones = this.addedStones.value
    }

    // Include stones data for setting stage
    if (this.selectedStage === "setting") {
      updateRequest.receivedStones = this.receivedStones.value
      updateRequest.returnedStones = this.returnedStones.value
      updateRequest.weightDifference = this.stageUpdateForm.get("weightDifference")?.value
    }

    console.log("Submitting stage update with images:", this.updateImages.length)

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
    this.receivedStones.clear()
    this.returnedStones.clear()
    this.addedStones.clear()
    this.updateImages = []
    this.updateImagePreviewUrls = []
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

  // FIXED with null checks
  calculateProgress(workOrder: WorkOrder): number {
    if (!workOrder.stages || workOrder.stages.length === 0) return 0
    const completedStages = workOrder.stages.filter((stage) => stage.status === "completed").length
    return Math.round((completedStages / workOrder.stages.length) * 100)
  }

  getCurrentStage(workOrder: WorkOrder): string {
    if (!workOrder.stages || workOrder.stages.length === 0) return "not-started"

    const currentStage = this.stageTypes.find((stage) => {
      const stageInfo = workOrder.stages.find((s) => s.stageName === stage)
      return !stageInfo || stageInfo.status !== "completed"
    })
    return currentStage || "completed"
  }

  // Stone weight conversion methods
  onWeightGramsChange(index: number, event: any): void {
    const value = Number.parseFloat(event.target.value) || 0
    const carats = (value * 5).toFixed(3) // Carats = Grams × 5
    const stoneControl = this.stones.at(index)
    stoneControl.patchValue({ weightCarats: Number.parseFloat(carats) }, { emitEvent: false })
  }

  onWeightCaratsChange(index: number, event: any): void {
    const value = Number.parseFloat(event.target.value) || 0
    const grams = (value / 5).toFixed(3) // Grams = Carats ÷ 5
    const stoneControl = this.stones.at(index)
    stoneControl.patchValue({ weightGrams: Number.parseFloat(grams) }, { emitEvent: false })
  }

  private setupDateSubscriptions(): void {
    // Auto-set expected completion date to 1 week from PO date
    this.createOrderForm
      .get("poDate")
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((poDate) => {
        if (poDate) {
          const expectedDate = new Date(poDate)
          expectedDate.setDate(expectedDate.getDate() + 7) // Add 1 week
          this.createOrderForm.patchValue({ expectedCompletionDate: expectedDate }, { emitEvent: false })
        }
      })
  }

  formatWeight(value: number): string {
    return value ? value.toFixed(3) : "0.000"
  }

  logout(): void {
    this.authService.logout()
    this.router.navigate(["/login"])
  }

  // Setting-specific stone management
  addReceivedStone(): void {
    const stoneGroup = this.fb.group({
      type: ["", Validators.required],
      pieces: [0, [Validators.required, Validators.min(1)]],
      weightGrams: [0, [Validators.required, Validators.min(0.001)]],
      weightCarats: [0, [Validators.required, Validators.min(0.001)]],
    })
    this.receivedStones.push(stoneGroup)
  }

  removeReceivedStone(index: number): void {
    if (this.receivedStones.length > 1) {
      this.receivedStones.removeAt(index)
      this.calculateWeightDifference()
    }
  }

  addReturnedStone(): void {
    const stoneGroup = this.fb.group({
      type: ["", Validators.required],
      pieces: [0, [Validators.required, Validators.min(1)]],
      weightGrams: [0, [Validators.required, Validators.min(0.001)]],
      weightCarats: [0, [Validators.required, Validators.min(0.001)]],
    })
    this.returnedStones.push(stoneGroup)
  }

  removeReturnedStone(index: number): void {
    this.returnedStones.removeAt(index)
    this.calculateWeightDifference()
  }

  // Weight conversion for setting stones
  onSettingWeightGramsChange(index: number, event: any, isReceived = true): void {
    const value = Number.parseFloat(event.target.value) || 0
    const carats = (value * 5).toFixed(3)
    const stonesArray = isReceived ? this.receivedStones : this.returnedStones
    const stoneControl = stonesArray.at(index)

    stoneControl.patchValue(
      {
        weightCarats: Number.parseFloat(carats),
      },
      { emitEvent: false },
    )

    this.calculateWeightDifference()
  }

  onSettingWeightCaratsChange(index: number, event: any, isReceived = true): void {
    const value = Number.parseFloat(event.target.value) || 0
    const grams = (value / 5).toFixed(3)
    const stonesArray = isReceived ? this.receivedStones : this.returnedStones
    const stoneControl = stonesArray.at(index)

    stoneControl.patchValue(
      {
        weightGrams: Number.parseFloat(grams),
      },
      { emitEvent: false },
    )

    this.calculateWeightDifference()
  }

  // Calculate weight difference between received and returned stones
  calculateWeightDifference(): void {
    const receivedTotal = this.receivedStones.controls.reduce((total, stone) => {
      return total + (stone.get("weightGrams")?.value || 0)
    }, 0)

    const returnedTotal = this.returnedStones.controls.reduce((total, stone) => {
      return total + (stone.get("weightGrams")?.value || 0)
    }, 0)

    const difference = receivedTotal - returnedTotal
    this.stageUpdateForm.patchValue({
      weightDifference: Number.parseFloat(difference.toFixed(3)),
    })
  }

  // Load stones data for setting stage
  loadSettingStones(workOrderId: string): void {
    this.roleDashboardService.getStones(workOrderId).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          // Clear existing stones
          this.receivedStones.clear()
          this.returnedStones.clear()

          // Load received stones
          if (response.data.receivedStones) {
            response.data.receivedStones.forEach((stone: any) => {
              const stoneGroup = this.fb.group({
                type: [stone.type],
                pieces: [stone.pieces],
                weightGrams: [stone.weightGrams],
                weightCarats: [stone.weightCarats],
              })
              this.receivedStones.push(stoneGroup)
            })
          }

          // Load returned stones
          if (response.data.returnedStones) {
            response.data.returnedStones.forEach((stone: any) => {
              const stoneGroup = this.fb.group({
                type: [stone.type],
                pieces: [stone.pieces],
                weightGrams: [stone.weightGrams],
                weightCarats: [stone.weightCarats],
              })
              this.returnedStones.push(stoneGroup)
            })
          }

          // Ensure at least one stone in each array
          if (this.receivedStones.length === 0) {
            this.addReceivedStone()
          }
          if (this.returnedStones.length === 0) {
            this.addReturnedStone()
          }

          this.calculateWeightDifference()
        }
      },
      error: (error) => {
        console.error("Error loading stones:", error)
        // Add default stones if loading fails
        this.addReceivedStone()
        this.addReturnedStone()
      },
    })
  }

  // Add these methods after the existing methods:

  // View Detail Modal Methods
  openDetailModal(order: any): void {
    this.selectedOrderForDetail = order
    this.loadOrderDetails(order.id)
  }

  closeDetailModal(): void {
    this.selectedOrderForDetail = null
    this.detailImages = []
  }

  loadOrderDetails(workOrderId: string): void {
    this.workOrderService.getWorkOrderDetails(workOrderId).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          // Handle images - they should already be full URLs from the backend
          this.detailImages = response.data.images || []
          console.log("Loaded images for work order:", this.detailImages)
        }
      },
      error: (error) => {
        console.error("Error loading order details:", error)
        this.detailImages = []
      },
    })
  }

  // Enhanced Update Status Methods
  get addedStones(): FormArray {
    return this.stageUpdateForm.get("addedStones") as FormArray
  }

  addStoneToUpdate(): void {
    const stoneGroup = this.fb.group({
      type: ["", Validators.required],
      pieces: [0, [Validators.required, Validators.min(1)]],
      weightGrams: [0, [Validators.required, Validators.min(0.001)]],
      weightCarats: [0, [Validators.required, Validators.min(0.001)]],
    })
    this.addedStones.push(stoneGroup)
  }

  removeAddedStone(index: number): void {
    this.addedStones.removeAt(index)
    this.calculateStoneBalance()
  }

  onUpdateWeightGramsChange(index: number, event: any): void {
    const value = Number.parseFloat(event.target.value) || 0
    const carats = (value * 5).toFixed(3)
    const stoneControl = this.addedStones.at(index)
    stoneControl.patchValue(
      {
        weightCarats: Number.parseFloat(carats),
      },
      { emitEvent: false },
    )
    this.calculateStoneBalance()
  }

  onUpdateWeightCaratsChange(index: number, event: any): void {
    const value = Number.parseFloat(event.target.value) || 0
    const grams = (value / 5).toFixed(3)
    const stoneControl = this.addedStones.at(index)
    stoneControl.patchValue(
      {
        weightGrams: Number.parseFloat(grams),
      },
      { emitEvent: false },
    )
    this.calculateStoneBalance()
  }

  calculateStoneBalance(): void {
    // Calculate total received stones from original work order
    const originalStones = this.selectedStageOrder?.stones || []
    const receivedTotal = originalStones.reduce((total: number, stone: any) => {
      return total + (stone.weightGrams || 0)
    }, 0)

    // Calculate total added stones
    const addedTotal = this.addedStones.controls.reduce((total, stone) => {
      return total + (stone.get("weightGrams")?.value || 0)
    }, 0)

    const balance = receivedTotal + addedTotal
    this.stageUpdateForm.patchValue({
      stoneBalance: Number.parseFloat(balance.toFixed(3)),
    })
  }

  // Image Upload for Updates
  onUpdateFileSelected(event: any): void {
    const files = event.target.files
    if (files) {
      this.processUpdateFiles(files)
    }
  }

  private processUpdateFiles(files: FileList): void {
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.type.startsWith("image/")) {
        this.updateImages.push(file)

        const reader = new FileReader()
        reader.onload = (e: any) => {
          this.updateImagePreviewUrls.push(e.target.result)
        }
        reader.readAsDataURL(file)
      }
    }

    this.stageUpdateForm.patchValue({
      updateImages: this.updateImages,
    })
  }

  removeUpdateImage(index: number): void {
    this.updateImages.splice(index, 1)
    this.updateImagePreviewUrls.splice(index, 1)
    this.stageUpdateForm.patchValue({
      updateImages: this.updateImages,
    })
  }

  formatDateDetail(date: Date | string | undefined): string {
    if (!date) return "Not assigned"
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }
}