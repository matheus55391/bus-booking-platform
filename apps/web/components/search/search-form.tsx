'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { searchTripsSchema, type SearchTripsInput } from '../../lib/schemas';
import styles from '../../app/page.module.css';

type Props = {
  defaults: SearchTripsInput;
};

export function SearchForm({ defaults }: Props) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SearchTripsInput>({
    resolver: zodResolver(searchTripsSchema),
    defaultValues: defaults,
  });

  function onSubmit(values: SearchTripsInput) {
    const params = new URLSearchParams(values);
    router.push(`/?${params.toString()}`);
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <label className={styles.field}>
        <span>Origem</span>
        <input {...register('origin')} />
        {errors.origin ? (
          <span className={styles.fieldError}>{errors.origin.message}</span>
        ) : null}
      </label>
      <label className={styles.field}>
        <span>Destino</span>
        <input {...register('destination')} />
        {errors.destination ? (
          <span className={styles.fieldError}>
            {errors.destination.message}
          </span>
        ) : null}
      </label>
      <label className={styles.field}>
        <span>Data</span>
        <input type="date" {...register('date')} />
        {errors.date ? (
          <span className={styles.fieldError}>{errors.date.message}</span>
        ) : null}
      </label>
      <button className={styles.submit} type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Buscando…' : 'Buscar'}
      </button>
    </form>
  );
}
