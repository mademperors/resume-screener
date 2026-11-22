import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AdminTokenGuard } from '@src/admin/admin-token.guard.js';
import type { CompaniesRepository } from '@src/companies/companies.repository.js';
import { CompanyPlansService } from '@src/companies/company-plans.service.js';
import { CompanyPlan } from '@src/companies/company.entity.js';

const TOKEN = 'a'.repeat(40);

function contextWithToken(token?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        header: (name: string) =>
          name === 'x-admin-token' ? token : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('AdminTokenGuard', () => {
  it('is off when no token is configured', () => {
    const guard = new AdminTokenGuard({ token: null });
    expect(() => guard.canActivate(contextWithToken(TOKEN))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects a missing or wrong token', () => {
    const guard = new AdminTokenGuard({ token: TOKEN });
    expect(() => guard.canActivate(contextWithToken())).toThrow(
      UnauthorizedException,
    );
    expect(() => guard.canActivate(contextWithToken('b'.repeat(40)))).toThrow(
      UnauthorizedException,
    );
  });

  it('accepts the configured token', () => {
    const guard = new AdminTokenGuard({ token: TOKEN });
    expect(guard.canActivate(contextWithToken(TOKEN))).toBe(true);
  });
});

describe('CompanyPlansService', () => {
  // Only the pure plan logic; finding and changing companies is covered by
  // test/integration/plans.spec.ts.
  const plans = new CompanyPlansService({} as CompaniesRepository, {
    standardRateLimit: 200,
    extendedRateLimit: 1000,
  });

  it("uses the plan's limit unless the company has a custom one", () => {
    expect(
      plans.rateLimitFor({
        plan: CompanyPlan.Standard,
        customRateLimitPerMinute: null,
      }),
    ).toBe(200);
    expect(
      plans.rateLimitFor({
        plan: CompanyPlan.Extended,
        customRateLimitPerMinute: null,
      }),
    ).toBe(1000);
    expect(
      plans.rateLimitFor({
        plan: CompanyPlan.Standard,
        customRateLimitPerMinute: 50,
      }),
    ).toBe(50);
  });

  it('lists every plan with its limit', () => {
    expect(plans.plans()).toEqual([
      { plan: 'standard', apiRateLimitPerMinute: 200 },
      { plan: 'extended', apiRateLimitPerMinute: 1000 },
    ]);
  });
});
