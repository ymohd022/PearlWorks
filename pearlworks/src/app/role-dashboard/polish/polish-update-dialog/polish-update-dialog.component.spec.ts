import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PolishUpdateDialogComponent } from './polish-update-dialog.component';

describe('PolishUpdateDialogComponent', () => {
  let component: PolishUpdateDialogComponent;
  let fixture: ComponentFixture<PolishUpdateDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PolishUpdateDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PolishUpdateDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
