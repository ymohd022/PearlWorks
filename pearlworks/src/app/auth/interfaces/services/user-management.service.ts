import { Injectable } from "@angular/core"
import  { Observable } from "rxjs"
import { map } from "rxjs/operators"
import { ApiService } from "./api.service"
import  {
  User,
  CreateUserRequest,
  UpdateUserRequest,
  UserFilters,
  UserStatistics,
} from "../user-management.interface"

@Injectable({
  providedIn: "root",
})
export class UserManagementService {
  constructor(private apiService: ApiService) {}

  getUsers(filters?: UserFilters): Observable<User[]> {
    return this.apiService.getUsers(filters).pipe(map((response) => response.data))
  }

  createUser(user: CreateUserRequest): Observable<User> {
    return this.apiService.createUser(user).pipe(map((response) => response.data))
  }

  updateUser(userId: string, user: UpdateUserRequest): Observable<User> {
    return this.apiService.updateUser(userId, user).pipe(map((response) => response.data))
  }

  deleteUser(userId: string): Observable<void> {
    return this.apiService.deleteUser(userId).pipe(map(() => undefined))
  }

  getUserStatistics(): Observable<UserStatistics> {
    return this.apiService.getUserStatistics().pipe(map((response) => response.data))
  }
}
