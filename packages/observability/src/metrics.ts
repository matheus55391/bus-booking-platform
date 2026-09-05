import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: 'nodejs_' });

/** RED — Rate */
const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total de requests HTTP (Rate)',
  labelNames: ['service', 'method', 'route', 'status_code'] as const,
  registers: [registry],
});

/** RED — Errors */
const httpRequestErrorsTotal = new Counter({
  name: 'http_request_errors_total',
  help: 'Total de requests HTTP com erro 5xx (Errors)',
  labelNames: ['service', 'method', 'route', 'status_code'] as const,
  registers: [registry],
});

/** RED — Duration */
const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duração de requests HTTP em segundos (Duration)',
  labelNames: ['service', 'method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

const messagingPublishedTotal = new Counter({
  name: 'messaging_published_total',
  help: 'Mensagens publicadas no broker',
  labelNames: ['service', 'routing_key'] as const,
  registers: [registry],
});

const messagingConsumedTotal = new Counter({
  name: 'messaging_consumed_total',
  help: 'Mensagens consumidas do broker',
  labelNames: ['service', 'routing_key', 'result'] as const,
  registers: [registry],
});

export function getMetricsRegistry() {
  return registry;
}

export function createCounter(
  name: string,
  help: string,
  labelNames: string[] = [],
) {
  return new Counter({ name, help, labelNames, registers: [registry] });
}

export function createHistogram(
  name: string,
  help: string,
  labelNames: string[] = [],
) {
  return new Histogram({ name, help, labelNames, registers: [registry] });
}

export function recordHttpRed(input: {
  service: string;
  method: string;
  route: string;
  statusCode: number;
  durationSeconds: number;
}) {
  const labels = {
    service: input.service,
    method: input.method,
    route: input.route,
    status_code: String(input.statusCode),
  };

  httpRequestsTotal.inc(labels);
  httpRequestDurationSeconds.observe(labels, input.durationSeconds);

  if (input.statusCode >= 500) {
    httpRequestErrorsTotal.inc(labels);
  }
}

export function recordMessagingPublished(
  service: string,
  routingKey: string,
) {
  messagingPublishedTotal.inc({ service, routing_key: routingKey });
}

export function recordMessagingConsumed(
  service: string,
  routingKey: string,
  result: 'ok' | 'error',
) {
  messagingConsumedTotal.inc({
    service,
    routing_key: routingKey,
    result,
  });
}
