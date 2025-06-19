import { Component,  OnInit, Inject } from "@angular/core"
import {  FormBuilder, type FormGroup, type FormArray, Validators } from "@angular/forms"
import  { MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog"
import { MatSnackBar } from "@angular/material/snack-bar"
import { RoleDashboardService } from "../../../auth/interfaces/services/role-dashboard.service"
import { Stone, StonesData } from "../../../auth/interfaces/polish.interface"
@Component({
  selector: 'app-stones-dialog',
  standalone: false,
  templateUrl: './stones-dialog.component.html',
  styleUrl: './stones-dialog.component.css'
})
export class StonesDialogComponent implements OnInit {
  stonesData: StonesData | null = null
  returnStonesForm: FormGroup
  loading = false
  submitting = false

  displayedColumnsReceived = ["type", "pieces", "weightGrams", "weightCarats"]
  displayedColumnsReturned = ["type", "pieces", "weightGrams", "weightCarats", "returnedDate"]

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<StonesDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { workOrderId: string; workOrderNumber: string },
    private roleDashboardService: RoleDashboardService,
    private snackBar: MatSnackBar,
  ) {
    this.returnStonesForm = this.fb.group({
      stones: this.fb.array([]),
    })
  }

  ngOnInit(): void {
    this.loadStonesData()
  }

  get stonesFormArray(): FormArray {
    return this.returnStonesForm.get("stones") as FormArray
  }

  loadStonesData(): void {
    this.loading = true
    this.roleDashboardService.getStones(this.data.workOrderId).subscribe({
      next: (response) => {
        this.stonesData = response.data
        this.loading = false
      },
      error: (error) => {
        console.error("Error loading stones data:", error)
        this.snackBar.open("Failed to load stones data", "Close", {
          duration: 3000,
          panelClass: "error-snackbar",
        })
        this.loading = false
      },
    })
  }

  addStoneToReturn(): void {
    const stoneGroup = this.fb.group({
      type: ["", Validators.required],
      pieces: [1, [Validators.required, Validators.min(1)]],
      weightGrams: [0, [Validators.required, Validators.min(0.01)]],
      weightCarats: [0, [Validators.required, Validators.min(0.01)]],
    })

    this.stonesFormArray.push(stoneGroup)
  }

  removeStoneFromReturn(index: number): void {
    this.stonesFormArray.removeAt(index)
  }

  onSubmitReturnStones(): void {
    if (this.returnStonesForm.invalid) {
      this.markFormGroupTouched()
      return
    }

    this.submitting = true
    const stones = this.returnStonesForm.value.stones

    this.roleDashboardService.returnStones(this.data.workOrderId, stones).subscribe({
      next: (response) => {
        if (response.success) {
          this.snackBar.open(response.message, "Close", {
            duration: 3000,
            panelClass: "success-snackbar",
          })
          this.loadStonesData() // Refresh data
          this.returnStonesForm.reset()
          this.stonesFormArray.clear()
        } else {
          this.snackBar.open(response.message, "Close", {
            duration: 5000,
            panelClass: "error-snackbar",
          })
        }
        this.submitting = false
      },
      error: (error) => {
        console.error("Error returning stones:", error)
        this.snackBar.open("Failed to return stones. Please try again.", "Close", {
          duration: 5000,
          panelClass: "error-snackbar",
        })
        this.submitting = false
      },
    })
  }

  calculateTotalWeight(stones: Stone[], type: "grams" | "carats"): number {
    return stones.reduce((total, stone) => {
      return total + (type === "grams" ? stone.weightGrams : stone.weightCarats)
    }, 0)
  }

  calculateTotalPieces(stones: Stone[]): number {
    return stones.reduce((total, stone) => total + stone.pieces, 0)
  }

  onClose(): void {
    this.dialogRef.close(false)
  }

  private markFormGroupTouched(): void {
    this.stonesFormArray.controls.forEach((group) => {
      const formGroup = group as FormGroup;
      Object.keys(formGroup.controls).forEach((key) => {
        formGroup.get(key)?.markAsTouched()
      })
    })
  }
}