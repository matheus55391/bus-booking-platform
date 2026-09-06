'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeftRight, CalendarDays, MapPin, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { resolveCityValue } from '@/data/locations';
import { searchTripsSchema, type SearchTripsInput } from '@/schemas';
import { CityCombobox } from '@/components/search/city-combobox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type Props = {
  defaults: SearchTripsInput;
  compact?: boolean;
};

export function SearchForm({ defaults, compact = false }: Props) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<SearchTripsInput>({
    resolver: zodResolver(searchTripsSchema),
    defaultValues: defaults,
  });

  const origin = watch('origin');
  const destination = watch('destination');

  function swapCities() {
    setValue('origin', destination, { shouldValidate: true });
    setValue('destination', origin, { shouldValidate: true });
  }

  function onSubmit(values: SearchTripsInput) {
    const params = new URLSearchParams({
      origin: resolveCityValue(values.origin),
      destination: resolveCityValue(values.destination),
      date: values.date,
    });
    router.push(`/?${params.toString()}`);
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className={cn(
        'relative z-10 w-full overflow-visible rounded-2xl bg-card text-card-foreground shadow-[0_16px_48px_-16px_rgba(20,32,25,0.35)]',
        compact ? 'p-3 sm:p-4' : 'p-4 sm:p-6',
      )}
    >
      {!compact ? (
        <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-[family-name:var(--font-heading)] text-xl font-bold tracking-tight sm:text-2xl">
            Compre sua passagem de ônibus
          </h2>
          <div className="flex items-center gap-4 text-sm font-medium">
            <span className="inline-flex items-center gap-2 text-foreground">
              <span
                className="flex size-4 items-center justify-center rounded-full bg-primary"
                aria-hidden
              >
                <span className="size-1.5 rounded-full bg-primary-foreground" />
              </span>
              Somente ida
            </span>
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <span
                className="size-4 rounded-full border-2 border-muted-foreground/40"
                aria-hidden
              />
              Ida e volta
            </span>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 overflow-visible lg:flex-row lg:items-stretch lg:gap-3">
        <div className="relative z-20 flex min-w-0 flex-1 flex-col overflow-visible rounded-2xl border border-border bg-card sm:flex-row">
          <Field
            label="Origem"
            invalid={Boolean(errors.origin)}
            icon={
              <MapPin
                className={cn(
                  'size-4 shrink-0',
                  errors.origin ? 'text-destructive' : 'text-primary',
                )}
                aria-hidden
              />
            }
            className={cn(
              'rounded-2xl sm:rounded-none sm:rounded-l-2xl',
              errors.origin && 'border border-destructive',
            )}
          >
            <Controller
              name="origin"
              control={control}
              render={({ field }) => (
                <CityCombobox
                  value={field.value}
                  invalid={Boolean(errors.origin)}
                  placeholder="De onde você vai sair?"
                  onChange={(city) => {
                    setValue('origin', city, {
                      shouldValidate: true,
                      shouldDirty: true,
                    });
                  }}
                  onBlur={field.onBlur}
                />
              )}
            />
          </Field>

          <div className="relative z-30 flex items-center justify-center sm:w-0">
            <Button
              type="button"
              size="icon"
              onClick={swapCities}
              aria-label="Trocar origem e destino"
              className="absolute size-9 rounded-full border-2 border-card bg-primary text-primary-foreground shadow-md hover:bg-primary/90 sm:left-1/2 sm:-translate-x-1/2"
            >
              <ArrowLeftRight className="size-4" />
            </Button>
          </div>

          <Field
            label="Destino"
            invalid={Boolean(errors.destination)}
            icon={
              <MapPin
                className={cn(
                  'size-4 shrink-0',
                  errors.destination ? 'text-destructive' : 'text-primary',
                )}
                aria-hidden
              />
            }
            className={cn(
              'border-t sm:border-t-0 sm:border-l',
              errors.destination && 'border border-destructive sm:border',
            )}
          >
            <Controller
              name="destination"
              control={control}
              render={({ field }) => (
                <CityCombobox
                  value={field.value}
                  invalid={Boolean(errors.destination)}
                  placeholder="Para onde você vai?"
                  onChange={(city) => {
                    setValue('destination', city, {
                      shouldValidate: true,
                      shouldDirty: true,
                    });
                  }}
                  onBlur={field.onBlur}
                />
              )}
            />
          </Field>

          <Field
            label="Ida"
            invalid={Boolean(errors.date)}
            icon={
              <CalendarDays
                className={cn(
                  'size-4 shrink-0',
                  errors.date ? 'text-destructive' : 'text-primary',
                )}
                aria-hidden
              />
            }
            className={cn(
              'rounded-2xl border-t sm:rounded-none sm:rounded-r-2xl sm:border-t-0 sm:border-l',
              errors.date && 'border border-destructive sm:border',
            )}
          >
            <Input
              type="date"
              {...register('date')}
              aria-invalid={Boolean(errors.date)}
              className={cn(
                'h-10 border-0 bg-transparent px-0 text-base shadow-none focus-visible:border-0 focus-visible:ring-0 aria-invalid:border-0 aria-invalid:ring-0',
                errors.date && 'text-destructive placeholder:text-destructive',
              )}
            />
          </Field>
        </div>

        <Button
          type="submit"
          disabled={isSubmitting}
          size="lg"
          className="h-14 shrink-0 rounded-full px-10 text-base font-bold shadow-md lg:self-center"
        >
          <Search data-icon="inline-start" />
          {isSubmitting ? 'Buscando…' : 'Buscar'}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  invalid,
  icon,
  children,
  className,
}: {
  label: string;
  invalid?: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative z-20 min-w-0 flex-1 overflow-visible px-4 py-2.5 transition-colors focus-within:bg-secondary/40',
        className,
      )}
    >
      <Label
        className={cn(
          'text-xs font-medium',
          invalid ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {label}
      </Label>
      <div className="flex items-center gap-2 overflow-visible">
        {icon}
        <div className="relative min-w-0 flex-1 overflow-visible">
          {children}
        </div>
      </div>
    </div>
  );
}
