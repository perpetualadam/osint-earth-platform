/**
 * Simple in-memory rate limiter.
 * Limits requests per IP to maxRequests per fixed window (reset when now >= resetAt).
 *
 * Previous bug: compared `now - resetAt > windowMs` while resetAt was `now + windowMs`, so the
 * window did not roll over for ~2× window length and bursts + polling could hit 429 quickly.
 */
const store = new Map();
const WINDOW_MS = 60 * 1000; // 1 minute
/** SPA loads many /api routes in parallel; default allows a full globe refresh + retries */
const MAX_REQUESTS = 600;

function cleanup() {
  const now = Date.now();
  for (const [key, data] of store.entries()) {
    if (now >= data.resetAt + WINDOW_MS) store.delete(key);
  }
}
setInterval(cleanup, 60 * 1000);

export function rateLimit(options = {}) {
  const windowMs = options.windowMs ?? WINDOW_MS;
  const envMax = process.env.RATE_LIMIT_MAX;
  const parsed = envMax != null && envMax !== "" ? parseInt(envMax, 10) : NaN;
  const maxFromEnv = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  const max = options.max ?? maxFromEnv ?? MAX_REQUESTS;

  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    const now = Date.now();
    let data = store.get(ip);

    if (!data || now >= data.resetAt) {
      data = { count: 0, resetAt: now + windowMs };
      store.set(ip, data);
    }
    data.count++;

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, max - data.count));

    if (data.count > max) {
      res.setHeader("Retry-After", Math.ceil((data.resetAt - now) / 1000));
      return res.status(429).json({ error: "Too many requests" });
    }
    next();
  };
}
