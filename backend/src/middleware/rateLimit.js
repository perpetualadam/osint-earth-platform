/**
 * Simple in-memory rate limiter.
 * Limits requests per IP to maxRequests per windowMs.
 */
const store = new Map();
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 120; // 120 req/min per IP

function cleanup() {
  const now = Date.now();
  for (const [key, data] of store.entries()) {
    if (now - data.resetAt > WINDOW_MS) store.delete(key);
  }
}
setInterval(cleanup, 60 * 1000);

export function rateLimit(options = {}) {
  const windowMs = options.windowMs ?? WINDOW_MS;
  const max = options.max ?? MAX_REQUESTS;

  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    const now = Date.now();
    let data = store.get(ip);

    if (!data || now - data.resetAt > windowMs) {
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
