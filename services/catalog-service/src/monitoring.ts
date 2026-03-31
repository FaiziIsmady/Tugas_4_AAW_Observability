import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

type HttpMetricInput = {
  request: Request;
  method: string;
  route: string;
  statusCode: number;
};

export function createMonitoring(serviceName: string) {
  const register = new Registry();
  const requestStarts = new WeakMap<Request, number>();
  const finalizedRequests = new WeakSet<Request>();

  collectDefaultMetrics({
    register,
    prefix: `suilens_${serviceName.replace(/-/g, "_")}_`,
  });

  const httpRequestsTotal = new Counter({
    name: "suilens_http_requests_total",
    help: "Total HTTP requests handled by a service",
    labelNames: ["service", "method", "route", "status_code"] as const,
    registers: [register],
  });

  const httpRequestDurationSeconds = new Histogram({
    name: "suilens_http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["service", "method", "route", "status_code"] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [register],
  });

  function markRequestStart(request: Request) {
    requestStarts.set(request, performance.now());
  }

  function recordHttpRequest({
    request,
    method,
    route,
    statusCode,
  }: HttpMetricInput) {
    if (finalizedRequests.has(request)) return;
    finalizedRequests.add(request);

    const durationSeconds = Math.max(
      ((performance.now() - (requestStarts.get(request) ?? performance.now())) / 1000),
      0,
    );

    const labels = {
      service: serviceName,
      method,
      route,
      status_code: String(statusCode),
    };

    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationSeconds);
  }

  function createCounter(name: string, help: string, labelNames: string[] = []) {
    return new Counter({
      name,
      help,
      labelNames,
      registers: [register],
    });
  }

  return {
    register,
    metricsContentType: register.contentType,
    markRequestStart,
    recordHttpRequest,
    createCounter,
  };
}
