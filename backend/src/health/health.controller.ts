import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators.js';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness check' })
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
