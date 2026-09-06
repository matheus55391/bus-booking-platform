import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { getMetricsRegistry } from '@repo/observability';
import { HealthService } from '../services/health.service';

@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('health')
  check() {
    return this.health.check();
  }

  @Get('metrics')
  async metrics(@Res() res: Response) {
    const registry = getMetricsRegistry();
    res.set('Content-Type', registry.contentType);
    res.send(await registry.metrics());
  }
}
