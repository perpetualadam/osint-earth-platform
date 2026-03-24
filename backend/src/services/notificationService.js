/**
 * News-feed style digest notifications.
 * Runs every 10–30 min, queries DB for new events/anomalies since last send,
 * builds rich snippets (country, summary, type, time, date), sends to Telegram.
 * Deduplicates by tracking last_sent timestamp in Redis.
 */
import { escapeHtml, mapOpenHref } from "../lib/digestHtml.js";

const DIGEST_INTERVAL_MS = parseInt(process.env.NOTIFICATION_DIGEST_MINUTES || "15", 10) * 60 * 1000;
const MAX_EVENTS_PER_DIGEST = 20;
const MAX_TELEGRAM_PER_DIGEST = 15;
const MAX_ANOMALIES_PER_DIGEST = 5;
const REDIS_KEY_LAST_SENT = "notification_digest:last_sent";

const COUNTRY_CODES = {
  UK: "Britain", GB: "Britain", US: "United States", USA: "United States",
  FR: "France", DE: "Germany", ES: "Spain", IT: "Italy", RU: "Russia",
  CN: "China", JP: "Japan", IN: "India", BR: "Brazil", MX: "Mexico",
  UA: "Ukraine", PL: "Poland", TR: "Turkey", SA: "Saudi Arabia",
  IR: "Iran", IQ: "Iraq", SY: "Syria", YE: "Yemen", LY: "Libya",
  EG: "Egypt", NG: "Nigeria", ZA: "South Africa", KE: "Kenya",
  PK: "Pakistan", AF: "Afghanistan", BD: "Bangladesh", ID: "Indonesia",
  PH: "Philippines", VN: "Vietnam", TH: "Thailand", MY: "Malaysia",
  ET: "Ethiopia", SD: "Sudan", DZ: "Algeria", MA: "Morocco",
  IL: "Israel", PS: "Palestine", JO: "Jordan", LB: "Lebanon",
  KZ: "Kazakhstan", UZ: "Uzbekistan", AZ: "Azerbaijan", GE: "Georgia",
  CD: "DR Congo", TZ: "Tanzania", UG: "Uganda", GH: "Ghana",
  CO: "Colombia", VE: "Venezuela", AR: "Argentina", CL: "Chile",
  AU: "Australia", NZ: "New Zealand", KR: "South Korea", TW: "Taiwan",
};

function getCountry(meta) {
  if (!meta) return null;
  const c = meta.country;
  if (c && typeof c === "string" && c.length > 1) return c.trim();
  const loc = meta.location_name;
  if (loc && typeof loc === "string" && loc.length > 2) return loc.split(",").pop()?.trim() || loc;
  const code = (meta.country_code || "").toUpperCase();
  if (code) return COUNTRY_CODES[code] || code;
  return null;
}

function truncate(s, max = 160) {
  const t = (s || "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

function getSummary(row) {
  const meta = row.metadata || {};
  let s = (row.description || "").trim();
  if (!s && (meta.actor1 || meta.actor2)) {
    s = meta.actor2 ? `${meta.actor1 || "Unknown"} → ${meta.actor2}` : (meta.actor1 || "");
    if (meta.location_name) s += ` in ${meta.location_name}`;
  }
  if (!s) s = (row.title || "").trim();
  if (!s) s = `${row.event_type || "Event"} (${row.source || "unknown source"})`;
  return truncate(s, 200);
}

/** Title line for digest when it adds detail beyond the summary (e.g. GDELT headline vs actor line). */
function extraHeadline(row, summary) {
  const title = (row.title || "").trim();
  if (!title || title.length < 4) return "";
  const sumStart = summary.slice(0, 48);
  if (title === summary || title.startsWith(sumStart) || summary.includes(title.slice(0, 40))) return "";
  return truncate(title, 140);
}

function formatTime(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  const day = String(dt.getDate()).padStart(2, "0");
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  const year = dt.getFullYear();
  return `${day}/${month}/${year}`;
}

function appBaseUrl() {
  const u = (process.env.APP_URL || process.env.VITE_APP_URL || "").trim().replace(/\/$/, "");
  return u || "";
}

function buildEventSnippet(row) {
  const meta = row.metadata || {};
  const country = getCountry(meta) || "Location unknown";
  const summary = getSummary(row);
  const headline = extraHeadline(row, summary);
  const type = (row.event_type || "event").replace(/^\w/, (c) => c.toUpperCase());
  const time = formatTime(row.occurred_at);
  const date = formatDate(row.occurred_at);
  const source = (row.source || "").trim() || "—";
  const base = appBaseUrl();
  const mapUrl = base ? mapOpenHref(base, "event", row.id) : "";
  const openLine = mapUrl ? `\nOpen in GlobeViewer (tap URL):\n${mapUrl}` : "";
  const headBlock = headline ? `${headline}\n` : "";
  return `📍 ${country}\n${headBlock}${summary}\nSource: ${source} · Type: ${type}\nWhen: ${time} · ${date}\nMap DB id: ${row.id}${openLine}`;
}

function buildEventSnippetHtml(row) {
  const base = appBaseUrl();
  const meta = row.metadata || {};
  const summaryPlain = getSummary(row);
  const country = escapeHtml(getCountry(meta) || "Location unknown");
  const summary = escapeHtml(summaryPlain);
  const headline = extraHeadline(row, summaryPlain);
  const headBlock = headline ? `<b>${escapeHtml(headline)}</b>\n` : "";
  const type = escapeHtml((row.event_type || "event").replace(/^\w/, (c) => c.toUpperCase()));
  const time = escapeHtml(formatTime(row.occurred_at));
  const date = escapeHtml(formatDate(row.occurred_at));
  const source = escapeHtml((row.source || "").trim() || "—");
  const href = base ? mapOpenHref(base, "event", row.id) : "";
  const linkLine = href
    ? `\n<a href="${escapeHtml(href)}">Open in GlobeViewer</a> <code>(${escapeHtml(String(row.id))})</code>\n<a href="${escapeHtml(href)}">${escapeHtml(href)}</a>`
    : `\n<code>${escapeHtml(String(row.id))}</code> — set APP_URL for a tap-to-open map link`;
  return `📍 ${country}\n${headBlock}${summary}\nSource: ${source} · Type: ${type}\nWhen: ${time} · ${date}${linkLine}`;
}

const ANOMALY_DESCRIPTIONS = {
  ais_gap: (row) => {
    const gap = row.metadata?.gap_minutes ?? row.observed;
    const mmsi = row.metadata?.mmsi;
    const score = row.score ?? 0;
    let s = `Ship ${mmsi ? `(MMSI ${mmsi}) ` : ""}stopped transmitting`;
    if (gap != null) s += ` ${Math.round(gap)} min ago`;
    s += `. Score ${score.toFixed(1)}/10 (higher = longer silence).`;
    return s;
  },
  loiter: (row) => {
    const reports = row.metadata?.reports ?? row.observed;
    const icao = row.metadata?.icao24;
    const score = row.score ?? 0;
    let s = `Aircraft ${icao ? `(${icao}) ` : ""}circling: ${reports ?? "—"} position reports in small area`;
    s += `. Score ${score.toFixed(1)}/10 (higher = more reports).`;
    return s;
  },
  event_cluster: (row) => {
    const count = row.metadata?.grid_events ?? row.observed;
    const score = row.score ?? 0;
    let s = `${count ?? "—"} events in same grid cell (unusual concentration)`;
    s += `. Score ${score.toFixed(1)}/10 (higher = denser cluster).`;
    return s;
  },
};

function buildAnomalySnippet(row) {
  const type = (row.anomaly_type || "anomaly").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  const time = formatTime(row.detected_at);
  const date = formatDate(row.detected_at);
  const meta = row.metadata || {};
  const descFn = ANOMALY_DESCRIPTIONS[row.anomaly_type];
  const desc = descFn
    ? descFn(row)
    : meta.description || meta.summary || `Unusual pattern detected. Score: ${row.score?.toFixed(1) ?? "—"}/10.`;
  const base = appBaseUrl();
  const openLine = base ? `\n🔗 Open in app: ${mapOpenHref(base, "anomaly", row.id)}` : "";
  return `⚠️ ${type}\n${desc}\nWhen: ${time} · ${date}\nDB id: ${row.id}${openLine}`;
}

function buildAnomalySnippetHtml(row) {
  const base = appBaseUrl();
  const type = escapeHtml((row.anomaly_type || "anomaly").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()));
  const time = escapeHtml(formatTime(row.detected_at));
  const date = escapeHtml(formatDate(row.detected_at));
  const meta = row.metadata || {};
  const descFn = ANOMALY_DESCRIPTIONS[row.anomaly_type];
  const descPlain = descFn
    ? descFn(row)
    : meta.description || meta.summary || `Unusual pattern detected. Score: ${row.score?.toFixed(1) ?? "—"}/10.`;
  const desc = escapeHtml(descPlain);
  const href = base ? mapOpenHref(base, "anomaly", row.id) : "";
  const linkLine = href
    ? `\n<a href="${escapeHtml(href)}">Open in GlobeViewer</a> <code>(${escapeHtml(String(row.id))})</code>\n<a href="${escapeHtml(href)}">${escapeHtml(href)}</a>`
    : `\n<code>${escapeHtml(String(row.id))}</code> — set APP_URL for a tap-to-open map link`;
  return `⚠️ ${type}\n${desc}\nWhen: ${time} · ${date}${linkLine}`;
}

function telegramTgHref(row) {
  const un = (row.channel_username || "").replace(/^@/, "").trim();
  const mid = row.telegram_message_id;
  if (!un || mid == null) return "";
  return `https://t.me/${un}/${mid}`;
}

function buildTelegramSnippet(row) {
  const ch = row.channel_username ? `@${String(row.channel_username).replace(/^@/, "")}` : "channel";
  const body = truncate((row.text_en || row.text || "—").replace(/\s+/g, " "), 200);
  const time = formatTime(row.posted_at);
  const date = formatDate(row.posted_at);
  const base = appBaseUrl();
  const mapUrl = base ? mapOpenHref(base, "telegram", row.id) : "";
  const tgUrl = telegramTgHref(row);
  const lines = [
    `💬 ${ch}`,
    body,
    `When: ${time} · ${date}`,
    `TG message id: ${row.telegram_message_id} (channel) · Map DB id: ${row.id}`,
  ];
  if (tgUrl) lines.push(`Telegram: ${tgUrl}`);
  if (mapUrl) {
    lines.push("Open this post on the map (new tab)");
    lines.push(mapUrl);
  }
  return lines.join("\n");
}

function buildTelegramSnippetHtml(row) {
  const chRaw = row.channel_username ? `@${String(row.channel_username).replace(/^@/, "")}` : "channel";
  const ch = escapeHtml(chRaw);
  const body = escapeHtml(truncate((row.text_en || row.text || "—").replace(/\s+/g, " "), 200));
  const time = escapeHtml(formatTime(row.posted_at));
  const date = escapeHtml(formatDate(row.posted_at));
  const base = appBaseUrl();
  const mapHref = base ? mapOpenHref(base, "telegram", row.id) : "";
  const tgUrl = telegramTgHref(row);
  const tgLink = tgUrl
    ? `\n<a href="${escapeHtml(tgUrl)}">Open in Telegram</a> <code>(msg ${escapeHtml(String(row.telegram_message_id))})</code>`
    : `\n<code>msg ${escapeHtml(String(row.telegram_message_id))}</code>`;
  const mapBlock = mapHref
    ? `\n<a href="${escapeHtml(mapHref)}">Open this post on the map (new tab)</a>\n<a href="${escapeHtml(mapHref)}">${escapeHtml(mapHref)}</a>`
    : `\n<code>DB ${escapeHtml(String(row.id))}</code> — set APP_URL for map link`;
  return `<b>${escapeHtml("💬 ")}${ch}</b>\n${body}\nWhen: ${time} · ${date}${tgLink}${mapBlock}`;
}

async function buildDigest(pool, redis) {
  const lastSent = await redis.get(REDIS_KEY_LAST_SENT);
  const since = lastSent || new Date(Date.now() - DIGEST_INTERVAL_MS).toISOString(); // first run: one interval back

  const { rows: events } = await pool.query(
    `SELECT id, event_type, title, description, source, occurred_at, created_at, metadata
     FROM events
     WHERE created_at > $1
     ORDER BY created_at ASC
     LIMIT $2`,
    [since, MAX_EVENTS_PER_DIGEST]
  );

  const { rows: anomalies } = await pool.query(
    `SELECT id, anomaly_type, score, baseline_value, observed_value, detected_at, created_at, metadata
     FROM anomalies
     WHERE created_at > $1
     ORDER BY created_at ASC
     LIMIT $2`,
    [since, MAX_ANOMALIES_PER_DIGEST]
  );

  let telegramPosts = [];
  try {
    const { rows } = await pool.query(
      `SELECT id, telegram_message_id, channel_username, text, text_en, posted_at, created_at
       FROM telegram_posts
       WHERE created_at > $1
       ORDER BY created_at ASC
       LIMIT $2`,
      [since, MAX_TELEGRAM_PER_DIGEST]
    );
    telegramPosts = rows;
  } catch (e) {
    const msg = e?.message || String(e);
    if (/42P01|telegram_posts/.test(msg)) {
      // Table not migrated yet — skip telegram section
    } else {
      throw e;
    }
  }

  if (events.length === 0 && anomalies.length === 0 && telegramPosts.length === 0) {
    return { text: null, html: null, maxCreated: since };
  }

  const now = new Date();
  const header = `🌍 OSINT Earth · ${formatTime(now)} · ${formatDate(now)}\n${"─".repeat(28)}`;

  const parts = [header];
  const htmlParts = [`<b>${escapeHtml(`🌍 OSINT Earth · ${formatTime(now)} · ${formatDate(now)}`)}</b>`];

  for (const row of events) {
    parts.push("\n" + buildEventSnippet(row));
    htmlParts.push("\n\n" + buildEventSnippetHtml(row));
  }

  if (telegramPosts.length > 0) {
    parts.push("\n\n💬 Telegram (geocoded posts)");
    htmlParts.push(`\n\n<b>${escapeHtml("💬 Telegram (geocoded posts)")}</b>`);
    for (const row of telegramPosts) {
      parts.push("\n" + buildTelegramSnippet(row));
      htmlParts.push("\n\n" + buildTelegramSnippetHtml(row));
    }
  }

  if (anomalies.length > 0) {
    parts.push("\n\n⚠️ Anomalies");
    htmlParts.push(`\n\n<b>${escapeHtml("⚠️ Anomalies")}</b>`);
    for (const row of anomalies) {
      parts.push("\n" + buildAnomalySnippet(row));
      htmlParts.push("\n\n" + buildAnomalySnippetHtml(row));
    }
  }

  const maxCreated = [
    ...events.map((r) => r.created_at),
    ...telegramPosts.map((r) => r.created_at),
    ...anomalies.map((r) => r.created_at),
  ].filter(Boolean).sort().pop();

  let text = parts.join("\n");
  if (!appBaseUrl()) {
    text +=
      "\n\n—\n💡 Set APP_URL in .env (e.g. http://localhost:8080, http://localhost:5173, or your public map URL) to get one-tap links for each item.";
  }
  if (text.length > 4000) {
    text = text.slice(0, 3997) + "\n…";
  }

  let html = htmlParts.join("");
  if (!appBaseUrl()) {
    html += `\n\n<i>${escapeHtml("Set APP_URL in .env for tap-to-open map links in Telegram.")}</i>`;
  }
  if (html.length > 4000) {
    html = html.slice(0, 3997) + "\n…";
  }

  return {
    text,
    html,
    maxCreated: maxCreated ? new Date(maxCreated).toISOString() : since,
    eventCount: events.length,
    anomalyCount: anomalies.length,
    telegramCount: telegramPosts.length,
    firstEventId: events[0]?.id ?? null,
    firstTelegramId: telegramPosts[0]?.id ?? null,
    firstAnomalyId: anomalies[0]?.id ?? null,
  };
}

async function sendTelegramPayload(chatId, token, payload) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      disable_web_page_preview: true,
      ...payload,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.warn("Telegram send failed:", res.status, errText);
    return false;
  }
  return true;
}

async function sendTelegramDigest(html, plain) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = (process.env.TELEGRAM_CHAT_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!token || chatIds.length === 0) return;

  for (const chatId of chatIds) {
    try {
      if (html) {
        const ok = await sendTelegramPayload(chatId, token, { text: html, parse_mode: "HTML" });
        if (ok) continue;
        console.warn("Telegram HTML digest rejected; sending plain text fallback.");
      }
      await sendTelegramPayload(chatId, token, { text: plain });
    } catch (e) {
      console.warn("Telegram send error:", e.message);
    }
  }
}

/**
 * Run one digest cycle: query DB, build message, send Telegram, update last_sent.
 */
export async function runDigest(pool, redis, io) {
  try {
    const {
      text,
      html,
      maxCreated,
      eventCount,
      anomalyCount,
      telegramCount,
      firstEventId,
      firstAnomalyId,
      firstTelegramId,
    } = await buildDigest(pool, redis);
    if (!text) return;

    await sendTelegramDigest(html, text);

    await redis.set(REDIS_KEY_LAST_SENT, maxCreated);

    const base = appBaseUrl();
    const primaryUrl =
      base &&
      (firstEventId != null
        ? mapOpenHref(base, "event", firstEventId)
        : firstTelegramId != null
          ? mapOpenHref(base, "telegram", firstTelegramId)
          : firstAnomalyId != null
            ? mapOpenHref(base, "anomaly", firstAnomalyId)
            : `${base.replace(/\/$/, "")}/`);

    if (io) {
      const bits = [`${eventCount} events`];
      if (telegramCount > 0) bits.push(`${telegramCount} Telegram`);
      bits.push(`${anomalyCount} anomalies`);
      io.emit("notifications:merged", {
        title: "OSINT Earth: Digest",
        body: bits.join(", "),
        events: { count: eventCount },
        telegram: telegramCount,
        anomalies: anomalyCount,
        primaryUrl: primaryUrl || null,
      });
    }
  } catch (e) {
    const msg = e?.message || String(e);
    console.warn("Notification digest error:", msg);
    if (/role .* does not exist/i.test(msg)) {
      console.warn(
        "Digest DB hint: POSTGRES_USER in .env must match a real PostgreSQL role. " +
          "Backend now loads ../.env like workers; if the DB was created with another user, " +
          "either set POSTGRES_USER to that role or run database/ensure_osint_role.sql as a superuser."
      );
    }
  }
}

/**
 * Start the scheduled digest. Call from index.js after server starts.
 */
export function startScheduledDigest(pool, redis, io) {
  const run = () => runDigest(pool, redis, io);
  run(); // run once on startup (will send if there are events since last run)
  setInterval(run, DIGEST_INTERVAL_MS);
}

/**
 * Legacy: ingest Redis messages for real-time count-based notifications.
 * Kept for backward compatibility; the digest is now the primary path.
 */
export function ingest(channel, data, io) {
  // No-op: digest is DB-driven. Could re-enable quick alerts if desired.
}
