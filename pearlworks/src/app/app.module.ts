import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from "@angular/platform-browser/animations"
import { provideHttpClient } from '@angular/common/http';
import { ReactiveFormsModule } from '@angular/forms';
import {  MAT_DIALOG_DATA } from "@angular/material/dialog";
import { MatChipsModule } from '@angular/material/chips';
import { MatToolbarModule } from "@angular/material/toolbar"
import { MatCardModule } from "@angular/material/card"
import { MatButtonModule } from "@angular/material/button"
import { MatIconModule } from "@angular/material/icon"
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner"
import { MatListModule } from "@angular/material/list"
import { MatDialogModule } from "@angular/material/dialog"
import { MatFormFieldModule } from "@angular/material/form-field"
import { MatInputModule } from "@angular/material/input"
import { MatSelectModule } from "@angular/material/select"
import { MatCheckboxModule } from "@angular/material/checkbox"
import { MatSnackBarModule } from "@angular/material/snack-bar"
import { MatTooltipModule } from "@angular/material/tooltip"
import { MatTableModule } from "@angular/material/table"
import { MatTabsModule } from "@angular/material/tabs"
import { MatExpansionModule } from "@angular/material/expansion"
import { MatSlideToggleModule } from "@angular/material/slide-toggle"
import { FormsModule } from "@angular/forms"
import { MatPaginatorModule } from "@angular/material/paginator"
import { MatSortModule } from "@angular/material/sort"
import { MatDatepickerModule } from "@angular/material/datepicker"
import { MatNativeDateModule } from "@angular/material/core"
import { MatAutocompleteModule } from "@angular/material/autocomplete"
import { MatMenuModule } from '@angular/material/menu';
import { CommonModule } from '@angular/common';
import { MatProgressBarModule } from "@angular/material/progress-bar"



import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { LoginComponent } from './auth/interfaces/components/login/login.component';
import { AdminDashboardComponent } from './auth/interfaces/components/admin-dashboard/admin-dashboard.component';
import { ManagerDashboardComponent } from './auth/interfaces/components/manager-dashboard/manager-dashboard.component';
import { FilterPipe } from './shared/pipes/filter.pipe';
import { FramingComponent } from './role-dashboard/framing/framing.component';
import { SettingComponent } from './role-dashboard/setting/setting.component';
import { PolishComponent } from './role-dashboard/polish/polish.component';
import { RepairComponent } from './role-dashboard/repair/repair.component';
import { DispatchComponent } from './role-dashboard/dispatch/dispatch.component';
import { FramingUpdateComponent } from './role-dashboard/framing/framing-update/framing-update.component';
import { SettingUpdateDialogComponent } from './role-dashboard/setting/setting-update-dialog/setting-update-dialog.component';
import { PolishUpdateDialogComponent } from './role-dashboard/polish/polish-update-dialog/polish-update-dialog.component';
import { StonesDialogComponent } from './role-dashboard/polish/stones-dialog/stones-dialog.component';
import { UserManagementComponent } from './auth/interfaces/components/admin-dashboard/user-management/user-management.component';


@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    AdminDashboardComponent,
    ManagerDashboardComponent,
    FilterPipe,
    FramingComponent,
    SettingComponent,
    PolishComponent,
    RepairComponent,
    DispatchComponent,
    FramingUpdateComponent,
    SettingUpdateDialogComponent,
    PolishUpdateDialogComponent,
    StonesDialogComponent,
    UserManagementComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    ReactiveFormsModule,
    MatToolbarModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatListModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatTableModule,
    MatTabsModule,
    MatExpansionModule,
    MatSlideToggleModule,
    FormsModule,
    MatPaginatorModule,
    MatSortModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatAutocompleteModule,
    MatMenuModule,
    CommonModule,
    MatProgressBarModule
  ],
  providers: [provideHttpClient()],
  bootstrap: [AppComponent]
})
export class AppModule { }
