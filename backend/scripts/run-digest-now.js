/**
 * Run digest now with real data - resets last_sent so it sends recent events.
 */
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";
import pg from "pg";
import Redis from "ioredis";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: existsSync(join(__dirname, "..", "..", ".env")) ? join(__dirname, "..", "..", ".env") : join(__dirname, "..", ".env") });

const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
  database: process.env.POSTGRES_DB || "osint_earth",
  user: process.env.POSTGRES_USER || "osint",
  password: process.env.POSTGRES_PASSWORD || "changeme_postgres_password",
});

const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  password: process.env.REDIS_PASSWORD || undefined,
});

// Set last_sent to 24h ago so we fetch real events (not just last 15 min)
await redis.set("notification_digest:last_sent", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

const { runDigest } = await import("../src/services/notificationService.js");
await runDigest(pool, redis, null);

console.log("Digest sent. Check Telegram.");
await pool.end();
redis.disconnect();
