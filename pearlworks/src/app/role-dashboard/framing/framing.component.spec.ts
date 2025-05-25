import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FramingComponent } from './framing.component';

describe('FramingComponent', () => {
  let component: FramingComponent;
  let fixture: ComponentFixture<FramingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [FramingComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FramingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
