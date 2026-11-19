import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/api-errors.decorator.js';
import { Public } from '../common/decorators.js';
import { CompanyPlansService } from '../companies/company-plans.service.js';
import { AdminTokenGuard } from './admin-token.guard.js';
import {
  AdminCompanyDto,
  PlanLimitDto,
  SearchCompaniesQueryDto,
  SetPlanDto,
} from './dto/admin.dto.js';

/**
 * For the platform operator, not for companies: changing plans (NFR 4.5)
 * until there is billing. Authenticated with X-Admin-Token instead of a
 * user session or API key.
 */
@ApiTags('Admin')
@ApiSecurity('admin-token')
@ApiUnauthorizedResponse({
  type: ErrorResponseDto,
  description: 'Missing or wrong X-Admin-Token.',
})
@ApiForbiddenResponse({
  type: ErrorResponseDto,
  description: 'ADMIN_API_TOKEN is not set.',
})
@Public()
@UseGuards(AdminTokenGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly plans: CompanyPlansService) {}

  @Get('plans')
  @ApiOperation({ summary: 'Plans and their API rate limits' })
  @ApiOkResponse({ type: [PlanLimitDto] })
  listPlans(): PlanLimitDto[] {
    return this.plans.plans();
  }

  @Get('companies')
  @ApiOperation({ summary: 'Find companies by name or Google domain' })
  @ApiOkResponse({ type: [AdminCompanyDto] })
  async companies(
    @Query() query: SearchCompaniesQueryDto,
  ): Promise<AdminCompanyDto[]> {
    const companies = await this.plans.search(query.search, query.limit);
    return companies.map((company) =>
      AdminCompanyDto.from(company, this.plans.describe(company)),
    );
  }

  @Patch('companies/:companyId/plan')
  @ApiOperation({
    summary: "Change a company's plan and, optionally, set a custom rate limit",
    description: 'Takes effect on the next API request.',
  })
  @ApiOkResponse({ type: AdminCompanyDto })
  async setPlan(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: SetPlanDto,
  ): Promise<AdminCompanyDto> {
    const company = await this.plans.setPlan(
      companyId,
      dto.plan,
      dto.customRateLimitPerMinute,
    );
    if (!company) {
      throw new NotFoundException('Company not found.');
    }
    return AdminCompanyDto.from(company, this.plans.describe(company));
  }
}
