import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import { Server as SocketIO } from "socket.io";
import { pool } from "./services/db.js";
import { redis, redisSub } from "./services/redis.js";
import eventsRouter from "./routes/events.js";
import tilesRouter from "./routes/tiles.js";
import aircraftRouter from "./routes/aircraft.js";
import shipsRouter from "./routes/ships.js";
import webcamsRouter from "./routes/webcams.js";
import snapshotsRouter from "./routes/snapshots.js";
import heatmapsRouter from "./routes/heatmaps.js";
import replayRouter from "./routes/replay.js";
import offlineRouter from "./routes/offline.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { setupWebSocket } from "./websocket/live.js";

const app = express();
const server = http.createServer(app);

const io = new SocketIO(server, {
  cors: {
    origin: (process.env.CORS_ORIGINS || "http://localhost:5173").split(","),
    methods: ["GET", "POST"],
  },
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: (process.env.CORS_ORIGINS || "http://localhost:5173").split(",") }));
app.use(compression());
app.use(morgan("combined"));
app.use(express.json({ limit: "1mb" }));

app.locals.pool = pool;
app.locals.redis = redis;
app.locals.io = io;

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch (err) {
    res.status(503).json({ status: "error", db: err.message });
  }
});

app.use("/api/events", eventsRouter);
app.use("/api/tiles", tilesRouter);
app.use("/api/aircraft", aircraftRouter);
app.use("/api/ships", shipsRouter);
app.use("/api/webcams", webcamsRouter);
app.use("/api/snapshots", snapshotsRouter);
app.use("/api/heatmaps", heatmapsRouter);
app.use("/api/replay", replayRouter);
app.use("/api/offline", offlineRouter);

app.use(errorHandler);

setupWebSocket(io, redisSub);

const PORT = parseInt(process.env.API_PORT || "3001", 10);
server.listen(PORT, process.env.API_HOST || "0.0.0.0", () => {
  console.log(`OSINT Earth API listening on :${PORT}`);
});
