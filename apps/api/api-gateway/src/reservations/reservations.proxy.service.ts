import {
  BadGatewayException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

@Injectable()
export class ReservationsProxyService {
  private readonly logger = new Logger(ReservationsProxyService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  private bookingServiceUrl() {
    return this.config.get<string>(
      'BOOKING_SERVICE_URL',
      'http://localhost:3003',
    );
  }

  private rethrow(error: unknown, action: string): never {
    const axiosError = error as AxiosError;
    this.logger.error(
      `booking-service ${action} failed: ${axiosError.message}`,
      axiosError.stack,
    );

    if (axiosError.response) {
      const status = axiosError.response.status;
      throw new HttpException(axiosError.response.data as object, status);
    }

    throw new BadGatewayException('booking-service unavailable');
  }

  async create(
    body: { tripId: string; seatId: string; userId?: string },
    idempotencyKey?: string,
  ) {
    try {
      const response = await firstValueFrom(
        this.http.post(`${this.bookingServiceUrl()}/reservations`, body, {
          headers: idempotencyKey
            ? { 'Idempotency-Key': idempotencyKey }
            : undefined,
        }),
      );
      return response.data;
    } catch (error) {
      this.rethrow(error, 'create reservation');
    }
  }

  async findById(id: string) {
    try {
      const response = await firstValueFrom(
        this.http.get(`${this.bookingServiceUrl()}/reservations/${id}`),
      );
      return response.data;
    } catch (error) {
      this.rethrow(error, 'get reservation');
    }
  }
}
