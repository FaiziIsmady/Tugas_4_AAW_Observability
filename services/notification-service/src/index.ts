import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { startConsumer } from "./consumer";
import { db } from "./db";
import { notifications } from "./db/schema";
import { desc } from "drizzle-orm";
import { addClient, removeClient } from "./realtime";
import { monitoring } from "./metrics";

const notificationPayload = t.Object({
  orderId: t.String({ format: "uuid" }),
  customerName: t.String(),
  customerEmail: t.String({ format: "email" }),
  lensName: t.String(),
  branchCode: t.Optional(t.String()),
  quantity: t.Optional(t.Numeric()),
});

const notificationResponse = t.Object({
  id: t.String({ format: "uuid" }),
  orderId: t.String({ format: "uuid" }),
  type: t.String(),
  recipient: t.String({ format: "email" }),
  message: t.String(),
  payload: notificationPayload,
  sentAt: t.String(),
});

function serializeNotification(notification: typeof notifications.$inferSelect) {
  return {
    ...notification,
    payload: notification.payload as {
      orderId: string;
      customerName: string;
      customerEmail: string;
      lensName: string;
      branchCode?: string;
      quantity?: number;
    },
    sentAt: notification.sentAt.toISOString(),
  };
}

const app = new Elysia()
  .onRequest(({ request }) => {
    const pathname = new URL(request.url).pathname;
    if (pathname !== "/metrics") {
      monitoring.markRequestStart(request);
    }
  })
  .onAfterHandle(({ request, path, set }) => {
    const route = path || new URL(request.url).pathname;
    if (route === "/metrics") return;

    monitoring.recordHttpRequest({
      request,
      method: request.method,
      route,
      statusCode: typeof set.status === "number" ? set.status : 200,
    });
  })
  .onError(({ request, path, set }) => {
    const route = path || new URL(request.url).pathname;
    if (route === "/metrics") return;

    monitoring.recordHttpRequest({
      request,
      method: request.method,
      route,
      statusCode: typeof set.status === "number" ? set.status : 500,
    });
  })
  .use(cors())
  .use(
    swagger({
      documentation: {
        info: {
          title: "SuiLens Notification Service API",
          version: "1.0.0",
          description:
            "Notification history and real-time updates for SuiLens orders.",
        },
        tags: [
          { name: "Notifications", description: "Notification read endpoints" },
          { name: "Realtime", description: "WebSocket notification stream" },
        ],
      },
      path: "/docs",
    }),
  )
  .get(
    "/api/notifications",
    async () => {
      const results = await db
        .select()
        .from(notifications)
        .orderBy(desc(notifications.sentAt));

      return results.map(serializeNotification);
    },
    {
      detail: {
        tags: ["Notifications"],
        summary: "List notifications",
        description: "Returns recorded notifications ordered from newest to oldest.",
      },
      response: {
        200: t.Array(notificationResponse),
      },
    },
  )
  .ws("/ws/notifications", {
    open(ws) {
      addClient(ws);
      ws.send(
        JSON.stringify({
          type: "realtime.connected",
          message: "Connected to notification stream",
        }),
      );
    },
    close(ws) {
      removeClient(ws);
    },
    detail: {
      tags: ["Realtime"],
      summary: "Notification WebSocket stream",
      description:
        "WebSocket endpoint that pushes newly created order notifications to connected clients.",
    },
  })
  .get(
    "/health",
    () => ({ status: "ok", service: "notification-service" }),
    {
      detail: {
        tags: ["Notifications"],
        summary: "Health check",
      },
      response: {
        200: t.Object({
          status: t.String(),
          service: t.String(),
        }),
      },
    },
  )
  .get("/metrics", async ({ set }) => {
    set.headers = {
      "content-type": monitoring.metricsContentType,
    };
    return await monitoring.register.metrics();
  })
  .listen(3003);

startConsumer().catch(console.error);

console.log(`Notification Service running on port ${app.server?.port}`);