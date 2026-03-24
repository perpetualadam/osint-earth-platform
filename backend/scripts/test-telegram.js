/**
 * Test Telegram notification - sends a single message to verify TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_IDS.
 * Run from project root: node backend/scripts/test-telegram.js
 * Or from backend: node scripts/test-telegram.js
 */
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const __dirname = dirname(fileURLToPath(import.meta.url));
// Load .env from project root (parent of backend)
import { existsSync } from "fs";
const rootEnv = join(__dirname, "..", "..", ".env");
const envPath = existsSync(rootEnv) ? rootEnv : join(__dirname, "..", ".env");
const loaded = dotenv.config({ path: envPath });
if (loaded.error) console.warn("dotenv:", loaded.error.message);

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatIds = (process.env.TELEGRAM_CHAT_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);

if (!token) {
  console.error("Missing TELEGRAM_BOT_TOKEN in .env");
  process.exit(1);
}
if (chatIds.length === 0) {
  console.error("Missing TELEGRAM_CHAT_IDS in .env (comma-separated chat IDs)");
  process.exit(1);
}

const url = `https://api.telegram.org/bot${token}/sendMessage`;
const body = {
  chat_id: chatIds[0],
  text: "🌍 OSINT Earth\n\nTest notification — your Telegram integration is working.",
  disable_web_page_preview: true,
};

console.log("Sending test message to chat ID:", chatIds[0]);

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

if (res.ok) {
  console.log("✓ Message sent successfully. Check your Telegram.");
} else {
  const err = await res.text();
  console.error("✗ Telegram API error:", res.status, err);
  process.exit(1);
}
