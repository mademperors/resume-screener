import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { plansConfig, type PlansConfig } from '../config/plans.config.js';
import { Company, CompanyPlan } from './company.entity.js';

export interface CompanyPlanInfo {
  plan: CompanyPlan;
  /** Requests per minute per API key that apply now. */
  apiRateLimitPerMinute: number;
  /** Set when the limit is a custom one rather than the plan's. */
  customRateLimitPerMinute: number | null;
}

@Injectable()
export class CompanyPlansService {
  private readonly planLimits: Record<CompanyPlan, number>;

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    @Inject(plansConfig.KEY) config: PlansConfig,
  ) {
    this.planLimits = {
      [CompanyPlan.Standard]: config.standardRateLimit,
      [CompanyPlan.Extended]: config.extendedRateLimit,
    };
  }

  /** The company's requests per minute for each API key. */
  rateLimitFor(
    company: Pick<Company, 'plan' | 'customRateLimitPerMinute'>,
  ): number {
    return company.customRateLimitPerMinute ?? this.planLimits[company.plan];
  }

  describe(company: Company): CompanyPlanInfo {
    return {
      plan: company.plan,
      apiRateLimitPerMinute: this.rateLimitFor(company),
      customRateLimitPerMinute: company.customRateLimitPerMinute,
    };
  }

  /** Limits of each plan, for showing what an upgrade gives. */
  plans(): { plan: CompanyPlan; apiRateLimitPerMinute: number }[] {
    return Object.values(CompanyPlan).map((plan) => ({
      plan,
      apiRateLimitPerMinute: this.planLimits[plan],
    }));
  }

  search(query: string | undefined, limit: number): Promise<Company[]> {
    const term = query?.trim();
    return this.companies.find({
      where: term
        ? [{ name: ILike(`%${term}%`) }, { googleDomain: ILike(`%${term}%`) }]
        : {},
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Changes the plan. `customRateLimitPerMinute`: a number sets a custom
   * limit, null removes it, undefined keeps the current one.
   */
  async setPlan(
    companyId: string,
    plan: CompanyPlan,
    customRateLimitPerMinute: number | null | undefined,
  ): Promise<Company | null> {
    const company = await this.companies.findOneBy({ id: companyId });
    if (!company) {
      return null;
    }
    company.plan = plan;
    if (customRateLimitPerMinute !== undefined) {
      company.customRateLimitPerMinute = customRateLimitPerMinute;
    }
    return this.companies.save(company);
  }
}
