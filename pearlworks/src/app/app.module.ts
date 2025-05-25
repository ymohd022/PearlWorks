import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from "@angular/platform-browser/animations"
import { provideHttpClient } from '@angular/common/http';
import { ReactiveFormsModule } from '@angular/forms';

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
    DispatchComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    ReactiveFormsModule
    
  ],
  providers: [provideHttpClient()],
  bootstrap: [AppComponent]
})
export class AppModule { }
