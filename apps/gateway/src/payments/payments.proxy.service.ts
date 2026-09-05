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
export class PaymentsProxyService {
  private readonly logger = new Logger(PaymentsProxyService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  private baseUrl() {
    return this.config.get<string>(
      'PAYMENT_SERVICE_URL',
      'http://localhost:3004',
    );
  }

  private rethrow(error: unknown, action: string): never {
    const axiosError = error as AxiosError;
    this.logger.error(`payment-service ${action}: ${axiosError.message}`);
    if (axiosError.response) {
      throw new HttpException(
        axiosError.response.data as object,
        axiosError.response.status,
      );
    }
    throw new BadGatewayException('payment-service unavailable');
  }

  async create(
    body: {
      reservationId: string;
      amountCents: number;
      userId?: string;
      forceFail?: boolean;
    },
    idempotencyKey?: string,
  ) {
    try {
      const response = await firstValueFrom(
        this.http.post(`${this.baseUrl()}/payments`, body, {
          headers: idempotencyKey
            ? { 'Idempotency-Key': idempotencyKey }
            : undefined,
        }),
      );
      return response.data;
    } catch (error) {
      this.rethrow(error, 'create');
    }
  }

  async findById(id: string) {
    try {
      const response = await firstValueFrom(
        this.http.get(`${this.baseUrl()}/payments/${id}`),
      );
      return response.data;
    } catch (error) {
      this.rethrow(error, 'get');
    }
  }
}
