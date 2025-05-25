import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './auth/interfaces/components/login/login.component';
import { AuthGuard } from './auth/interfaces/guards/auth.guard';
import { AdminDashboardComponent } from './auth/interfaces/components/admin-dashboard/admin-dashboard.component';
import { ManagerDashboardComponent } from './auth/interfaces/components/manager-dashboard/manager-dashboard.component';
import { FramingComponent } from './role-dashboard/framing/framing.component';
import { SettingComponent } from './role-dashboard/setting/setting.component';
import { PolishComponent } from './role-dashboard/polish/polish.component';
import { RepairComponent } from './role-dashboard/repair/repair.component';
import { DispatchComponent } from './role-dashboard/dispatch/dispatch.component';

const routes: Routes = [
  { path: "", redirectTo: "/login", pathMatch: "full" },
  { path: "login", component: LoginComponent },

  // Protected routes with role-based access
  {
  path: "admin",
  canActivate: [AuthGuard],
  data: { role: "admin" },
  component: AdminDashboardComponent,
},
  {
  path: "manager",
  canActivate: [AuthGuard],
  data: { role: ["admin", "manager"] },
  component: ManagerDashboardComponent,
},
{
  path: "framing",
  canActivate: [AuthGuard],
  data: { role: ["admin", "manager", "framing"] },
  component: FramingComponent,
},
{
  path: "setting",
  canActivate: [AuthGuard],
  data: { role: ["admin", "manager", "setting"] },
  component: SettingComponent,
},
{
  path: "polish",
  canActivate: [AuthGuard],
  data: { role: ["admin", "manager", "polish"] },
  component: PolishComponent,
},
{
  path: "repair",
  canActivate: [AuthGuard],
  data: { role: ["admin", "manager", "repair"] },
  component: RepairComponent,
},
{
  path: "dispatch",
  canActivate: [AuthGuard],
  data: { role: ["admin", "manager", "dispatch"] },
  component: DispatchComponent,
},

  // Fallback route
  { path: "**", redirectTo: "/login" },
]

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
