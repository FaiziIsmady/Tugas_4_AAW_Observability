import amqplib from "amqplib";
import { db } from "./db";
import { notifications } from "./db/schema";
import { broadcastNotification } from "./realtime";
import { logError, logInfo, logWarn } from "./logger";

const RABBITMQ_URL =
  process.env.RABBITMQ_URL || "amqp://guest:guest@localhost:5672";
const EXCHANGE_NAME = "suilens.events";
const QUEUE_NAME = "notification-service.order-events";

export async function startConsumer() {
  let retries = 0;
  const maxRetries = 10;
  const retryDelay = 2000;

  while (retries < maxRetries) {
    try {
      const connection = await amqplib.connect(RABBITMQ_URL);
      const channel = await connection.createChannel();

      await channel.assertExchange(EXCHANGE_NAME, "topic", { durable: true });
      await channel.assertQueue(QUEUE_NAME, { durable: true });
      await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, "order.*");

      logInfo("consumer.connected", {
        queue: QUEUE_NAME,
        exchange: EXCHANGE_NAME,
      });

      channel.consume(QUEUE_NAME, async (msg) => {
        if (!msg) return;

        try {
          const event = JSON.parse(msg.content.toString());
          const correlationId = event.correlationId ?? null;

          logInfo("event.received", {
            event_name: event.event,
            correlation_id: correlationId,
            order_id: event.data?.orderId,
          });

          if (event.event === "order.placed") {
            const { orderId, customerName, customerEmail, lensName } =
              event.data;

            const [notification] = await db
              .insert(notifications)
              .values({
              orderId,
              type: "order_placed",
              recipient: customerEmail,
              message: `Hi ${customerName}, your rental order for ${lensName} has been placed successfully. Order ID: ${orderId}`,
              payload: event.data,
            })
              .returning();

            if (notification) {
              broadcastNotification({
                type: "notification.created",
                notification: {
                  id: notification.id,
                  orderId: notification.orderId,
                  event: event.event,
                  recipient: notification.recipient,
                  message: notification.message,
                  payload: notification.payload as {
                    orderId: string;
                    customerName: string;
                    customerEmail: string;
                    lensName: string;
                    branchCode?: string;
                    quantity?: number;
                  },
                  sentAt: notification.sentAt.toISOString(),
                },
              });

              logInfo("notification.recorded", {
                correlation_id: correlationId,
                order_id: orderId,
                recipient: customerEmail,
              });
            }
          }

          channel.ack(msg);
        } catch (error) {
          logError("event.processing_failed", {
            error: error instanceof Error ? error.message : String(error),
          });
          channel.nack(msg, false, true);
        }
      });

      return;
    } catch (error) {
      retries++;
      logWarn("consumer.connection_retry", {
        attempt: retries,
        max_retries: maxRetries,
        error: (error as Error).message,
      });
      if (retries < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }

  logError("consumer.connection_failed", {
    max_retries: maxRetries,
  });
}
