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
import environmentalRouter from "./routes/environmental.js";
import anomaliesRouter from "./routes/anomalies.js";
import replayRouter from "./routes/replay.js";
import offlineRouter from "./routes/offline.js";
import aiProxyRouter from "./routes/aiProxy.js";
import telegramRouter from "./routes/telegram.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { setupWebSocket } from "./websocket/live.js";
import { startScheduledDigest } from "./services/notificationService.js";

const app = express();
const server = http.createServer(app);

// Include :80 (main nginx), :8080 (docker-built SPA), :5173 (Vite dev) for cross-origin API calls to :3001.
const CORS_ORIGINS = (
  process.env.CORS_ORIGINS ||
  "http://localhost,http://127.0.0.1,http://localhost:8080,http://127.0.0.1:8080,http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://localhost:3000"
)
  .split(",")
  .map((s) => s.trim());

const io = new SocketIO(server, {
  cors: {
    origin: CORS_ORIGINS,
    methods: ["GET", "POST"],
  },
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: CORS_ORIGINS }));
app.use(compression());
app.use(morgan("combined"));
app.use(express.json({ limit: "1mb" }));

// Lightweight ping (no DB) — use for UI "online" when Postgres is misconfigured on the host (e.g. POSTGRES_HOST=postgres while Node runs outside Docker).
app.get("/api/health/live", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", rateLimit({ max: 120, windowMs: 60_000 }));

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
app.use("/api/environmental", environmentalRouter);
app.use("/api/anomalies", anomaliesRouter);
app.use("/api/replay", replayRouter);
app.use("/api/offline", offlineRouter);
app.use("/api/ai", aiProxyRouter);
app.use("/api/telegram", telegramRouter);

app.use(errorHandler);

setupWebSocket(io, redisSub);
startScheduledDigest(pool, redis, io);

const PORT = parseInt(process.env.API_PORT || "3001", 10);
server.listen(PORT, process.env.API_HOST || "0.0.0.0", () => {
  console.log(`OSINT Earth API listening on :${PORT}`);
});
