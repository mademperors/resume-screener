import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, SessionOnly } from '../common/decorators.js';
import type { UserPrincipal } from '../common/principal.js';
import { ApiKeysService } from './api-keys.service.js';
import {
  ApiKeyDto,
  CreateApiKeyDto,
  CreatedApiKeyDto,
} from './dto/api-key.dto.js';

@ApiTags('API keys')
@ApiBearerAuth()
@SessionOnly()
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  @ApiOperation({ summary: "List the company's API keys" })
  async list(@CurrentUser() user: UserPrincipal): Promise<ApiKeyDto[]> {
    const keys = await this.apiKeys.list(user.companyId);
    return keys.map((key) => ApiKeyDto.from(key));
  }

  @Post()
  @ApiOperation({
    summary: 'Create an API key (the full key is returned only once)',
  })
  async create(
    @CurrentUser() user: UserPrincipal,
    @Body() dto: CreateApiKeyDto,
  ): Promise<CreatedApiKeyDto> {
    const { apiKey, plaintext } = await this.apiKeys.create(
      user.companyId,
      user.userId,
      dto.name,
    );
    return Object.assign(ApiKeyDto.from(apiKey), { key: plaintext });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke an API key; it stops working immediately' })
  async revoke(
    @CurrentUser() user: UserPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApiKeyDto> {
    return ApiKeyDto.from(await this.apiKeys.revoke(user.companyId, id));
  }
}
