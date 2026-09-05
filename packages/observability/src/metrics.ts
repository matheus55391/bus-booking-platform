import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "prom-client";
import { metrics as otelMetrics } from "@opentelemetry/api";

const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: "nodejs_" });

type Labels = Record<string, string | number>;

/**
 * Contador dual: prom-client (/metrics) + OpenTelemetry (Grafana LGTM via OTLP).
 * Sem isso, o funil só aparecia no scrape local e não no Explore do Grafana.
 */
export function createCounter(
  name: string,
  help: string,
  labelNames: string[] = [],
) {
  const prom = new Counter({
    name,
    help,
    labelNames,
    registers: [registry],
  });
  const otel = otelMetrics.getMeter("bus-booking").createCounter(name, {
    description: help,
  });

  return {
    inc(labelsOrValue?: Labels | number, maybeValue?: number) {
      if (typeof labelsOrValue === "number") {
        prom.inc(labelsOrValue);
        otel.add(labelsOrValue);
        return;
      }

      const labels = stringifyLabels(labelsOrValue);
      const value = maybeValue ?? 1;

      if (labelNames.length === 0) {
        prom.inc(value);
        otel.add(value);
        return;
      }

      prom.inc(labels, value);
      otel.add(value, labels);
    },
  };
}

export function createHistogram(
  name: string,
  help: string,
  labelNames: string[] = [],
  buckets?: number[],
) {
  const prom = new Histogram({
    name,
    help,
    labelNames,
    buckets,
    registers: [registry],
  });
  const otel = otelMetrics.getMeter("bus-booking").createHistogram(name, {
    description: help,
  });

  return {
    observe(labelsOrValue: Labels | number, maybeValue?: number) {
      if (typeof labelsOrValue === "number") {
        prom.observe(labelsOrValue);
        otel.record(labelsOrValue);
        return;
      }
      const labels = stringifyLabels(labelsOrValue);
      const value = maybeValue ?? 0;
      if (labelNames.length === 0) {
        prom.observe(value);
        otel.record(value);
        return;
      }
      prom.observe(labels, value);
      otel.record(value, labels);
    },
  };
}

function stringifyLabels(labels?: Labels): Record<string, string> {
  if (!labels) return {};
  return Object.fromEntries(
    Object.entries(labels).map(([k, v]) => [k, String(v)]),
  );
}

/** RED — Rate */
const httpRequestsTotal = createCounter(
  "http_requests_total",
  "Total de requests HTTP (Rate)",
  ["service", "method", "route", "status_code"],
);

/** RED — Errors */
const httpRequestErrorsTotal = createCounter(
  "http_request_errors_total",
  "Total de requests HTTP com erro 5xx (Errors)",
  ["service", "method", "route", "status_code"],
);

/** RED — Duration */
const httpRequestDurationSeconds = createHistogram(
  "http_request_duration_seconds",
  "Duração de requests HTTP em segundos (Duration)",
  ["service", "method", "route", "status_code"],
  [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
);

const messagingPublishedTotal = createCounter(
  "messaging_published_total",
  "Mensagens publicadas no broker",
  ["service", "routing_key"],
);

const messagingConsumedTotal = createCounter(
  "messaging_consumed_total",
  "Mensagens consumidas do broker",
  ["service", "routing_key", "result"],
);

export function getMetricsRegistry() {
  return registry;
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

export function recordMessagingPublished(service: string, routingKey: string) {
  messagingPublishedTotal.inc({ service, routing_key: routingKey });
}

export function recordMessagingConsumed(
  service: string,
  routingKey: string,
  result: "ok" | "error",
) {
  messagingConsumedTotal.inc({
    service,
    routing_key: routingKey,
    result,
  });
}
