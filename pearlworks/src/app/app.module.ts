import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from "@angular/platform-browser/animations"
import { provideHttpClient } from '@angular/common/http';
import { ReactiveFormsModule } from '@angular/forms';
import {  MAT_DIALOG_DATA } from "@angular/material/dialog";

import { MatToolbarModule } from "@angular/material/toolbar"
import { MatCardModule } from "@angular/material/card"
import { MatButtonModule } from "@angular/material/button"
import { MatIconModule } from "@angular/material/icon"
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner"
import { MatChipsModule } from "@angular/material/chips"
import { MatListModule } from "@angular/material/list"
import { MatDialogModule } from "@angular/material/dialog"
import { MatFormFieldModule } from "@angular/material/form-field"
import { MatInputModule } from "@angular/material/input"
import { MatSelectModule } from "@angular/material/select"
import { MatCheckboxModule } from "@angular/material/checkbox"
import { MatSnackBarModule } from "@angular/material/snack-bar"
import { MatTooltipModule } from "@angular/material/tooltip"
import { MatChipListbox } from '@angular/material/chips';


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
    MatChipListbox,

    
  ],
  providers: [provideHttpClient()],
  bootstrap: [AppComponent]
})
export class AppModule { }
