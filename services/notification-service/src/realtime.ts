import { logError } from "./logger";

const clients = new Set<any>();

export interface NotificationBroadcastPayload {
  type: "notification.created";
  notification: {
    id: string;
    orderId: string;
    event: string;
    recipient: string;
    message: string;
    payload: {
      orderId: string;
      customerName: string;
      customerEmail: string;
      lensName: string;
    };
    sentAt: string;
  };
}

export function addClient(client: any) {
  clients.add(client);
}

export function removeClient(client: any) {
  clients.delete(client);
}

export function broadcastNotification(payload: NotificationBroadcastPayload) {
  const serialized = JSON.stringify(payload);

  for (const client of clients) {
    try {
      client.send(serialized);
    } catch (error) {
      logError("websocket.delivery_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      clients.delete(client);
    }
  }
}
