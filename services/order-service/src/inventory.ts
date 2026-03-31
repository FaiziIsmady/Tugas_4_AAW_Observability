import { SpanKind } from "@opentelemetry/api";
import { injectTraceHeaders, setHttpStatus, withActiveSpan } from "./tracing";

const INVENTORY_SERVICE_URL =
  process.env.INVENTORY_SERVICE_URL || "http://localhost:3004";

interface InventoryReservationPayload {
  orderId: string;
  lensId: string;
  branchCode: string;
  quantity: number;
}

interface InventoryErrorResponse {
  error?: string;
}

export async function reserveInventory(
  payload: InventoryReservationPayload,
  requestId?: string,
): Promise<
  { ok: true } | { ok: false; status: 404 | 409 | 500; error: string }
> {
  const response = await withActiveSpan(
    "inventory-service POST /api/inventory/reserve",
    {
      kind: SpanKind.CLIENT,
      attributes: {
        "http.method": "POST",
        "http.url": `${INVENTORY_SERVICE_URL}/api/inventory/reserve`,
      },
    },
    async (span) => {
      const result = await fetch(
        `${INVENTORY_SERVICE_URL}/api/inventory/reserve`,
        {
          method: "POST",
          headers: injectTraceHeaders({
            "Content-Type": "application/json",
            ...(requestId ? { "x-request-id": requestId } : {}),
          }),
          body: JSON.stringify(payload),
        },
      ).catch(() => null);

      if (result) {
        setHttpStatus(span, result.status);
      }

      return result;
    },
  );

  if (!response) {
    return {
      ok: false,
      status: 500,
      error: "Failed to reach inventory service",
    };
  }

  if (response.ok) {
    return { ok: true };
  }

  const errorBody = (await response.json().catch(() => null)) as
    | InventoryErrorResponse
    | null;

  return {
    ok: false,
    status: response.status === 404 ? 404 : response.status === 409 ? 409 : 500,
    error: errorBody?.error || "Failed to reserve inventory",
  };
}

export async function releaseInventory(orderId: string, requestId?: string) {
  await withActiveSpan(
    "inventory-service POST /api/inventory/release",
    {
      kind: SpanKind.CLIENT,
      attributes: {
        "http.method": "POST",
        "http.url": `${INVENTORY_SERVICE_URL}/api/inventory/release`,
      },
    },
    async (span) => {
      const response = await fetch(`${INVENTORY_SERVICE_URL}/api/inventory/release`, {
        method: "POST",
        headers: injectTraceHeaders({
          "Content-Type": "application/json",
          ...(requestId ? { "x-request-id": requestId } : {}),
        }),
        body: JSON.stringify({ orderId }),
      }).catch(() => null);

      if (response) {
        setHttpStatus(span, response.status);
      }
    },
  );
}
