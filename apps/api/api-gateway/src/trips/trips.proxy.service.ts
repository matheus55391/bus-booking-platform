import {
  BadGatewayException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

@Injectable()
export class TripsProxyService {
  private readonly logger = new Logger(TripsProxyService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  private tripServiceUrl() {
    return this.config.get<string>(
      'TRIP_SERVICE_URL',
      'http://localhost:3002',
    );
  }

  private async forwardGet(path: string, params?: Record<string, string | undefined>) {
    try {
      const response = await firstValueFrom(
        this.http.get(`${this.tripServiceUrl()}${path}`, { params }),
      );
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      this.logger.error(
        `trip-service GET ${path} failed: ${axiosError.message}`,
        axiosError.stack,
      );

      if (axiosError.response) {
        throw new BadGatewayException(axiosError.response.data);
      }

      throw new BadGatewayException('trip-service unavailable');
    }
  }

  search(params: {
    origin?: string;
    destination?: string;
    date?: string;
  }) {
    return this.forwardGet('/trips/search', params);
  }

  getSeats(tripId: string) {
    return this.forwardGet(`/trips/${tripId}/seats`);
  }
}
