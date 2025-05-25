import { TestBed } from '@angular/core/testing';

import { RoleDashboardService } from './role-dashboard.service';

describe('RoleDashboardService', () => {
  let service: RoleDashboardService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RoleDashboardService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
