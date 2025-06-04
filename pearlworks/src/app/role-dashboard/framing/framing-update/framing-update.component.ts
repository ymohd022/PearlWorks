import { Component, Inject, OnInit } from "@angular/core"
import { FormBuilder, FormGroup, Validators } from "@angular/forms"
import { MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog"
import  { AssignedWorkOrder, StageUpdateRequest } from "../../../auth/interfaces/role-dashboard.interface"

@Component({
  selector: 'app-framing-update',
  standalone: false,
  templateUrl: './framing-update.component.html',
  styleUrl: './framing-update.component.css'
})
export class FramingUpdateComponent implements OnInit {
  updateForm: FormGroup

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<FramingUpdateComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { order: AssignedWorkOrder }
  ) {
    this.updateForm = this.fb.group({
      status: [data.order.status, Validators.required],
      jamahWeight: [data.order.jamahWeight || ""],
      sortingIssue: [data.order.sortingIssue || ""],
      sortingJamah: [data.order.sortingJamah || ""],
      approved: [data.order.approved || false],
      notes: [data.order.notes || ""],
    })
  }

  ngOnInit(): void {
    // Add conditional validators
    this.updateForm.get("status")?.valueChanges.subscribe((status) => {
      const jamahWeightControl = this.updateForm.get("jamahWeight")
      if (status === "completed") {
        jamahWeightControl?.setValidators([Validators.required, Validators.min(0.01)])
      } else {
        jamahWeightControl?.clearValidators()
      }
      jamahWeightControl?.updateValueAndValidity()
    })
  }

  onCancel(): void {
    this.dialogRef.close()
  }

  onSave(): void {
    if (this.updateForm.valid) {
      const formValue = this.updateForm.value
      const updateRequest: StageUpdateRequest = {
        stage: "framing",
        status: formValue.status,
        updatedBy: "Current User", // This should come from auth service
        jamahWeight: formValue.jamahWeight ? Number.parseFloat(formValue.jamahWeight) : undefined,
        sortingIssue: formValue.sortingIssue ? Number.parseInt(formValue.sortingIssue) : undefined,
        sortingJamah: formValue.sortingJamah ? Number.parseInt(formValue.sortingJamah) : undefined,
        approved: formValue.approved,
        notes: formValue.notes || undefined,
        completedDate: formValue.status === "completed" ? new Date() : undefined,
      }

      this.dialogRef.close(updateRequest)
    }
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