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
  const response = await fetch(
    `${INVENTORY_SERVICE_URL}/api/inventory/reserve`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(requestId ? { "x-request-id": requestId } : {}),
      },
      body: JSON.stringify(payload),
    },
  ).catch(() => null);

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
  await fetch(`${INVENTORY_SERVICE_URL}/api/inventory/release`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(requestId ? { "x-request-id": requestId } : {}),
    },
    body: JSON.stringify({ orderId }),
  }).catch(() => null);
}
