/**
 * News-feed style digest notifications.
 * Runs every 10–30 min, queries DB for new events/anomalies since last send,
 * builds rich snippets (country, summary, type, time, date), sends to Telegram.
 * Deduplicates by tracking last_sent timestamp in Redis.
 */
const DIGEST_INTERVAL_MS = parseInt(process.env.NOTIFICATION_DIGEST_MINUTES || "15", 10) * 60 * 1000;
const MAX_EVENTS_PER_DIGEST = 20;
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
  const openLine = base ? `\n🔗 Open in app: ${base}?event=${row.id}` : "";
  const headBlock = headline ? `${headline}\n` : "";
  return `📍 ${country}\n${headBlock}${summary}\nSource: ${source} · Type: ${type}\nWhen: ${time} · ${date}\nDB id: ${row.id}${openLine}`;
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
  const openLine = base ? `\n🔗 Open in app: ${base}?anomaly=${row.id}` : "";
  return `⚠️ ${type}\n${desc}\nWhen: ${time} · ${date}\nDB id: ${row.id}${openLine}`;
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

  if (events.length === 0 && anomalies.length === 0) return { text: null, maxCreated: since };

  const now = new Date();
  const header = `🌍 OSINT Earth · ${formatTime(now)} · ${formatDate(now)}\n${"─".repeat(28)}`;

  const parts = [header];

  for (const row of events) {
    parts.push("\n" + buildEventSnippet(row));
  }

  if (anomalies.length > 0) {
    parts.push("\n\n⚠️ Anomalies");
    for (const row of anomalies) {
      parts.push("\n" + buildAnomalySnippet(row));
    }
  }

  const maxCreated = [
    ...events.map((r) => r.created_at),
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

  return {
    text,
    maxCreated: maxCreated ? new Date(maxCreated).toISOString() : since,
    eventCount: events.length,
    anomalyCount: anomalies.length,
  };
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = (process.env.TELEGRAM_CHAT_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!token || chatIds.length === 0) return;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  for (const chatId of chatIds) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        }),
      });
      if (!res.ok) console.warn("Telegram send failed:", res.status, await res.text());
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
    const { text, maxCreated, eventCount, anomalyCount } = await buildDigest(pool, redis);
    if (!text) return;

    await sendTelegram(text);

    await redis.set(REDIS_KEY_LAST_SENT, maxCreated);

    if (io) {
      io.emit("notifications:merged", {
        title: "OSINT Earth: Digest",
        body: `${eventCount} events, ${anomalyCount} anomalies`,
        events: { count: eventCount },
        anomalies: anomalyCount,
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
