import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { getServiceName, createLogger } from './telemetry';
import { recordHttpRed } from './metrics';

const log = createLogger('http');

@Injectable()
export class ObservabilityInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const started = process.hrtime.bigint();
    const service = getServiceName();
    const method = req.method;
    const route = req.route?.path
      ? `${req.baseUrl || ''}${req.route.path}`
      : req.path;

    return next.handle().pipe(
      tap({
        next: () => {
          this.finish(service, method, route, res.statusCode || 200, started);
        },
        error: (err: { status?: number; statusCode?: number }) => {
          const status = err?.status || err?.statusCode || 500;
          this.finish(service, method, route, status, started);
        },
      }),
    );
  }

  private finish(
    service: string,
    method: string,
    route: string,
    statusCode: number,
    started: bigint,
  ) {
    const durationSeconds = Number(process.hrtime.bigint() - started) / 1e9;
    recordHttpRed({ service, method, route, statusCode, durationSeconds });
    log.info('request completed', {
      method,
      route,
      statusCode,
      durationMs: Math.round(durationSeconds * 1000),
    });
  }
}
