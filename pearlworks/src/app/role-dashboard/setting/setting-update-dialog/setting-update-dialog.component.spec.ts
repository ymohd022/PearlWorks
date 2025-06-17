import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SettingUpdateDialogComponent } from './setting-update-dialog.component';

describe('SettingUpdateDialogComponent', () => {
  let component: SettingUpdateDialogComponent;
  let fixture: ComponentFixture<SettingUpdateDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [SettingUpdateDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SettingUpdateDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
