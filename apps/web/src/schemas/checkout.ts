import { z } from 'zod';
import { PaymentMethod } from '@/types';

const digits = (value: string) => value.replace(/\D/g, '');

export const passengerSchema = z
  .object({
    name: z.string().trim().min(3, 'Informe o nome completo'),
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de nascimento inválida'),
    document: z
      .string()
      .refine((v) => digits(v).length === 11, 'CPF deve ter 11 dígitos'),
    email: z.string().email('E-mail inválido'),
    emailConfirm: z.string().email('Confirme o e-mail'),
    phone: z.string().refine((v) => {
      const d = digits(v);
      return d.length === 10 || d.length === 11;
    }, 'Telefone inválido'),
    paymentMethod: z.nativeEnum(PaymentMethod),
  })
  .refine(
    (data) => data.email.toLowerCase() === data.emailConfirm.toLowerCase(),
    {
      message: 'Os e-mails não conferem',
      path: ['emailConfirm'],
    },
  );

export type PassengerFormInput = z.infer<typeof passengerSchema>;

export const orderLookupSchema = z
  .object({
    orderCode: z
      .string()
      .trim()
      .min(3, 'Informe o código do pedido')
      .transform((v) => v.toUpperCase()),
    idType: z.enum(['email', 'document']),
    email: z.string().optional(),
    document: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.idType === 'email') {
      const email = data.email?.trim() ?? '';
      if (!email.includes('@')) {
        ctx.addIssue({
          code: 'custom',
          message: 'E-mail inválido',
          path: ['email'],
        });
      }
    } else if (digits(data.document ?? '').length !== 11) {
      ctx.addIssue({
        code: 'custom',
        message: 'CPF deve ter 11 dígitos',
        path: ['document'],
      });
    }
  });

export type OrderLookupInput = z.infer<typeof orderLookupSchema>;
