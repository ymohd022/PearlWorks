import { Component,  OnInit, Inject } from "@angular/core"
import {  FormBuilder, FormGroup, FormArray, Validators } from "@angular/forms"
import  { MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog"
import  { MatSnackBar } from "@angular/material/snack-bar"
import { SettingWorkOrder, SettingUpdateRequest, ReturnedStone } from "../../../auth/interfaces/setting.interface"
import { RoleDashboardService } from "../../../auth/interfaces/services/role-dashboard.service"

@Component({
  selector: 'app-setting-update-dialog',
  standalone: false,
  templateUrl: './setting-update-dialog.component.html',
  styleUrl: './setting-update-dialog.component.css'
})
export class SettingUpdateDialogComponent implements OnInit {
  updateForm: FormGroup
  updating = false
  order: SettingWorkOrder
  currentUser: any

  constructor(
    private fb: FormBuilder,
    private roleDashboardService: RoleDashboardService,
    private snackBar: MatSnackBar,
    public dialogRef: MatDialogRef<SettingUpdateDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { order: SettingWorkOrder; currentUser: any },
  ) {
    this.order = data.order
    this.currentUser = data.currentUser

    this.updateForm = this.fb.group({
      status: [this.order.status, Validators.required],
      jamahWeight: [this.order.jamahWeight || "", [Validators.min(0.01)]],
      sortingIssue: [this.order.sortingIssue || ""],
      sortingJamah: [this.order.sortingJamah || ""],
      approved: [this.order.approved || false],
      notes: [this.order.notes || ""],
      returnedStones: this.fb.array([]),
    })
  }

  ngOnInit(): void {
    this.initializeReturnedStones()
  }

  get returnedStonesArray(): FormArray {
    return this.updateForm.get("returnedStones") as FormArray
  }

  initializeReturnedStones(): void {
    // Add existing returned stones
    if (this.order.returnedStones && this.order.returnedStones.length > 0) {
      this.order.returnedStones.forEach((stone) => {
        this.returnedStonesArray.push(this.createReturnedStoneGroup(stone))
      })
    } else {
      // Add one empty stone form
      this.addReturnedStone()
    }
  }

createReturnedStoneGroup(stone?: ReturnedStone): FormGroup {
  return this.fb.group({
    type: [stone?.type || "", Validators.required],
    pieces: [stone?.pieces || "", [Validators.required, Validators.min(1)]],
    weightGrams: [stone?.weightGrams || "", [Validators.required, Validators.min(0.01)]],
    weightCarats: [stone?.weightCarats || "", [Validators.required, Validators.min(0.01)]],
  });
}

  addReturnedStone(): void {
    this.returnedStonesArray.push(this.createReturnedStoneGroup())
  }

  removeReturnedStone(index: number): void {
    this.returnedStonesArray.removeAt(index)
  }

  onSubmit(): void {
    if (this.updateForm.invalid || !this.currentUser) {
      this.markFormGroupTouched(this.updateForm)
      return
    }

    this.updating = true
    const formValue = this.updateForm.value

    // Filter out empty returned stones
   const returnedStones = formValue.returnedStones
    .filter((stone: any) => stone.type && stone.pieces && stone.weightGrams && stone.weightCarats)
    .map((stone: any) => ({
      type: stone.type,
      pieces: Number.parseInt(stone.pieces),
      weightGrams: Number.parseFloat(stone.weightGrams),
      weightCarats: Number.parseFloat(stone.weightCarats),
    }));

    const updateRequest: SettingUpdateRequest = {
      stage: "setting",
      status: formValue.status,
      updatedBy: this.currentUser.name,
      notes: formValue.notes || undefined,
      jamahWeight: formValue.jamahWeight ? Number.parseFloat(formValue.jamahWeight) : undefined,
      sortingIssue: formValue.sortingIssue ? Number.parseInt(formValue.sortingIssue) : undefined,
      sortingJamah: formValue.sortingJamah ? Number.parseInt(formValue.sortingJamah) : undefined,
      approved: formValue.approved,
      completedDate: formValue.status === "completed" ? new Date() : undefined,
      returnedStones: returnedStones.length > 0 ? returnedStones : undefined,
    }

    this.roleDashboardService.updateStageStatus(this.order.id, updateRequest).subscribe({
      next: (response) => {
        if (response.success) {
          this.snackBar.open(response.message, "Close", {
            duration: 3000,
            panelClass: "success-snackbar",
          })
          this.dialogRef.close({ updated: true })
        } else {
          this.snackBar.open(response.message, "Close", {
            duration: 5000,
            panelClass: "error-snackbar",
          })
        }
        this.updating = false
      },
      error: (error) => {
        console.error("Error updating work order:", error)
        this.snackBar.open("Failed to update work order. Please try again.", "Close", {
          duration: 5000,
          panelClass: "error-snackbar",
        })
        this.updating = false
      },
    })
  }

  onCancel(): void {
    this.dialogRef.close()
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach((key) => {
      const control = formGroup.get(key)
      control?.markAsTouched()

      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control)
      } else if (control instanceof FormArray) {
        control.controls.forEach((arrayControl) => {
          if (arrayControl instanceof FormGroup) {
            this.markFormGroupTouched(arrayControl)
          }
        })
      }
    })
  }

  formatDate(date: Date | undefined): string {
    if (!date) return "N/A"
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }
}
