import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StonesDialogComponent } from './stones-dialog.component';

describe('StonesDialogComponent', () => {
  let component: StonesDialogComponent;
  let fixture: ComponentFixture<StonesDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [StonesDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StonesDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
