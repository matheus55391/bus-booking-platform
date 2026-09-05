import { Inject, Injectable, RequestTimeoutException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { AppService, type AppServiceName } from '@repo/common';
import { firstValueFrom, TimeoutError, timeout } from 'rxjs';

const RPC_TIMEOUT_MS = 15_000;

@Injectable()
export class RmqClientService {
  constructor(
    @Inject(AppService.Trip) private readonly trip: ClientProxy,
    @Inject(AppService.Booking) private readonly booking: ClientProxy,
    @Inject(AppService.Payment) private readonly payment: ClientProxy,
  ) {}

  private client(service: AppServiceName): ClientProxy {
    switch (service) {
      case AppService.Trip:
        return this.trip;
      case AppService.Booking:
        return this.booking;
      case AppService.Payment:
        return this.payment;
      default: {
        const _exhaustive: never = service;
        throw new Error(`Unknown service: ${_exhaustive}`);
      }
    }
  }

  async send<T>(
    service: AppServiceName,
    pattern: string,
    data: unknown,
  ): Promise<T> {
    try {
      return await firstValueFrom(
        this.client(service)
          .send<T>(pattern, data)
          .pipe(timeout(RPC_TIMEOUT_MS)),
      );
    } catch (error) {
      if (error instanceof TimeoutError) {
        throw new RequestTimeoutException(
          `RPC timeout calling ${service} (${pattern})`,
        );
      }
      throw error;
    }
  }
}
