'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Hash, Mail, Ticket } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { lookupOrder } from '@/api';
import { formatMoney } from '@/lib/format';
import { digitsOnly, formatCpf, formatOrderCode } from '@/lib/masks';
import { orderLookupSchema, type OrderLookupInput } from '@/schemas';
import { PaymentMethod, type Reservation } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export default function PedidoPage() {
  const [result, setResult] = useState<Reservation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<OrderLookupInput>({
    resolver: zodResolver(orderLookupSchema),
    defaultValues: {
      orderCode: '',
      idType: 'email',
      email: '',
      document: '',
    },
  });

  const idType = watch('idType');

  async function onSubmit(values: OrderLookupInput) {
    setError(null);
    setResult(null);
    try {
      const order = await lookupOrder({
        orderCode: values.orderCode,
        email: values.idType === 'email' ? values.email?.trim() : undefined,
        document:
          values.idType === 'document'
            ? digitsOnly(values.document ?? '')
            : undefined,
      });
      setResult(order);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pedido não encontrado');
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-10 sm:px-6">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <h1 className="font-[family-name:var(--font-heading)] text-3xl font-bold tracking-tight">
          Consultar pedido
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Digite o código do pedido e informe o e-mail ou o CPF usados na
          compra. Não é necessário cadastro.
        </p>

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="mt-6 flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label>Código do pedido</Label>
            <div className="relative">
              <Ticket className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-11 rounded-full pl-10 font-mono uppercase tracking-wide"
                placeholder="ABC-1234"
                {...register('orderCode', {
                  onChange: (e) => {
                    e.target.value = formatOrderCode(e.target.value);
                  },
                })}
              />
            </div>
            {errors.orderCode ? (
              <p className="text-sm text-destructive">
                {errors.orderCode.message}
              </p>
            ) : null}
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Identificação</legend>
            <div className="flex gap-4">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  value="email"
                  checked={idType === 'email'}
                  onChange={() =>
                    setValue('idType', 'email', { shouldValidate: true })
                  }
                  className="accent-primary"
                />
                E-mail
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  value="document"
                  checked={idType === 'document'}
                  onChange={() =>
                    setValue('idType', 'document', { shouldValidate: true })
                  }
                  className="accent-primary"
                />
                Documento
              </label>
            </div>
          </fieldset>

          {idType === 'email' ? (
            <div className="flex flex-col gap-1.5">
              <Label>E-mail</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="email"
                  className="h-11 rounded-full pl-10"
                  placeholder="nome@email.com"
                  {...register('email')}
                />
              </div>
              {errors.email ? (
                <p className="text-sm text-destructive">
                  {errors.email.message}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label>CPF</Label>
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
              {errors.document ? (
                <p className="text-sm text-destructive">
                  {errors.document.message}
                </p>
              ) : null}
            </div>
          )}

          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            size="lg"
            className="mt-2 w-full rounded-full font-bold"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Consultando…' : 'Consultar pedido'}
          </Button>
        </form>
      </div>

      {result ? (
        <div
          className={cn(
            'rounded-2xl border border-border bg-card p-6 shadow-sm',
          )}
        >
          <h2 className="font-[family-name:var(--font-heading)] text-xl font-bold">
            Pedido {result.orderCode}
          </h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <Item label="Status" value={result.status} />
            <Item label="Assento" value={result.seatLabel ?? '—'} />
            <Item label="Valor" value={formatMoney(result.amountCents)} />
            <Item label="Passageiro" value={result.passenger?.name ?? '—'} />
            <Item label="E-mail" value={result.passenger?.email ?? '—'} />
            <Item
              label="Pagamento"
              value={
                result.paymentMethod === PaymentMethod.CreditCard
                  ? 'Cartão'
                  : result.paymentMethod === PaymentMethod.Pix
                    ? 'Pix'
                    : (result.paymentMethod ?? '—')
              }
            />
            <Item
              label="Viagem"
              value={result.tripId}
              className="sm:col-span-2"
            />
          </dl>
        </div>
      ) : null}
    </div>
  );
}

function Item({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-all font-medium">{value}</dd>
    </div>
  );
}
