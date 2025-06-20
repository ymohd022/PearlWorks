import { Component,  OnInit,  OnDestroy } from "@angular/core"
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from "rxjs"
import {  FormBuilder,  FormGroup, Validators } from "@angular/forms"
import  { UserManagementService } from "../../../services/user-management.service"
import  {
  User,
  CreateUserRequest,
  UpdateUserRequest,
  UserFilters,
  UserRole,
} from "../../../user-management.interface"

@Component({
  selector: 'app-user-management',
  standalone: false,
  templateUrl: './user-management.component.html',
  styleUrl: './user-management.component.css'
})
export class UserManagementComponent implements OnInit, OnDestroy {
  users: User[] = []
  filteredUsers: User[] = []
  loading = false
  showCreateModal = false
  showEditModal = false
  showDeleteModal = false
  selectedUser: User | null = null

  filterForm: FormGroup
  createForm: FormGroup
  editForm: FormGroup

  roles: UserRole[] = ["admin", "manager", "framing", "setting", "polish", "repair", "dispatch"]

  private destroy$ = new Subject<void>()

  constructor(
    private userManagementService: UserManagementService,
    private fb: FormBuilder,
  ) {
    this.filterForm = this.fb.group({
      role: [""],
      isActive: [""],
      search: [""],
    })

    this.createForm = this.fb.group({
      email: ["", [Validators.required, Validators.email]],
      password: ["", [Validators.required, Validators.minLength(6)]],
      name: ["", [Validators.required, Validators.minLength(2)]],
      role: ["", Validators.required],
    })

    this.editForm = this.fb.group({
      email: ["", [Validators.required, Validators.email]],
      name: ["", [Validators.required, Validators.minLength(2)]],
      role: ["", Validators.required],
      isActive: [true],
      password: [""],
    })
  }

  ngOnInit(): void {
    this.loadUsers()
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

  loadUsers(): void {
    this.loading = true
    this.userManagementService
      .getUsers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (users) => {
          this.users = users
          this.filteredUsers = users
          this.loading = false
        },
        error: (error) => {
          console.error("Error loading users:", error)
          this.loading = false
        },
      })
  }

  applyFilters(): void {
    const filters: UserFilters = this.filterForm.value

    // Remove empty values
    Object.keys(filters).forEach((key) => {
      if (!filters[key as keyof UserFilters]) {
        delete filters[key as keyof UserFilters]
      }
    })

    this.loading = true
    this.userManagementService
      .getUsers(filters)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (users) => {
          this.filteredUsers = users
          this.loading = false
        },
        error: (error) => {
          console.error("Error filtering users:", error)
          this.loading = false
        },
      })
  }

  clearFilters(): void {
    this.filterForm.reset()
    this.filteredUsers = this.users
  }

  openCreateModal(): void {
    this.createForm.reset()
    this.showCreateModal = true
  }

  closeCreateModal(): void {
    this.showCreateModal = false
    this.createForm.reset()
  }

  openEditModal(user: User): void {
    this.selectedUser = user
    this.editForm.patchValue({
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      password: "",
    })
    this.showEditModal = true
  }

  closeEditModal(): void {
    this.showEditModal = false
    this.selectedUser = null
    this.editForm.reset()
  }

  openDeleteModal(user: User): void {
    this.selectedUser = user
    this.showDeleteModal = true
  }

  closeDeleteModal(): void {
    this.showDeleteModal = false
    this.selectedUser = null
  }

  createUser(): void {
    if (this.createForm.valid) {
      const userData: CreateUserRequest = this.createForm.value
      this.userManagementService
        .createUser(userData)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.loadUsers()
            this.closeCreateModal()
          },
          error: (error) => {
            console.error("Error creating user:", error)
          },
        })
    }
  }

  updateUser(): void {
    if (this.editForm.valid && this.selectedUser) {
      const userData: UpdateUserRequest = this.editForm.value

      // Remove password if empty
      if (!userData.password) {
        delete userData.password
      }

      this.userManagementService
        .updateUser(this.selectedUser.id, userData)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.loadUsers()
            this.closeEditModal()
          },
          error: (error) => {
            console.error("Error updating user:", error)
          },
        })
    }
  }

  deleteUser(): void {
    if (this.selectedUser) {
      this.userManagementService
        .deleteUser(this.selectedUser.id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.loadUsers()
            this.closeDeleteModal()
          },
          error: (error) => {
            console.error("Error deleting user:", error)
          },
        })
    }
  }

  getRoleBadgeClass(role: UserRole): string {
    const roleClasses = {
      admin: "bg-danger",
      manager: "bg-warning text-dark",
      framing: "bg-primary",
      setting: "bg-info",
      polish: "bg-success",
      repair: "bg-secondary",
      dispatch: "bg-dark",
    }
    return roleClasses[role] || "bg-secondary"
  }

  formatDate(date: Date | string): string {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }
}

