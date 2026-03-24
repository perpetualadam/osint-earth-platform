import { ingest } from "../services/notificationService.js";

const CHANNELS = ["aircraft:live", "ships:live", "events:new", "anomalies:new", "telegram:new"];
const NOTIFICATION_CHANNELS = ["events:new", "anomalies:new"];

/**
 * Bridge Redis pub/sub messages to connected Socket.io clients.
 * Workers publish JSON payloads to these Redis channels; the API
 * server fans them out to browsers via WebSocket.
 * events:new and anomalies:new are also fed to the notification service
 * for merged (deduplicated) Telegram + browser notifications.
 */
export function setupWebSocket(io, redisSub) {
  for (const ch of CHANNELS) {
    redisSub.subscribe(ch);
  }

  redisSub.on("message", (channel, message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      data = message;
    }
    io.emit(channel, data);

    if (NOTIFICATION_CHANNELS.includes(channel)) {
      ingest(channel, typeof data === "object" ? data : {}, io);
    }
  });

  io.on("connection", (socket) => {
    console.log(`WS client connected: ${socket.id}`);

    socket.on("subscribe:bbox", (bbox) => {
      socket.join(`bbox:${bbox}`);
    });

    socket.on("disconnect", () => {
      console.log(`WS client disconnected: ${socket.id}`);
    });
  });
}
