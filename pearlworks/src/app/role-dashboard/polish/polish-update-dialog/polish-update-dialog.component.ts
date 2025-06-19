import { Component,  OnInit, Inject } from "@angular/core"
import {  FormBuilder,  FormGroup, Validators } from "@angular/forms"
import  { MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog"
import { MatSnackBar } from "@angular/material/snack-bar"
import { RoleDashboardService } from "../../../auth/interfaces/services/role-dashboard.service"
import { AuthService } from "../../../auth/interfaces/services/auth.service"
import { AssignedWorkOrder, StageUpdateRequest } from "../../../auth/interfaces/role-dashboard.interface"
@Component({
  selector: 'app-polish-update-dialog',
  standalone: false,
  templateUrl: './polish-update-dialog.component.html',
  styleUrl: './polish-update-dialog.component.css'
})
export class PolishUpdateDialogComponent implements OnInit {
  updateForm: FormGroup
  loading = false
  currentUser: any

  statusOptions = [
    { value: "not-started", label: "Not Started", icon: "schedule" },
    { value: "in-progress", label: "In Progress", icon: "autorenew" },
    { value: "completed", label: "Completed", icon: "check_circle" },
    { value: "on-hold", label: "On Hold", icon: "pause_circle_filled" },
  ]

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<PolishUpdateDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { order: AssignedWorkOrder },
    private roleDashboardService: RoleDashboardService,
    private authService: AuthService,
    private snackBar: MatSnackBar,
  ) {
    this.currentUser = this.authService.getUserData()
    this.updateForm = this.fb.group({
      status: [data.order.status, Validators.required],
      jamahWeight: [data.order.jamahWeight || "", [Validators.min(0.01)]],
      sortingJamah: [data.order.sortingJamah || ""],
      approved: [data.order.approved || false],
      notes: [data.order.notes || ""],
    })
  }

  ngOnInit(): void {
    // Watch for status changes to show/hide relevant fields
    this.updateForm.get("status")?.valueChanges.subscribe((status) => {
      const jamahWeightControl = this.updateForm.get("jamahWeight")
      const sortingJamahControl = this.updateForm.get("sortingJamah")

      if (status === "completed") {
        jamahWeightControl?.setValidators([Validators.required, Validators.min(0.01)])
        sortingJamahControl?.setValidators([Validators.required, Validators.min(1)])
      } else {
        jamahWeightControl?.setValidators([Validators.min(0.01)])
        sortingJamahControl?.clearValidators()
      }

      jamahWeightControl?.updateValueAndValidity()
      sortingJamahControl?.updateValueAndValidity()
    })
  }

  onSubmit(): void {
    if (this.updateForm.invalid || !this.currentUser) {
      this.markFormGroupTouched()
      return
    }

    this.loading = true
    const formValue = this.updateForm.value

    // Calculate weight difference if jamah weight is provided
    let weightDifference: number | undefined
    if (formValue.jamahWeight && this.data.order.issueWeight) {
      weightDifference = Number.parseFloat(formValue.jamahWeight) - this.data.order.issueWeight
    }

    const updateRequest: StageUpdateRequest = {
      stage: "polish",
      status: formValue.status,
      updatedBy: this.currentUser.name,
      jamahWeight: formValue.jamahWeight ? Number.parseFloat(formValue.jamahWeight) : undefined,
      notes: formValue.notes || undefined,
      completedDate: formValue.status === "completed" ? new Date() : undefined,
    }

    this.roleDashboardService.updateStageStatus(this.data.order.id, updateRequest).subscribe({
      next: (response) => {
        if (response.success) {
          this.snackBar.open(response.message, "Close", {
            duration: 3000,
            panelClass: "success-snackbar",
          })
          this.dialogRef.close(true)
        } else {
          this.snackBar.open(response.message, "Close", {
            duration: 5000,
            panelClass: "error-snackbar",
          })
        }
        this.loading = false
      },
      error: (error) => {
        console.error("Error updating work order:", error)
        this.snackBar.open("Failed to update work order. Please try again.", "Close", {
          duration: 5000,
          panelClass: "error-snackbar",
        })
        this.loading = false
      },
    })
  }

  onCancel(): void {
    this.dialogRef.close(false)
  }

  calculateWeightDifference(): number {
    const jamahWeight = this.updateForm.get("jamahWeight")?.value
    if (jamahWeight && this.data.order.issueWeight) {
      return Number.parseFloat(jamahWeight) - this.data.order.issueWeight
    }
    return 0
  }

  getWeightDifferenceColor(): string {
    const diff = this.calculateWeightDifference()
    if (diff > 0) return "primary"
    if (diff < 0) return "warn"
    return "accent"
  }

  private markFormGroupTouched(): void {
    Object.keys(this.updateForm.controls).forEach((key) => {
      const control = this.updateForm.get(key)
      control?.markAsTouched()
    })
  }
}