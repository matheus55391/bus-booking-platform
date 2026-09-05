import { z } from 'zod';

export const searchTripsSchema = z.object({
  origin: z.string().trim().min(2, 'Informe a origem'),
  destination: z.string().trim().min(2, 'Informe o destino'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (YYYY-MM-DD)'),
});

export type SearchTripsInput = z.infer<typeof searchTripsSchema>;
