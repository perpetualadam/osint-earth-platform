#!/usr/bin/env node
/**
 * External health watchdog: polls GET /api/health from **outside** the API process.
 * Catches crash, OOM, kill -9, and total hangs (if fetch times out) — things in-process
 * Telegram alerts cannot see.
 *
 * Run once (e.g. cron every 2 min):
 *   HEALTHCHECK_URL=http://localhost:3001 TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_IDS=... \
 *   TELEGRAM_WATCHDOG_ENABLED=true node backend/scripts/telegram-health-watchdog.mjs
 *
 * Or enable Docker Compose profile `watchdog` (polls every 60s).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const base = (process.env.HEALTHCHECK_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
const healthUrl = `${base}/api/health`;
const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const chatIds = (
  process.env.TELEGRAM_WATCHDOG_CHAT_IDS ||
  process.env.TELEGRAM_ALERT_CHAT_IDS ||
  process.env.TELEGRAM_CHAT_IDS ||
  ""
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const stateFile =
  process.env.WATCHDOG_STATE_FILE || path.join(__dirname, "..", ".health-watchdog-state.json");

const TIMEOUT_MS = Math.min(Math.max(parseInt(process.env.WATCHDOG_TIMEOUT_MS || "12000", 10), 3000), 60000);

function loadState() {
  try {
    const j = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    return {
      lastOk: j.lastOk !== false,
      lastNotifiedDown: j.lastNotifiedDown ?? null,
    };
  } catch {
    return { lastOk: true, lastNotifiedDown: null };
  }
}

function saveState(s) {
  const dir = path.dirname(stateFile);
  if (dir && dir !== ".") fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(s, null, 0));
}

async function pingHealth() {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(healthUrl, { signal: ac.signal });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const data = await res.json().catch(() => ({}));
    if (data.status === "ok") return { ok: true, detail: "ok" };
    return { ok: false, detail: JSON.stringify(data).slice(0, 200) };
  } catch (e) {
    const msg = e?.name === "AbortError" ? "timeout" : e?.message || String(e);
    return { ok: false, detail: msg };
  } finally {
    clearTimeout(t);
  }
}

async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  for (const chatId of chatIds) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("Telegram watchdog send failed:", res.status, errText);
    }
  }
}

async function main() {
  if (process.env.TELEGRAM_WATCHDOG_ENABLED !== "true") {
    console.log("TELEGRAM_WATCHDOG_ENABLED is not true — exit 0");
    process.exit(0);
  }
  if (!token || !chatIds.length) {
    console.error("Need TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_IDS (or TELEGRAM_WATCHDOG_CHAT_IDS).");
    process.exit(1);
  }

  const { ok, detail } = await pingHealth();
  const state = loadState();

  const iso = new Date().toISOString();

  if (ok && !state.lastOk) {
    await sendTelegram(
      `✅ OSINT Earth API recovered\n${healthUrl}\n${iso}\n(Previous failure; service is healthy again.)`
    );
    saveState({ lastOk: true, lastNotifiedDown: state.lastNotifiedDown });
  } else if (!ok && state.lastOk) {
    await sendTelegram(
      `🔴 OSINT Earth API health check FAILED\n${healthUrl}\n${iso}\nReason: ${detail}\n(Check backend logs, Postgres, Redis.)`
    );
    saveState({ lastOk: false, lastNotifiedDown: iso });
  } else {
    saveState({
      lastOk: ok,
      lastNotifiedDown: state.lastNotifiedDown,
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
