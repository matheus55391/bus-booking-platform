import { z } from 'zod';

export enum TripType {
  OneWay = 'one_way',
  RoundTrip = 'round_trip',
}

export const searchTripsSchema = z
  .object({
    origin: z.string().trim().min(2, 'Informe a origem'),
    destination: z.string().trim().min(2, 'Informe o destino'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (YYYY-MM-DD)'),
    tripType: z.nativeEnum(TripType),
    returnDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (YYYY-MM-DD)')
      .or(z.literal(''))
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.tripType !== TripType.RoundTrip) {
      return;
    }
    if (!data.returnDate) {
      ctx.addIssue({
        code: 'custom',
        message: 'Informe a data de volta',
        path: ['returnDate'],
      });
      return;
    }
    if (data.returnDate < data.date) {
      ctx.addIssue({
        code: 'custom',
        message: 'Volta deve ser na ida ou depois',
        path: ['returnDate'],
      });
    }
  });

export type SearchTripsInput = z.infer<typeof searchTripsSchema>;
