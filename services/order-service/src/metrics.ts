import { createMonitoring } from "./monitoring";

export const monitoring = createMonitoring("order-service");

const ordersCreatedTotal = monitoring.createCounter(
  "suilens_orders_created_total",
  "Total successful orders created",
  ["branch_code"],
);

const ordersFailedTotal = monitoring.createCounter(
  "suilens_orders_failed_total",
  "Total failed order creations",
  ["reason"],
);

export function recordOrderCreated(branchCode: string) {
  ordersCreatedTotal.inc({ branch_code: branchCode });
}

export function recordOrderFailed(reason: string) {
  ordersFailedTotal.inc({ reason });
}
