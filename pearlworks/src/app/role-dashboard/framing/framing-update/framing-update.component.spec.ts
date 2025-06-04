import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FramingUpdateComponent } from './framing-update.component';

describe('FramingUpdateComponent', () => {
  let component: FramingUpdateComponent;
  let fixture: ComponentFixture<FramingUpdateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [FramingUpdateComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FramingUpdateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
