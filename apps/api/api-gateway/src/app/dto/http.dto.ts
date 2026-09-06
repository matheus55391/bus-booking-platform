import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, PspWebhookStatus } from '@repo/common';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const DATE_YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;
const DIGITS_ONLY = /^\d+$/;
/** Hold = UUID; Trip/Seat/Payment = cuid — aceita os dois. */
const ENTITY_ID =
  /^(c[a-z0-9]{20,}|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export class SearchTripsQueryDto {
  @ApiProperty({ example: 'São Paulo' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  origin!: string;

  @ApiProperty({ example: 'Rio de Janeiro' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  destination!: string;

  @ApiProperty({ example: '2026-09-10', description: 'YYYY-MM-DD' })
  @IsString()
  @Matches(DATE_YYYY_MM_DD, { message: 'date must be YYYY-MM-DD' })
  date!: string;
}

export class CreateReservationDto {
  @ApiProperty()
  @IsString()
  @Matches(ENTITY_ID, { message: 'tripId must be a cuid or uuid' })
  tripId!: string;

  @ApiProperty()
  @IsString()
  @Matches(ENTITY_ID, { message: 'seatId must be a cuid or uuid' })
  seatId!: string;

  @ApiPropertyOptional({ default: 'guest' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  userId?: string;
}

export class PassengerDto {
  @ApiProperty({ example: 'Maria Silva' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'maria@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '52998224725', description: 'CPF 11 dígitos' })
  @IsString()
  @Matches(/^\d{11}$/, {
    message: 'document must be a CPF (11 digits)',
  })
  document!: string;

  @ApiProperty({ example: '11999998888' })
  @IsString()
  @Matches(/^\d{10,11}$/, {
    message: 'phone must be 10 or 11 digits',
  })
  phone!: string;

  @ApiProperty({ example: '1990-01-15', description: 'YYYY-MM-DD' })
  @IsString()
  @Matches(DATE_YYYY_MM_DD, {
    message: 'birthDate must be YYYY-MM-DD',
  })
  birthDate!: string;
}

export class CreatePaymentDto {
  @ApiProperty()
  @IsString()
  @Matches(ENTITY_ID, { message: 'reservationId must be a cuid or uuid' })
  reservationId!: string;

  @ApiProperty({ example: 8990 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountCents!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  userId?: string;

  @ApiPropertyOptional({
    description: 'Força falha do gateway mock (demo da saga)',
  })
  @IsOptional()
  @IsBoolean()
  forceFail?: boolean;

  @ApiPropertyOptional({
    description:
      'Se true, Payment fica PENDING até POST /webhooks/psp (fluxo async)',
  })
  @IsOptional()
  @IsBoolean()
  asyncCharge?: boolean;

  @ApiProperty({ type: PassengerDto })
  @ValidateNested()
  @Type(() => PassengerDto)
  passenger!: PassengerDto;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;
}

export class PspWebhookDto {
  @ApiProperty({
    example: 'psp_evt_01HXYZ',
    description: 'ID único do evento no provedor (dedupe)',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  providerEventId!: string;

  @ApiPropertyOptional({ example: 'mock', default: 'mock' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  provider?: string;

  @ApiProperty()
  @IsString()
  @Matches(ENTITY_ID, { message: 'paymentId must be a cuid or uuid' })
  paymentId!: string;

  @ApiProperty({ enum: PspWebhookStatus })
  @IsEnum(PspWebhookStatus)
  status!: PspWebhookStatus;

  @ApiPropertyOptional({ example: 'txn_abc123' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  transactionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  failureReason?: string;
}

export class LookupOrderQueryDto {
  @ApiProperty({ example: 'ABC-1234' })
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  orderCode!: string;

  @ApiPropertyOptional({ description: 'E-mail do passageiro' })
  @ValidateIf((o: LookupOrderQueryDto) => !o.document)
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'CPF (alternativa ao e-mail)' })
  @ValidateIf((o: LookupOrderQueryDto) => !o.email)
  @IsString()
  @Matches(DIGITS_ONLY, { message: 'document must contain digits only' })
  @Length(11, 11, { message: 'document must be a CPF (11 digits)' })
  document?: string;
}
