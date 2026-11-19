import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Response } from 'express';
import type { Redis } from 'ioredis';
import { DataSource } from 'typeorm';
import { Public } from '../common/decorators.js';
import { REDIS_CONNECTION } from '../queue/redis.module.js';
import { FileStorage } from '../storage/file-storage.js';

const CHECK_TIMEOUT_MS = 3_000;

type CheckStatus = 'up' | 'down';

export class ReadinessDto {
  @ApiProperty({ enum: ['ok', 'unavailable'] })
  status: 'ok' | 'unavailable';

  @ApiProperty({
    example: { database: 'up', queue: 'up', storage: 'up' },
    description: 'Each dependency: up or down.',
  })
  checks: Record<'database' | 'queue' | 'storage', CheckStatus>;
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CONNECTION) private readonly redis: Redis,
    private readonly storage: FileStorage,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness: the API process is running' })
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  @ApiOperation({
    summary: 'Readiness: database, queue and file storage are reachable',
  })
  @ApiOkResponse({ type: ReadinessDto })
  @ApiServiceUnavailableResponse({ type: ReadinessDto })
  async ready(
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReadinessDto> {
    const [database, queue, storage] = await Promise.all([
      probe(() => this.dataSource.query('SELECT 1')),
      probe(() => this.redis.ping()),
      probe(() => this.storage.checkHealth()),
    ]);
    const checks = { database, queue, storage };
    const ok = Object.values(checks).every((status) => status === 'up');
    if (!ok) {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return { status: ok ? 'ok' : 'unavailable', checks };
  }
}

async function probe(check: () => Promise<unknown>): Promise<CheckStatus> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('timeout')),
          CHECK_TIMEOUT_MS,
        );
      }),
    ]);
    return 'up';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}
