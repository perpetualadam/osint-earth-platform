/**
 * HTML formatting for Telegram Bot API (parse_mode: HTML).
 * @see https://core.telegram.org/bots/api#html-style
 */

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Absolute URL to open the SPA on an event or anomaly (APP_URL + query). */
export function mapOpenHref(baseUrl, kind, id) {
  const b = String(baseUrl || "").trim().replace(/\/$/, "");
  if (!b || id == null) return "";
  const q = kind === "anomaly" ? `anomaly=${encodeURIComponent(String(id))}` : `event=${encodeURIComponent(String(id))}`;
  return `${b}/?${q}`;
}
