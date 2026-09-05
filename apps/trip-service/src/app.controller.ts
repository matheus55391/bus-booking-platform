import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { getMetricsRegistry } from '@repo/observability';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  health() {
    return this.appService.health();
  }

  @Get('metrics')
  async metrics(@Res() res: Response) {
    res.set('Content-Type', getMetricsRegistry().contentType);
    res.send(await getMetricsRegistry().metrics());
  }
}
