/**
 * Test the notification digest format.
 * Fetches recent events from DB and sends to Telegram.
 * Run: node scripts/test-digest.js
 */
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";
import pg from "pg";
import Redis from "ioredis";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootEnv = join(__dirname, "..", "..", ".env");
dotenv.config({ path: existsSync(rootEnv) ? rootEnv : join(__dirname, "..", ".env") });

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

const { runDigest } = await import("../src/services/notificationService.js");

console.log("Running digest (dry run - will send to Telegram if configured)...\n");
await runDigest(pool, redis, null);
console.log("Done. Check Telegram for the message.");
await pool.end();
redis.disconnect();
