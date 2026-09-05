import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';

export function requireIdempotencyKey(value?: string): string {
  const key = value?.trim();
  if (!key) {
    throw new BadRequestException('Idempotency-Key header is required');
  }
  return key;
}

/** Pipe pronto para uso em params/body quando o decorator aceitar. */
@Injectable()
export class IdempotencyKeyPipe implements PipeTransform<string | undefined> {
  transform(value: string | undefined, _metadata: ArgumentMetadata) {
    return requireIdempotencyKey(value);
  }
}
