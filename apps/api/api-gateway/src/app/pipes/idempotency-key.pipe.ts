import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

export function requireIdempotencyKey(value?: string): string {
  const key = value?.trim();
  if (!key) {
    throw new BadRequestException('Idempotency-Key header is required');
  }
  return key;
}

/** Pipe pronto para uso em params/body quando o decorator aceitar. */
@Injectable()
export class IdempotencyKeyPipe implements PipeTransform<
  string | undefined,
  string
> {
  transform(value: string | undefined): string {
    return requireIdempotencyKey(value);
  }
}
