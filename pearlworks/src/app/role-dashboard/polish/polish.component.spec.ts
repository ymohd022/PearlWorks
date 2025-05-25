import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PolishComponent } from './polish.component';

describe('PolishComponent', () => {
  let component: PolishComponent;
  let fixture: ComponentFixture<PolishComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PolishComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PolishComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
