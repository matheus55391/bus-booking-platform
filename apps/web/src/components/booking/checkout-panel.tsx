'use client';

import type { ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CalendarDays,
  CreditCard,
  Hash,
  Lock,
  Mail,
  Phone,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { formatDateTime, formatMoney } from '@/lib/format';
import {
  digitsOnly,
  formatCardExpiry,
  formatCardNumber,
  formatCep,
  formatCpf,
  formatPhone,
} from '@/lib/masks';
import { passengerSchema, type PassengerFormInput } from '@/schemas';
import {
  PaymentMethod,
  PaymentStatus,
  ReservationStatus,
  type Payment,
  type Reservation,
} from '@/types';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type Props = {
  reservation: Reservation;
  payment: Payment | null;
  remainingLabel: string;
  remainingMs: number;
  paying: boolean;
  onPay: (form: PassengerFormInput) => void;
};

export function CheckoutPanel({
  reservation,
  payment,
  remainingLabel,
  remainingMs,
  paying,
  onPay,
}: Props) {
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardCpf, setCardCpf] = useState('');
  const [cardCep, setCardCep] = useState('');
  const [cardPhone, setCardPhone] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<PassengerFormInput>({
    resolver: zodResolver(passengerSchema),
    defaultValues: {
      name: '',
      birthDate: '',
      document: '',
      email: '',
      emailConfirm: '',
      phone: '',
      paymentMethod: PaymentMethod.Pix,
    },
  });

  const paymentMethod = watch('paymentMethod');
  const holdActive =
    (reservation.status === ReservationStatus.Reserved ||
      reservation.status === ReservationStatus.PendingPayment) &&
    remainingMs > 0;
  const confirmed = reservation.status === ReservationStatus.Confirmed;

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-secondary/50 px-4 py-3">
        <div>
          <p className="text-sm font-semibold">
            Assento {reservation.seatLabel}
          </p>
          <p className="text-sm text-muted-foreground">
            {formatMoney(reservation.amountCents)} · finalize antes do fim do
            tempo
          </p>
        </div>
        {(reservation.status === ReservationStatus.Reserved ||
          reservation.status === ReservationStatus.PendingPayment) && (
          <p className="font-mono text-lg font-bold tabular-nums text-foreground">
            {remainingLabel}
          </p>
        )}
      </div>

      {confirmed ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-5">
          <h2 className="font-[family-name:var(--font-heading)] text-xl font-bold">
            Passagem confirmada
          </h2>
          <p className="text-sm text-foreground">
            Enviamos o ticket para{' '}
            <strong>{reservation.passenger?.email}</strong>.
          </p>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase text-muted-foreground">
                Código do pedido
              </dt>
              <dd className="mt-1 font-mono text-lg font-bold tracking-wide">
                {reservation.orderCode}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">
                Assento
              </dt>
              <dd className="mt-1 font-semibold">{reservation.seatLabel}</dd>
            </div>
          </dl>
          <Link
            href="/pedido"
            className={buttonVariants({
              className: 'w-fit rounded-full font-bold',
            })}
          >
            Consultar pedido
          </Link>
        </div>
      ) : null}

      {payment && payment.status === PaymentStatus.Failed ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Pagamento não aprovado. Escolha outro assento ou tente de novo.
        </p>
      ) : null}

      {reservation.status === ReservationStatus.Expired ||
      reservation.status === ReservationStatus.Cancelled ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {reservation.status === ReservationStatus.Cancelled
            ? 'Pagamento falhou. Escolha outro assento.'
            : 'Reserva expirou. Escolha outro assento.'}
        </p>
      ) : null}

      {holdActive && !confirmed ? (
        <form
          onSubmit={handleSubmit(onPay)}
          noValidate
          className="flex flex-col gap-6"
        >
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-[family-name:var(--font-heading)] text-xl font-bold">
              Dados de quem vai viajar
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sem cadastro — usamos esses dados só para emitir a passagem.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field
                label="Nome completo"
                error={errors.name?.message}
                className="sm:col-span-2"
              >
                <div className="relative">
                  <User className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-11 rounded-full pl-10"
                    autoComplete="name"
                    {...register('name')}
                  />
                </div>
              </Field>

              <Field
                label="Data de nascimento"
                error={errors.birthDate?.message}
              >
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="date"
                    className="h-11 rounded-full pl-10"
                    {...register('birthDate')}
                  />
                </div>
              </Field>

              <Field label="CPF" error={errors.document?.message}>
                <div className="relative">
                  <Hash className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-11 rounded-full pl-10"
                    inputMode="numeric"
                    placeholder="000.000.000-00"
                    {...register('document', {
                      onChange: (e) => {
                        e.target.value = formatCpf(e.target.value);
                      },
                    })}
                  />
                </div>
              </Field>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-[family-name:var(--font-heading)] text-xl font-bold">
              Para qual e-mail devemos enviar a passagem?
            </h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="E-mail" error={errors.email?.message}>
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="email"
                    className="h-11 rounded-full pl-10"
                    autoComplete="email"
                    {...register('email')}
                  />
                </div>
              </Field>
              <Field
                label="Confirmar e-mail"
                error={errors.emailConfirm?.message}
              >
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="email"
                    className="h-11 rounded-full pl-10"
                    autoComplete="email"
                    {...register('emailConfirm')}
                  />
                </div>
              </Field>
              <Field
                label="Telefone"
                error={errors.phone?.message}
                className="sm:col-span-2"
              >
                <div className="relative">
                  <Phone className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-11 rounded-full pl-10"
                    inputMode="tel"
                    placeholder="(00) 00000-0000"
                    {...register('phone', {
                      onChange: (e) => {
                        e.target.value = formatPhone(e.target.value);
                      },
                    })}
                  />
                </div>
              </Field>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-[family-name:var(--font-heading)] text-xl font-bold">
                Pagar com
              </h2>
              <p className="text-sm font-semibold">
                Total {formatMoney(reservation.amountCents)}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <MethodTab
                active={paymentMethod === PaymentMethod.Pix}
                onClick={() =>
                  setValue('paymentMethod', PaymentMethod.Pix, {
                    shouldValidate: true,
                  })
                }
                label="Pix"
              />
              <MethodTab
                active={paymentMethod === PaymentMethod.CreditCard}
                onClick={() =>
                  setValue('paymentMethod', PaymentMethod.CreditCard, {
                    shouldValidate: true,
                  })
                }
                label="Cartão de crédito"
              />
            </div>
            {errors.paymentMethod ? (
              <p className="mt-2 text-sm text-destructive">
                {errors.paymentMethod.message}
              </p>
            ) : null}

            {paymentMethod === PaymentMethod.Pix ? (
              <p className="mt-4 rounded-xl bg-secondary/60 px-4 py-3 text-sm text-muted-foreground">
                Pagamento instantâneo (simulado). Ao confirmar, aprovamos o Pix
                na hora e enviamos o ticket por e-mail.
              </p>
            ) : (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <p className="sm:col-span-2 text-sm text-muted-foreground">
                  Dados do cartão ficam só neste navegador — o MVP não envia nem
                  guarda número/CVV.
                </p>
                <Field label="Número do cartão" className="sm:col-span-2">
                  <div className="relative">
                    <CreditCard className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="h-11 rounded-full pl-10"
                      inputMode="numeric"
                      placeholder="____ ____ ____ ____"
                      value={cardNumber}
                      onChange={(e) =>
                        setCardNumber(formatCardNumber(e.target.value))
                      }
                    />
                  </div>
                </Field>
                <Field label="Validade">
                  <Input
                    className="h-11 rounded-full"
                    inputMode="numeric"
                    placeholder="mm/aa"
                    value={cardExpiry}
                    onChange={(e) =>
                      setCardExpiry(formatCardExpiry(e.target.value))
                    }
                  />
                </Field>
                <Field label="Código de segurança">
                  <div className="relative">
                    <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="h-11 rounded-full pl-10"
                      inputMode="numeric"
                      placeholder="3 ou 4 dígitos"
                      value={cardCvv}
                      onChange={(e) =>
                        setCardCvv(
                          e.target.value.replace(/\D/g, '').slice(0, 4),
                        )
                      }
                    />
                  </div>
                </Field>
                <Field label="Nome do titular" className="sm:col-span-2">
                  <Input
                    className="h-11 rounded-full"
                    placeholder="Nome como está no cartão"
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                  />
                </Field>
                <Field label="CPF vinculado ao cartão">
                  <Input
                    className="h-11 rounded-full"
                    inputMode="numeric"
                    placeholder="000.000.000-00"
                    value={cardCpf}
                    onChange={(e) => setCardCpf(formatCpf(e.target.value))}
                  />
                </Field>
                <Field label="CEP da fatura">
                  <Input
                    className="h-11 rounded-full"
                    inputMode="numeric"
                    placeholder="00000-000"
                    value={cardCep}
                    onChange={(e) => setCardCep(formatCep(e.target.value))}
                  />
                </Field>
                <Field label="Telefone do cartão" className="sm:col-span-2">
                  <Input
                    className="h-11 rounded-full"
                    inputMode="tel"
                    placeholder="(00) 00000-0000"
                    value={cardPhone}
                    onChange={(e) => setCardPhone(formatPhone(e.target.value))}
                  />
                </Field>
              </div>
            )}

            <p className="mt-5 text-xs text-muted-foreground">
              Clicando em <strong>Pagar agora</strong>, você aceita os termos de
              uso deste lab.
            </p>

            <Button
              type="submit"
              size="lg"
              className="mt-4 w-full rounded-full font-bold"
              disabled={paying || remainingMs <= 0}
            >
              {paying ? 'Processando pagamento…' : 'Pagar agora'}
            </Button>
          </div>
        </form>
      ) : null}

      {!holdActive &&
      !confirmed &&
      reservation.status !== 'EXPIRED' &&
      reservation.status !== 'CANCELLED' ? (
        <p className="text-sm text-muted-foreground">
          Status: {reservation.status}
          {reservation.expiresAt
            ? ` · expira ${formatDateTime(reservation.expiresAt)}`
            : null}
        </p>
      ) : null}
    </section>
  );
}

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function MethodTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
        active
          ? 'border-primary bg-primary/20 text-foreground'
          : 'border-border bg-background text-muted-foreground hover:border-primary/40',
      )}
    >
      {label}
    </button>
  );
}
