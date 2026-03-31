import { context, propagation, Span, SpanKind, SpanOptions, SpanStatusCode, trace } from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";

const SERVICE_NAME = "order-service";
const exporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://jaeger:4318/v1/traces",
});

const provider = new NodeTracerProvider({
  resource: resourceFromAttributes({
    [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
  }),
  spanProcessors: [new BatchSpanProcessor(exporter)],
});
provider.register({
  propagator: new W3CTraceContextPropagator(),
});

const tracer = trace.getTracer(SERVICE_NAME);

const headersGetter = {
  keys(carrier: Headers) {
    return Array.from(carrier.keys());
  },
  get(carrier: Headers, key: string) {
    const value = carrier.get(key);
    return value ? [value] : [];
  },
};

const carrierSetter = {
  set(carrier: Record<string, string>, key: string, value: string) {
    carrier[key] = value;
  },
};

export function startServerSpan(
  request: Request,
  name: string,
  attributes: Record<string, string | number | boolean> = {},
) {
  const extractedContext = propagation.extract(
    context.active(),
    request.headers,
    headersGetter,
  );

  const span = tracer.startSpan(
    name,
    {
      kind: SpanKind.SERVER,
      attributes,
    },
    extractedContext,
  );

  return {
    span,
    ctx: trace.setSpan(extractedContext, span),
  };
}

export function withContext<T>(
  ctx: ReturnType<typeof trace.setSpan>,
  fn: () => Promise<T>,
) {
  return context.with(ctx, fn);
}

export async function withActiveSpan<T>(
  name: string,
  options: SpanOptions,
  fn: (span: Span) => Promise<T>,
) {
  const span = tracer.startSpan(name, options, context.active());

  return await context.with(trace.setSpan(context.active(), span), async () => {
    try {
      return await fn(span);
    } catch (error) {
      recordException(span, error);
      throw error;
    } finally {
      span.end();
    }
  });
}

export function injectTraceHeaders(initialHeaders: Record<string, string> = {}) {
  const carrier = { ...initialHeaders };
  propagation.inject(context.active(), carrier, carrierSetter);
  return carrier;
}

export function setHttpStatus(span: Span, statusCode: number) {
  span.setAttribute("http.status_code", statusCode);
  span.setStatus({
    code: statusCode >= 400 ? SpanStatusCode.ERROR : SpanStatusCode.OK,
  });
}

export function recordException(span: Span, error: unknown) {
  const exception =
    error instanceof Error ? error : new Error(String(error));
  span.recordException(exception);
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: exception.message,
  });
}
