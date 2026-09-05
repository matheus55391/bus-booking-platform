/**
 * Camada compartilhada do monorepo.
 *
 * Contratos, interfaces e tópicos de borda reutilizados por
 * web, gateway e serviços — desacoplamento / inversão de dependência.
 *
 * Eventos de domínio (seat.*, payment.*) ficam em `@repo/events`.
 */
export type * from './trip';
export type * from './reservation';
export type * from './payment';
export * from './messaging';
export * from './topics';
