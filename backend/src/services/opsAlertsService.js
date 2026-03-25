/**
 * Telegram **bot** alerts for app lifecycle + health (outbound only).
 * Uses TELEGRAM_BOT_TOKEN — same mechanism as the news digest, not Pyrogram ingest.
 */
import { escapeHtml } from "../lib/digestHtml.js";
import { sendTelegramPayload, stopScheduledDigest } from "./notificationService.js";
import { pool } from "./db.js";
import { redis, redisSub } from "./redis.js";

const REDIS_KEY_LAST_HEARTBEAT = "ops_alerts:last_heartbeat_sent";

function appAlertsEnabled() {
  if (process.env.TELEGRAM_APP_ALERTS !== "true") return false;
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  return Boolean(token && getAlertChatIds().length > 0);
}

/** Optional separate channel for ops; falls back to digest recipients. */
function getAlertChatIds() {
  const raw = (process.env.TELEGRAM_ALERT_CHAT_IDS || process.env.TELEGRAM_CHAT_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return raw;
}

function appBaseUrl() {
  return (process.env.APP_URL || process.env.VITE_APP_URL || "").trim().replace(/\/$/, "") || "(APP_URL not set)";
}

async function broadcastAlert(text, html) {
  if (!appAlertsEnabled()) return;
  const token = process.env.TELEGRAM_BOT_TOKEN.trim();
  const chatIds = getAlertChatIds();
  for (const chatId of chatIds) {
    try {
      if (html) {
        const ok = await sendTelegramPayload(chatId, token, {
          text: html,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        });
        if (ok) continue;
      }
      await sendTelegramPayload(chatId, token, { text, disable_web_page_preview: true });
    } catch (e) {
      console.warn("Ops Telegram alert failed:", e?.message || e);
    }
  }
}

async function checkDb() {
  try {
    await pool.query("SELECT 1");
    return "ok";
  } catch (e) {
    return `error: ${e?.message || e}`;
  }
}

async function checkRedis() {
  try {
    const p = await redis.ping();
    return p === "PONG" ? "ok" : String(p);
  } catch (e) {
    return `error: ${e?.message || e}`;
  }
}

export async function collectHealthLines() {
  const db = await checkDb();
  const redisSt = await checkRedis();
  const uptimeMin = Math.floor(process.uptime() / 60);
  const mem = process.memoryUsage();
  const rssMb = Math.round(mem.rss / 1048576);
  return [
    `DB: ${db}`,
    `Redis: ${redisSt}`,
    `Uptime: ${uptimeMin} min · RSS ~${rssMb} MB`,
    `APP_URL: ${appBaseUrl()}`,
    `Node ${process.version} · API :${process.env.API_PORT || "3001"}`,
  ];
}

export async function sendAppStartedAlert() {
  if (!appAlertsEnabled()) return;
  const lines = await collectHealthLines();
  const plain = `✅ OSINT Earth API started\n\n${lines.join("\n")}`;
  const html = `<b>✅ OSINT Earth API started</b>\n\n${lines.map((l) => `<code>${escapeHtml(l)}</code>`).join("\n")}`;
  await broadcastAlert(plain, html);
}

export async function sendAppStoppingAlert(signal) {
  if (!appAlertsEnabled()) return;
  const plain = `⏹️ OSINT Earth API stopping (${signal})\n\nProcess is shutting down.`;
  const html = `<b>⏹️ OSINT Earth API stopping</b> <code>${escapeHtml(signal)}</code>\n\nProcess is shutting down.`;
  await broadcastAlert(plain, html);
}

export async function sendHealthStatusAlert() {
  if (!appAlertsEnabled()) return;
  const lines = await collectHealthLines();
  const now = new Date().toISOString();
  const plain = `💓 OSINT Earth · health check\n${now}\n\n${lines.join("\n")}`;
  const html = `<b>💓 OSINT Earth · health check</b>\n<code>${escapeHtml(now)}</code>\n\n${lines.map((l) => `<code>${escapeHtml(l)}</code>`).join("\n")}`;
  await broadcastAlert(plain, html);
  try {
    await redis.set(REDIS_KEY_LAST_HEARTBEAT, now);
  } catch {
    /* non-fatal */
  }
}

let healthTimer = null;
let shuttingDown = false;

/**
 * After HTTP server is listening: send startup alert, optional periodic health, graceful shutdown alerts.
 */
export function startOpsAlerts(httpServer) {
  if (!appAlertsEnabled()) {
    return;
  }

  setImmediate(() => {
    sendAppStartedAlert().catch((e) => console.warn("Startup Telegram alert failed:", e?.message || e));
  });

  const intervalMin = parseInt(process.env.OPS_HEALTH_INTERVAL_MINUTES || "0", 10);
  if (intervalMin > 0) {
    const ms = intervalMin * 60 * 1000;
    healthTimer = setInterval(() => {
      if (shuttingDown) return;
      sendHealthStatusAlert().catch((e) => console.warn("Health Telegram alert failed:", e?.message || e));
    }, ms);
    healthTimer.unref?.();
  }

  const onSignal = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (healthTimer) {
      clearInterval(healthTimer);
      healthTimer = null;
    }

    void (async () => {
      stopScheduledDigest();
      try {
        await sendAppStoppingAlert(signal);
      } catch {
        /* ignore */
      }
      httpServer.close(() => {
        Promise.all([
          pool.end().catch(() => {}),
          redis.quit().catch(() => {}),
          redisSub.quit().catch(() => {}),
        ]).finally(() => process.exit(0));
      });
      setTimeout(() => process.exit(1), 15_000).unref?.();
    })();
  };

  process.on("SIGTERM", () => onSignal("SIGTERM"));
  process.on("SIGINT", () => onSignal("SIGINT"));
}
