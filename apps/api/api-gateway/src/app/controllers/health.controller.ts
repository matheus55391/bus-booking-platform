import { Controller, Get, Res } from '@nestjs/common';
import {
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { getMetricsRegistry } from '@repo/observability';
import { HealthService } from '../services/health.service';

@ApiTags('ops')
@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check do Gateway' })
  @ApiOkResponse({ description: '{ status: ok }' })
  check() {
    return this.health.check();
  }

  @Get('metrics')
  @ApiExcludeEndpoint()
  async metrics(@Res() res: Response) {
    const registry = getMetricsRegistry();
    res.set('Content-Type', registry.contentType);
    res.send(await registry.metrics());
  }
}
