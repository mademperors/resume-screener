import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { CompanyPlansService } from '@src/companies/company-plans.service.js';
import { CompanyPlan, type Company } from '@src/companies/company.entity.js';
import { AdminTokenGuard } from '@src/admin/admin-token.guard.js';

const TOKEN = 'a'.repeat(40);

function configWith(values: Record<string, unknown>) {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

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
    const guard = new AdminTokenGuard(configWith({}) as never);
    expect(() => guard.canActivate(contextWithToken(TOKEN))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects a missing or wrong token', () => {
    const guard = new AdminTokenGuard(
      configWith({ ADMIN_API_TOKEN: TOKEN }) as never,
    );
    expect(() => guard.canActivate(contextWithToken())).toThrow(
      UnauthorizedException,
    );
    expect(() => guard.canActivate(contextWithToken('b'.repeat(40)))).toThrow(
      UnauthorizedException,
    );
  });

  it('accepts the configured token', () => {
    const guard = new AdminTokenGuard(
      configWith({ ADMIN_API_TOKEN: TOKEN }) as never,
    );
    expect(guard.canActivate(contextWithToken(TOKEN))).toBe(true);
  });
});

describe('CompanyPlansService', () => {
  const plans = new CompanyPlansService(
    {} as Repository<Company>,
    configWith({
      PLAN_STANDARD_RATE_LIMIT: 200,
      PLAN_EXTENDED_RATE_LIMIT: 1000,
    }) as never,
  );

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
