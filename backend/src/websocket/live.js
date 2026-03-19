const CHANNELS = ["aircraft:live", "ships:live", "events:new", "anomalies:new"];

/**
 * Bridge Redis pub/sub messages to connected Socket.io clients.
 * Workers publish JSON payloads to these Redis channels; the API
 * server fans them out to browsers via WebSocket.
 */
export function setupWebSocket(io, redisSub) {
  for (const ch of CHANNELS) {
    redisSub.subscribe(ch);
  }

  redisSub.on("message", (channel, message) => {
    try {
      const data = JSON.parse(message);
      io.emit(channel, data);
    } catch {
      io.emit(channel, message);
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
