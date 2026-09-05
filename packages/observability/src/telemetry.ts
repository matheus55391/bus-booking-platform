import { context, propagation, trace, SpanStatusCode } from '@opentelemetry/api';
import type { Span } from '@opentelemetry/api';
import { logs as otelLogs, SeverityNumber } from '@opentelemetry/api-logs';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

let sdkStarted = false;
let serviceNameGlobal = 'unknown';

export function getServiceName() {
  return serviceNameGlobal;
}

export async function startTelemetry(serviceName: string) {
  if (sdkStarted) return;
  sdkStarted = true;
  serviceNameGlobal = serviceName;

  const endpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318';

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: process.env.SERVICE_VERSION ?? '0.0.1',
  });

  const sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`,
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: `${endpoint}/v1/metrics`,
      }),
      exportIntervalMillis: 10_000,
    }),
    logRecordProcessors: [
      new BatchLogRecordProcessor(
        new OTLPLogExporter({
          url: `${endpoint}/v1/logs`,
        }),
      ),
    ],
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
      }),
    ],
  });

  await sdk.start();

  const shutdown = async () => {
    await sdk.shutdown();
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

export function getTracer(name = serviceNameGlobal) {
  return trace.getTracer(name);
}

export function getCurrentTraceId(): string | undefined {
  const span = trace.getSpan(context.active());
  const id = span?.spanContext().traceId;
  if (!id || id === '00000000000000000000000000000000') return undefined;
  return id;
}

/** Injeta W3C traceparent nos headers AMQP / HTTP. */
export function injectTraceCarrier(): Record<string, string> {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return carrier;
}

/** Restaura contexto a partir de headers (ex.: RabbitMQ). */
export function extractTraceContext(
  carrier: Record<string, unknown>,
): ReturnType<typeof context.active> {
  const stringCarrier: Record<string, string> = {};
  for (const [k, v] of Object.entries(carrier)) {
    if (typeof v === 'string') stringCarrier[k] = v;
  }
  return propagation.extract(context.active(), stringCarrier);
}

export function withExtractedContext<T>(
  carrier: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  const ctx = extractTraceContext(carrier);
  return context.with(ctx, fn);
}

export async function withSpan<T>(
  name: string,
  attributes: Record<string, string>,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const tracer = getTracer();
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await context.with(trace.setSpan(context.active(), span), () =>
        fn(span),
      );
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}

type LogAttrs = Record<string, unknown>;

function emit(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  attrs: LogAttrs = {},
) {
  const traceId = getCurrentTraceId();
  const line = {
    service: serviceNameGlobal,
    level,
    timestamp: new Date().toISOString(),
    traceId: traceId ?? null,
    message,
    ...attrs,
  };

  const out = JSON.stringify(line);
  if (level === 'error') console.error(out);
  else if (level === 'warn') console.warn(out);
  else console.log(out);

  const severity =
    level === 'error'
      ? SeverityNumber.ERROR
      : level === 'warn'
        ? SeverityNumber.WARN
        : level === 'debug'
          ? SeverityNumber.DEBUG
          : SeverityNumber.INFO;

  try {
    otelLogs.getLogger(serviceNameGlobal).emit({
      severityNumber: severity,
      severityText: level.toUpperCase(),
      body: message,
      attributes: {
        service: serviceNameGlobal,
        traceId: traceId ?? '',
        ...Object.fromEntries(
          Object.entries(attrs).map(([k, v]) => [k, String(v)]),
        ),
      },
    });
  } catch {
    /* OTEL logs opcional se SDK ainda não subiu */
  }
}

export function createLogger(scope?: string) {
  const prefix = scope ? `[${scope}] ` : '';
  return {
    debug: (message: string, attrs?: LogAttrs) =>
      emit('debug', `${prefix}${message}`, attrs),
    info: (message: string, attrs?: LogAttrs) =>
      emit('info', `${prefix}${message}`, attrs),
    warn: (message: string, attrs?: LogAttrs) =>
      emit('warn', `${prefix}${message}`, attrs),
    error: (message: string, attrs?: LogAttrs) =>
      emit('error', `${prefix}${message}`, attrs),
  };
}
