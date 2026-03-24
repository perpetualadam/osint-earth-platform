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

/** Absolute URL to open the SPA (APP_URL + query). kind: event | anomaly | telegram */
export function mapOpenHref(baseUrl, kind, id) {
  const b = String(baseUrl || "").trim().replace(/\/$/, "");
  if (!b || id == null) return "";
  let q;
  if (kind === "anomaly") q = `anomaly=${encodeURIComponent(String(id))}`;
  else if (kind === "telegram") q = `telegram=${encodeURIComponent(String(id))}`;
  else q = `event=${encodeURIComponent(String(id))}`;
  return `${b}/?${q}`;
}
