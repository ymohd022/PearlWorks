import { Component,  OnInit,  OnDestroy } from "@angular/core"
import {  FormBuilder, FormGroup, Validators, FormArray } from "@angular/forms"
import { Subject, takeUntil } from "rxjs"
import  { WorkOrder, CreateWorkOrderRequest, Worker, StageType, AssignedWorker } from "../../work-order.interface"
import  { WorkOrderService } from "../../services/work-order.service"
import  { Router } from "@angular/router"
import  { AuthService } from "../../services/auth.service"
import  { RoleDashboardService } from "../../services/role-dashboard.service"
import  { AutocompleteOption } from "../../services/autocomplete.service"
import  { ApiService } from "../../services/api.service"
import  { DispatchOrder, DispatchStatistics, DispatchUpdateRequest } from "../../dispatch.interface"
import  { DispatchService } from "../../services/dispatch.service"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

@Component({
  selector: "app-manager-dashboard",
  standalone: false,
  templateUrl: "./manager-dashboard.component.html",
  styleUrl: "./manager-dashboard.component.css",
})
export class ManagerDashboardComponent implements OnInit, OnDestroy {
  // Tab management
  selectedTabIndex = 0
  expandedState: { [orderId: string]: boolean } = {}
  dispatchImages: File[] = []
  dispatchImagePreviewUrls: string[] = []
  repairOrders: any[] = []
  repairStatistics: any = null
  selectedRepairOrder: any = null
  repairUpdateForm!: FormGroup
  updatingRepair = false

  // Forms
  polishOrders: any[] = []
  polishStatistics: any = null
  selectedPolishOrder: any = null
  polishUpdateForm!: FormGroup
  createOrderForm!: FormGroup
  assignmentForm!: FormGroup
  stageUpdateForm!: FormGroup
  settingsForm!: FormGroup
  dispatchForm!: FormGroup
  orders: DispatchOrder[] = []

  // Add displayedColumns for dispatch table
  displayedColumns: string[] = [
    "workOrderNumber",
    "partyName",
    "orderCompletedDate",
    "grossWeight",
    "netWeight",
    "status",
    "actions",
  ]
  statistics: DispatchStatistics | null = null
  selectedOrder: DispatchOrder | null = null
  originalStones: any[] = []
  originalReceivedStones: any[] = []
  receivedStonesTotal = { grams: 0, carats: 0 }
  stonesDifference = { grams: 0, carats: 0 }

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

  // Updated stone balance properties to match new API response
  originalReceivedStonesTotal = { grams: 0, carats: 0 }
  stageAddedStonesTotal = { grams: 0, carats: 0 }
  totalReceivedStonesTotal = { grams: 0, carats: 0 }
  returnedStonesTotal = { grams: 0, carats: 0 }
  remainingStones = { grams: 0, carats: 0 }
  stoneBalance: any = null
  stoneDetails: any[] = []

  private destroy$ = new Subject<void>()

  constructor(
    private fb: FormBuilder,
    private workOrderService: WorkOrderService,
    private roleDashboardService: RoleDashboardService,
    private dispatchService: DispatchService,
    private router: Router,
    private authService: AuthService,
    private apiservice: ApiService,
  ) {
    this.initializeForms()
    this.initializeRepairUpdateForm()
  }

  ngOnInit(): void {
    this.loadWorkOrders()
    this.loadWorkers()
    this.loadStageData()
    this.setupDateSubscriptions()
    this.loadOrders()
    this.loadPolishOrders() // Add this line
    this.loadPolishStatistics() // Add this line
    this.initializePolishUpdateForm()
    this.loadRepairOrders()
    this.loadRepairStatistics()
    this.loadStatistics()
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
      approxWeight: [0, [Validators.min(0)]],
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
      sorting: [false], // Changed from sortingIssue and sortingJamah to single checkbox
      notes: [""],
      approved: [false],
      // Setting-specific fields
      receivedStones: this.fb.array([]), // No Validators.required here
      returnedStones: this.fb.array([]),
      weightDifference: [{ value: 0, disabled: true }],
      assignmentDate: [{ value: "", disabled: true }], // Changed from issueDate to assignmentDate (readonly)
      jamahDate: [""],
      stoneBalance: [{ value: 0, disabled: true }],
      addedStones: this.fb.array([]),
      updateImages: [[]],
    })

    this.dispatchForm = this.fb.group({
      orderCompletedDate: ["", Validators.required],
      dispatchedBy: ["", [Validators.required, Validators.minLength(2)]],
      grossWeight: [0, [Validators.required, Validators.min(0.001)]], // Add grossWeight
      expectedWastage: [0, [Validators.min(0)]], // NEW FIELD
      images: [[]], // Add images
    })

    this.addStoneRow()
    this.generateWorkOrderNumber()
  }

loadOrders(): void {
    this.loading = true
    // Use dispatch service to get orders assigned to dispatch stage
    this.dispatchService
      .getAssignedOrders()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.orders = response.data || []
          // For each order, fetch its stones and assign to the order object
          this.orders.forEach((order) => {
            this.workOrderService.getWorkOrderDetails(order.id).subscribe({
              next: (detailsResponse) => {
                if (detailsResponse.success && detailsResponse.data) {
                  order.stones = detailsResponse.data.stones || []
                } else {
                  order.stones = []
                }
              },
              error: () => {
                order.stones = []
              }
            })
          })
          this.loading = false
        },
        error: (error) => {
          console.error("Error loading dispatch orders:", error)
          this.errorMessage = "Failed to load dispatch orders"
          this.loading = false
          this.clearMessages()
        },
      })
  }

  getDaysTaken(order: any, stage: string): number | string {
    // For stage orders (framing, setting, polish, repair)
    if (order.assignedDate) {
      const start = new Date(order.assignedDate)
      const end = order.status === "completed" && order.jamahDate ? new Date(order.jamahDate) : new Date()
      const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      return diff
    }
    // For dispatch orders
    else if (order.orderCompletedDate && (order.assignedDate || order.createdDate)) {
      const start = new Date(order.assignedDate || order.createdDate)
      const end = new Date(order.orderCompletedDate)
      const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      return diff
    }
    // If neither, just return 'N/A' but don't break the UI
    return "N/A"
  }

  initializePolishUpdateForm(): void {
    this.polishUpdateForm = this.fb.group({
      status: ["", Validators.required],
      jamahWeight: [0],
      sorting: [false], // Changed from sortingIssue and sortingJamah
      notes: [""],
      approved: [false],
      karigarName: [""],
      assignmentDate: [{ value: "", disabled: true }], // Changed from issueDate to assignmentDate (readonly)
      jamahDate: [""],
      weightDifference: [{ value: 0, disabled: true }],
      updateImages: [[]],
    })
  }

  // Load Polish Orders
  loadPolishOrders(): void {
    this.loading = true
    this.clearMessages()
    this.apiservice
      .getManagerStageOrders("polish")
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.polishOrders = response.data || []
          this.stageWorkOrders["polish"] = this.polishOrders
          this.loading = false
        },
        error: (error) => {
          console.error("Error loading polish orders:", error)
          this.errorMessage = "Failed to load polish orders"
          this.loading = false
          this.clearMessages()
        },
      })
  }

  // Load Polish Statistics
  loadPolishStatistics(): void {
    this.apiservice
      .getPolishStatistics()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.polishStatistics = response.data || null
        },
        error: (error) => {
          console.error("Error loading polish statistics:", error)
          this.errorMessage = "Failed to load polish statistics"
          this.clearMessages()
        },
      })
  }

  // Add the missing openPolishUpdateModal method
  openPolishUpdateModal(order: any): void {
    this.selectedPolishOrder = order
    this.polishUpdateForm.patchValue({
      status: order.status || "not-started",
      jamahWeight: order.jamahWeight || 0,
      sorting: order.sorting || false, // Changed from sortingIssue and sortingJamah
      notes: order.notes || "",
      approved: order.approved || false,
      karigarName: order.karigarName || "",
      assignmentDate: this.formatDateForInput(order.assignedDate), // Show assignment date (readonly)
      jamahDate: order.jamahDate || "",
      weightDifference: order.weightDifference || 0,
    })

    this.updateImages = []
    this.updateImagePreviewUrls = []
  }

  // Submit Polish Update
  submitPolishUpdate(): void {
    if (!this.selectedPolishOrder || this.polishUpdateForm.invalid) return
    this.updatingStage = true
    this.clearMessages()
    const formValue = this.polishUpdateForm.value
    const updateRequest: any = {
      stage: "polish",
      status: formValue.status,
      jamahWeight: formValue.jamahWeight,
      sorting: formValue.sorting, // Changed from sortingIssue and sortingJamah
      notes: formValue.notes,
      approved: formValue.approved,
      karigarName: formValue.karigarName,
      jamahDate: formValue.jamahDate,
      updateImages: this.updateImages,
    }
    this.apiservice
      .updateManagerStageStatus(this.selectedPolishOrder.id, updateRequest)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.successMessage = response.message || "Polish stage updated successfully"
          this.closePolishUpdateModal()
          this.loadPolishOrders()
          this.loadPolishStatistics()
          this.updatingStage = false
          this.clearMessages()
        },
        error: (error) => {
          console.error("Error updating polish stage:", error)
          this.errorMessage = error?.error?.message || "Failed to update polish stage"
          this.updatingStage = false
          this.clearMessages()
        },
      })
  }

  closePolishUpdateModal(): void {
    this.selectedPolishOrder = null
    this.polishUpdateForm.reset()
    this.updateImages = []
    this.updateImagePreviewUrls = []
  }

  initializeRepairUpdateForm(): void {
    this.repairUpdateForm = this.fb.group({
      status: ["", Validators.required],
      issueWeight: [null], // always editable
      jamahWeight: [null, [Validators.min(0)]],
      sorting: [false],
      notes: [""],
      approved: [false],
      assignmentDate: [{ value: "", disabled: true }],
      jamahDate: [""],
      weightDifference: [{ value: 0, disabled: true }],
      updateImages: [[]],
    })
  }

  loadRepairOrders(): void {
    this.loading = true
    this.apiservice.getManagerStageOrders("repair").subscribe({
      next: (response) => {
        this.repairOrders = response.data || []
        this.stageWorkOrders["repair"] = this.repairOrders
        this.loading = false
      },
      error: (error) => {
        this.errorMessage = "Failed to load repair orders"
        this.loading = false
      },
    })
  }

  loadRepairStatistics(): void {
    this.apiservice.getRepairStatistics().subscribe({
      next: (response) => {
        this.repairStatistics = response.data || null
      },
      error: (error) => {
        this.errorMessage = "Failed to load repair statistics"
      },
    })
  }

  openRepairUpdateModal(order: any): void {
    this.selectedRepairOrder = order
    this.repairUpdateForm.patchValue({
      status: order.status || "not-started",
      issueWeight: order.issueWeight || null,
      jamahWeight: order.jamahWeight || null,
      sorting: order.sorting || false,
      notes: order.notes || "",
      approved: order.approved || false,
      assignmentDate: order.assignedDate ? this.formatDateForInput(order.assignedDate) : "",
      jamahDate: order.jamahDate || "",
      weightDifference: order.weightDifference || 0,
    })

    this.updateImages = []
    this.updateImagePreviewUrls = []

    // Subscribe to form changes to calculate weight difference
    this.repairUpdateForm.get("issueWeight")?.valueChanges.subscribe(() => {
      this.calculateRepairWeightDifference()
    })
    this.repairUpdateForm.get("jamahWeight")?.valueChanges.subscribe(() => {
      this.calculateRepairWeightDifference()
    })
  }

  calculateRepairWeightDifference(): void {
    const issueWeight = this.repairUpdateForm.get("issueWeight")?.value || 0
    const jamahWeight = this.repairUpdateForm.get("jamahWeight")?.value || 0
    const difference = jamahWeight - issueWeight
    this.repairUpdateForm.patchValue({
      weightDifference: Number.parseFloat(difference.toFixed(3)),
    })
  }

  closeRepairUpdateModal(): void {
    this.selectedRepairOrder = null
    this.repairUpdateForm.reset()
    this.updateImages = []
    this.updateImagePreviewUrls = []
  }

  submitRepairUpdate(): void {
    if (!this.selectedRepairOrder || this.repairUpdateForm.invalid) return
    this.updatingRepair = true
    this.clearMessages()

    const formValue = this.repairUpdateForm.value
    const updateRequest: any = {
      stage: "repair",
      status: formValue.status,
      issueWeight: formValue.issueWeight,
      jamahWeight: formValue.jamahWeight,
      sorting: formValue.sorting,
      notes: formValue.notes,
      approved: formValue.approved,
      jamahDate: formValue.jamahDate,
      updateImages: this.updateImages,
    }

    this.apiservice.updateManagerStageStatus(this.selectedRepairOrder.id, updateRequest).subscribe({
      next: (response) => {
        this.successMessage = response.message || "Repair stage updated successfully"
        this.closeRepairUpdateModal()
        this.loadRepairOrders()
        this.loadRepairStatistics()
        this.updatingRepair = false
        this.clearMessages()
      },
      error: (error) => {
        this.errorMessage = error?.error?.message || "Failed to update repair stage"
        this.updatingRepair = false
        this.clearMessages()
      },
    })
  }

  loadStatistics(): void {
    this.dispatchService
      .getStatistics()
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

  openDispatchModal(order: DispatchOrder): void {
    this.selectedOrder = order
      this.dispatchImages = []  // Reset dispatch images
  this.dispatchImagePreviewUrls = []
    this.dispatchForm.patchValue({
    orderCompletedDate: this.formatDateForInput(order.orderCompletedDate),
    dispatchedBy: "",
    grossWeight: order.grossWeight || 0,
    expectedWastage: order.expectedWastage || 0, // PATCH
  })
}

  closeDispatchModal(): void {
    this.selectedOrder = null
    this.dispatchForm.reset()
  }

  onSubmitDispatch(): void {
    if (this.dispatchForm.invalid || !this.selectedOrder) {
      this.markFormGroupTouched(this.dispatchForm)
      return
    }

    this.submitting = true
    this.clearMessages()

    const updateRequest: DispatchUpdateRequest = {
      orderCompletedDate: this.dispatchForm.value.orderCompletedDate,
      dispatchedBy: this.dispatchForm.value.dispatchedBy,
      status: "dispatched",
      grossWeight: this.dispatchForm.value.grossWeight, // Add grossWeight
      images: this.dispatchImagePreviewUrls, // Use selectedImages for dispatch
    }


    this.dispatchService
      .updateDispatchStatus(this.selectedOrder.id, updateRequest)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.successMessage = `Order ${this.selectedOrder?.workOrderNumber} dispatched successfully!`
          this.closeDispatchModal()
          this.loadOrders()
          this.loadStatistics()
          this.submitting = false
          this.clearMessages()
        },
        error: (error) => {
          console.error("Error dispatching order:", error)
          this.errorMessage = "Failed to dispatch order. Please try again."
          this.submitting = false
          this.clearMessages()
        },
      })
  }

  private formatDateForInput(date: Date | string): string {
    if (!date) return ""
    const d = new Date(date)
    return d.toISOString().split("T")[0]
  }

  onPartyNameSelected(option: AutocompleteOption): void {
    console.log("Party name selected:", option)
  }

  getStatusClass(status: string): string {
    return status === "dispatched" ? "status-dispatched" : "status-ready"
  }

  // Updated stone balance calculation methods to consider received stones properly
  calculateStonesTotals(): void {
    // Calculate additional stones added during setting stage
    this.stageAddedStonesTotal = this.receivedStones.controls.reduce(
      (total, stone) => ({
        grams: total.grams + (stone.get("weightGrams")?.value || 0),
        carats: total.carats + (stone.get("weightCarats")?.value || 0),
      }),
      { grams: 0, carats: 0 },
    )

    // Calculate returned stones total
    this.returnedStonesTotal = this.returnedStones.controls.reduce(
      (total, stone) => ({
        grams: total.grams + (stone.get("weightGrams")?.value || 0),
        carats: total.carats + (stone.get("weightCarats")?.value || 0),
      }),
      { grams: 0, carats: 0 },
    )

    // Calculate original received stones weight (from work order creation)
    this.originalReceivedStonesTotal = this.originalReceivedStones.reduce(
      (total, stone) => ({
        grams: total.grams + (stone.weightGrams || 0),
        carats: total.carats + (stone.weightCarats || 0),
      }),
      { grams: 0, carats: 0 },
    )

    // Calculate total received stones (original + stage added)
    this.totalReceivedStonesTotal = {
      grams: this.originalReceivedStonesTotal.grams + this.stageAddedStonesTotal.grams,
      carats: this.originalReceivedStonesTotal.carats + this.stageAddedStonesTotal.carats,
    }

    // Calculate remaining stones (total received - returned)
    this.remainingStones = {
      grams: this.totalReceivedStonesTotal.grams - this.returnedStonesTotal.grams,
      carats: this.totalReceivedStonesTotal.carats - this.returnedStonesTotal.carats,
    }

    // Update weight difference in form
    this.stageUpdateForm.patchValue({
      weightDifference: Number.parseFloat(this.remainingStones.grams.toFixed(3)),
    })
  }

  // Load stone balance data - Updated to handle new API response structure
  loadStoneBalance(workOrderId: string, stage = "setting"): void {
    this.workOrderService.getStoneBalance(workOrderId, stage).subscribe({
      next: (response) => {
        if (response.success) {
          this.stoneBalance = response.data.summary
          this.stoneDetails = response.data.stoneDetails

          // Update totals for display using new API structure
          this.originalReceivedStonesTotal = this.stoneBalance.originalReceivedStones
          this.stageAddedStonesTotal = this.stoneBalance.stageAddedStones
          this.totalReceivedStonesTotal = this.stoneBalance.totalReceivedStones
          this.returnedStonesTotal = this.stoneBalance.returnedStones
          this.remainingStones = this.stoneBalance.remainingStones
        }
      },
      error: (error) => {
        console.error("Error loading stone balance:", error)
      },
    })
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
      if (stage === "polish") {
        this.loadPolishOrders()
        this.loadPolishStatistics()
      } else if (stage === "repair") {
        this.loadRepairOrders()
        this.loadRepairStatistics()
      }
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
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*"
    input.capture = "environment"
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

        const reader = new FileReader()
        reader.onload = (e: any) => {
          this.imagePreviewUrls.push(e.target.result)
        }
        reader.readAsDataURL(file)
      }
    }

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

  // Data Loading
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
          this.workOrders = []
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
          this.workers = []
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
          this.stageWorkOrders[stage] = orders || []
        },
        error: (error) => {
          console.error(`Error loading ${stage} orders:`, error)
          this.stageWorkOrders[stage] = []
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

  // Updated to load original received stones (is_received = 1)
  loadOriginalReceivedStones(workOrderId: string): void {
    this.workOrderService.getWorkOrderDetails(workOrderId).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          // Filter only received stones from work order creation
          this.originalReceivedStones = (response.data.stones || []).filter((stone: any) => stone.isReceived)
          // Also set originalStones for display
          this.originalStones = [...this.originalReceivedStones] // ADD THIS LINE
        }
      },
      error: (error) => {
        console.error("Error loading original received stones:", error)
        this.originalReceivedStones = []
        this.originalStones = [] // ADD THIS LINE
      },
    })
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
    return date.toISOString().split("T")[0]
  }

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

    const createRequest: CreateWorkOrderRequest = {
      workOrderNumber: formValue.workOrderNumber,
      partyName: formValue.partyName,
      poNumber: formValue.poNumber,
      poDate: formValue.poDate ? this.formatDateForBackend(formValue.poDate) : undefined,
      itemDetails: formValue.itemDetails,
      modelNumber: formValue.modelNumber,
      approxWeight: formValue.approxWeight,
      descriptionOfWork: formValue.descriptionOfWork,
      expectedCompletionDate: formValue.expectedCompletionDate
        ? this.formatDateForBackend(formValue.expectedCompletionDate)
        : undefined,
      images: this.selectedImages,
      stones: formValue.stones || [],
      assignedWorkers: formValue.assignedWorkers || [],
    }

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
    this.loadOriginalReceivedStones(order.id)
    this.originalReceivedStones = []

    this.stageUpdateForm.patchValue({
      status: order.status || "not-started",
      jamahWeight: order.jamahWeight || 0,
      sorting: order.sorting || false, // Changed from sortingIssue and sortingJamah
      notes: order.notes || "",
      approved: order.approved || false,
      assignmentDate: this.formatDateForInput(order.assignedDate), // Show assignment date (readonly)
      jamahDate: order.jamahDate || "",
    })

    this.updateImages = []
    this.updateImagePreviewUrls = []

    // Load stones for setting stage and calculate balance
    if (stage === "setting") {
      this.loadSettingStones(order.id)
      this.loadStoneBalance(order.id, stage)
    }

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
      sorting: formValue.sorting, // Changed from sortingIssue and sortingJamah
      notes: formValue.notes,
      approved: formValue.approved,
      jamahDate: formValue.jamahDate,
      updateImages: this.updateImages,
    }

    // Include stones data for setting stage
    if (this.selectedStage === "setting") {
      updateRequest.receivedStones = this.receivedStones.value
      updateRequest.returnedStones = this.returnedStones.value
      updateRequest.weightDifference = this.stageUpdateForm.get("weightDifference")?.value
    }

    this.apiservice
      .updateManagerStageStatus(this.selectedStageOrder.id, updateRequest)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.successMessage = response.message || "Stage updated successfully"
          this.selectedStageOrder = null
          this.loadStageOrders(this.selectedStage)
          this.updatingStage = false
          this.clearMessages()
        },
        error: (error) => {
          console.error("Error updating stage:", error)
          this.errorMessage = error.error?.message || "Failed to update stage"
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
    this.updateImages = []
    this.updateImagePreviewUrls = []
    this.stoneBalance = null
    this.stoneDetails = []
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
    const d = new Date(date)
    return `${d.getDate().toString().padStart(2, "0")}:${(d.getMonth() + 1).toString().padStart(2, "0")}:${d.getFullYear()}`
  }

  formatDateDetail(date: Date | string | undefined): string {
    if (!date) return "Not assigned"
    const d = new Date(date)
    return `${d.getDate().toString().padStart(2, "0")}:${(d.getMonth() + 1).toString().padStart(2, "0")}:${d.getFullYear()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`
  }

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

  // Returns the status of a given stage for a work order
  getStageStatus(order: any, stage: string): string {
    if (!order.stages) return "not-started"
    const found = order.stages.find((s: any) => s.stageName === stage)
    return found ? found.status : "not-started"
  }

  // Calculates progress as percentage of completed stages out of all 5
  calculateProgressAllStages(order: any): number {
    if (!order.stages) return 0
    const totalStages = this.stageTypes.length
    const completedStages = this.stageTypes.filter((stage) => this.getStageStatus(order, stage) === "completed").length
    return Math.round((completedStages / totalStages) * 100)
  }

  // Returns the number of days taken for a stage (from assignment to now or to completion)
  getAssignmentDays(order: any, stage: string): number | null {
    if (!order.stages) return null
    const stageInfo = order.stages.find((s: any) => s.stageName === stage)
    if (!stageInfo || !stageInfo.assignedDate) return null
    const assigned = new Date(stageInfo.assignedDate)
    let end: Date
    if (stageInfo.status === "completed" && stageInfo.jamahDate) {
      end = new Date(stageInfo.jamahDate)
    } else if (stageInfo.status === "completed" && stageInfo.completedDate) {
      end = new Date(stageInfo.completedDate)
    } else {
      end = new Date()
    }
    // Calculate difference in days
    const diff = Math.ceil((end.getTime() - assigned.getTime()) / (1000 * 60 * 60 * 24))
    return diff >= 0 ? diff : 0
  }

  // Updated weight conversion methods to use blur events
  onWeightGramsBlur(index: number, event: any): void {
    const inputValue = event.target.value.trim()
    if (inputValue === "") return

    const value = Number.parseFloat(inputValue)
    if (!isNaN(value) && value > 0) {
      const carats = Number.parseFloat((value * 5).toFixed(3))
      const stoneControl = this.stones.at(index)
      stoneControl.patchValue(
        {
          weightGrams: value,
          weightCarats: carats,
        },
        { emitEvent: false },
      )
    }
  }

  onWeightCaratsBlur(index: number, event: any): void {
    const inputValue = event.target.value.trim()
    if (inputValue === "") return

    const value = Number.parseFloat(inputValue)
    if (!isNaN(value) && value > 0) {
      const grams = Number.parseFloat((value / 5).toFixed(3))
      const stoneControl = this.stones.at(index)
      stoneControl.patchValue(
        {
          weightGrams: grams,
          weightCarats: value,
        },
        { emitEvent: false },
      )
    }
  }

  private setupDateSubscriptions(): void {
    this.createOrderForm
      .get("poDate")
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((poDate) => {
        if (poDate) {
          const expectedDate = new Date(poDate)
          expectedDate.setDate(expectedDate.getDate() + 7)
          this.createOrderForm.patchValue({ expectedCompletionDate: expectedDate }, { emitEvent: false })
        }
      })
  }

  formatWeight(value: number | undefined): string {
    if (typeof value === "number" && !isNaN(value)) {
      return value.toString()
    }
    return ""
  }

  logout(): void {
    this.authService.logout()
    this.router.navigate(["/login"])
  }

  toggleOrderDetails(orderId: string): void {
    this.expandedState[orderId] = !this.expandedState[orderId]
  }

  isExpanded(orderId: string): boolean {
    return this.expandedState[orderId]
  }

  // Setting-specific stone management - Updated for received stones
  addReceivedStone(): void {
    const stoneGroup = this.fb.group({
      type: [""],
      pieces: [0],
      weightGrams: [0],
      weightCarats: [0],
    })
    this.receivedStones.push(stoneGroup)
    this.calculateStonesTotals()
  }

  removeReceivedStone(index: number): void {
    if (this.receivedStones.length > 1) {
      this.receivedStones.removeAt(index)
      this.calculateStonesTotals()
    }
  }

  addReturnedStone(): void {
    const stoneGroup = this.fb.group({
      type: ["", Validators.required],
      pieces: [0, [Validators.required, Validators.min(0)]],
      weightGrams: [0, [Validators.required, Validators.min(0)]],
      weightCarats: [0, [Validators.required, Validators.min(0)]],
    })
    this.returnedStones.push(stoneGroup)
    this.calculateStonesTotals()
  }

  removeReturnedStone(index: number): void {
    this.returnedStones.removeAt(index)
    this.calculateStonesTotals()
  }

  // Updated weight conversion for setting stones using text input
  onSettingWeightGramsBlur(index: number, event: any, isReceived = true): void {
    const inputValue = event.target.value.trim()
    if (inputValue === "") return

    const value = Number.parseFloat(inputValue)
    if (!isNaN(value) && value > 0) {
      const carats = Number.parseFloat((value * 5).toFixed(3))
      const stonesArray = isReceived ? this.receivedStones : this.returnedStones
      const stoneControl = stonesArray.at(index)

      stoneControl.patchValue(
        {
          weightGrams: value,
          weightCarats: carats,
        },
        { emitEvent: false },
      )

      this.calculateStonesTotals()
    }
  }

  onSettingWeightCaratsBlur(index: number, event: any, isReceived = true): void {
    const inputValue = event.target.value.trim()
    if (inputValue === "") return

    const value = Number.parseFloat(inputValue)
    if (!isNaN(value) && value > 0) {
      const grams = Number.parseFloat((value / 5).toFixed(3))
      const stonesArray = isReceived ? this.receivedStones : this.returnedStones
      const stoneControl = stonesArray.at(index)

      stoneControl.patchValue(
        {
          weightGrams: grams,
          weightCarats: value,
        },
        { emitEvent: false },
      )

      this.calculateStonesTotals()
    }
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

  // Load stones data for setting stage - Updated to handle received stones properly
  loadSettingStones(workOrderId: string): void {
    this.roleDashboardService.getStones(workOrderId).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.receivedStones.clear()
          this.returnedStones.clear()

          // Load additional stones added during setting stage
          if (response.data.receivedStones) {
            const settingStones = response.data.receivedStones.filter((stone: any) => stone.stageAdded === "setting")
            settingStones.forEach((stone: any) => {
              const stoneGroup = this.fb.group({
                type: [stone.type],
                pieces: [stone.pieces],
                weightGrams: [stone.weightGrams],
                weightCarats: [stone.weightCarats],
              })
              this.receivedStones.push(stoneGroup)
            })
          }

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

          if (this.receivedStones.length === 0) {
            this.addReceivedStone()
          }
          if (this.returnedStones.length === 0) {
            this.addReturnedStone()
          }

          this.calculateStonesTotals()
        }
      },
      error: (error) => {
        console.error("Error loading stones:", error)
        this.addReceivedStone()
        this.addReturnedStone()
      },
    })
  }

  // View Detail Modal Methods
  openDetailModal(order: any): void {
    this.selectedOrderForDetail = { ...order }
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
          this.detailImages = response.data.images || []
          // Ensure stones data is properly assigned
          this.selectedOrderForDetail.stones = response.data.stones || []
          console.log("Loaded images for work order:", this.detailImages)
          console.log("Loaded stones for work order:", this.selectedOrderForDetail.stones)
        }
      },
      error: (error) => {
        console.error("Error loading order details:", error)
        this.detailImages = []
        this.selectedOrderForDetail.stones = []
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

  onUpdateWeightGramsBlur(index: number, event: any): void {
    const value = Number.parseFloat(event.target.value) || 0
    if (value > 0) {
      const carats = Number.parseFloat((value * 5).toFixed(3))
      const stoneControl = this.addedStones.at(index)
      stoneControl.patchValue(
        {
          weightCarats: carats,
        },
        { emitEvent: false },
      )
      this.calculateStoneBalance()
    }
  }

  onUpdateWeightCaratsBlur(index: number, event: any): void {
    const value = Number.parseFloat(event.target.value) || 0
    if (value > 0) {
      const grams = Number.parseFloat((value / 5).toFixed(3))
      const stoneControl = this.addedStones.at(index)
      stoneControl.patchValue(
        {
          weightGrams: grams,
        },
        { emitEvent: false },
      )
      this.calculateStoneBalance()
    }
  }

  calculateStoneBalance(): void {
    // Calculate balance including original received stones
    const originalReceivedTotal = this.originalReceivedStones.reduce((total: number, stone: any) => {
      return total + (stone.weightGrams || 0)
    }, 0)

    const addedTotal = this.addedStones.controls.reduce((total, stone) => {
      return total + (stone.get("weightGrams")?.value || 0)
    }, 0)

    const balance = originalReceivedTotal + addedTotal
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

    // Calculate Net Weight
  calculateNetWeight(order: any): string {
    let totalStonesWeight = 0
    if (order.stones && order.stones.length > 0) {
      totalStonesWeight = order.stones.reduce((sum: number, stone: any) => sum + (stone.weightGrams || 0), 0)
    }
    const netWeight = order.grossWeight - totalStonesWeight
    return this.formatWeight(netWeight)
  }

  onDispatchFileSelected(event: any): void {
    const files = event.target.files
    if (files) {
      this.processDispatchFiles(files)
    }
  }

private processDispatchFiles(files: FileList): void {
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    if (file.type.startsWith("image/")) {
      this.dispatchImages.push(file)

      const reader = new FileReader()
      reader.onload = (e: any) => {
        this.dispatchImagePreviewUrls.push(e.target.result)
      }
      reader.readAsDataURL(file)
    }
  }
}

removeDispatchImage(index: number): void {
  this.dispatchImages.splice(index, 1)
  this.dispatchImagePreviewUrls.splice(index, 1)
}

  // Returns a per-stone-type summary for the Setting tab, including original received stones
  getStoneTypeSummary(): Array<{
    type: string
    received: number
    returned: number
    difference: number
    receivedPcs: number
    returnedPcs: number
    differencePcs: number
  }> {
    const received: { [type: string]: number } = {}
    const returned: { [type: string]: number } = {}
    const receivedPcs: { [type: string]: number } = {}
    const returnedPcs: { [type: string]: number } = {}

    // Aggregate original received stones by type
    this.originalReceivedStones.forEach((stone) => {
      const type = stone.type || "Unknown"
      const grams = Number(stone.weightGrams) || 0
      const pcs = Number(stone.pieces) || 0
      received[type] = (received[type] || 0) + grams
      receivedPcs[type] = (receivedPcs[type] || 0) + pcs
    })

    // Aggregate received stones added in setting stage by type
    this.receivedStones.controls.forEach((stone) => {
      const type = stone.get("type")?.value || "Unknown"
      const grams = Number(stone.get("weightGrams")?.value) || 0
      const pcs = Number(stone.get("pieces")?.value) || 0
      received[type] = (received[type] || 0) + grams
      receivedPcs[type] = (receivedPcs[type] || 0) + pcs
    })

    // Aggregate returned stones by type
    this.returnedStones.controls.forEach((stone) => {
      const type = stone.get("type")?.value || "Unknown"
      const grams = Number(stone.get("weightGrams")?.value) || 0
      const pcs = Number(stone.get("pieces")?.value) || 0
      returned[type] = (returned[type] || 0) + grams
      returnedPcs[type] = (returnedPcs[type] || 0) + pcs
    })

    // Collect all unique types
    const allTypes = Array.from(new Set([...Object.keys(received), ...Object.keys(returned)]))

    // Build summary array
    return allTypes.map((type) => ({
      type,
      received: Number(received[type] || 0),
      returned: Number(returned[type] || 0),
      difference: Number(((received[type] || 0) - (returned[type] || 0)).toFixed(3)),
      receivedPcs: Number(receivedPcs[type] || 0),
      returnedPcs: Number(returnedPcs[type] || 0),
      differencePcs: Number((receivedPcs[type] || 0) - (returnedPcs[type] || 0)),
    }))
  }

  downloadDispatchSummary(order: any) {
    const doc = new jsPDF()

    doc.text("Dispatch Order Summary", 14, 16)

    autoTable(doc, {
      startY: 24,
      head: [["Field", "Value"]],
      body: [
        ["Item Details", order.itemDetails || ""],
        ["PO Number", order.poNumber || ""],
        ["Approximate Weight", order.approxWeight || ""],
      ],
    })

    // Stones Table
    if (order.stones && order.stones.length > 0) {
      // Get the last Y position from the previous table
      const lastY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : 40
      doc.text("Stones Information", 14, lastY)
      autoTable(doc, {
        startY: lastY + 5,
        head: [["Type", "Pieces", "Weight (g)", "Weight (ct)"]],
        body: order.stones.map((stone: any) => [stone.type, stone.pieces, stone.weightGrams, stone.weightCarats]),
      })
    }

    doc.save(`Dispatch_Summary_${order.workOrderNumber}.pdf`)
  }
}
