// src/middleware/rate-limit.js
// Rate limiter in-memory por IP, sliding window simples.
// Suficiente para single-instance. Para multi-instância, usar Redis.

import { config } from '../config.js';
import { clientIp } from './http-logger.js';
import { inc } from '../metrics.js';

function createLimiter({ windowMs, max, label = 'global' }) {
  const buckets = new Map(); // ip -> { count, resetAt }

  // GC oportunista a cada 60s
  const gcInterval = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
  }, 60_000);
  gcInterval.unref();

  return (req, res, next) => {
    if (!config.RATE_LIMIT_ENABLED) return next();
    const ip = clientIp(req);
    const now = Date.now();
    let entry = buckets.get(ip);
    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(ip, entry);
    }
    entry.count += 1;

    const remaining = Math.max(0, max - entry.count);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      inc('rate_limit_blocked_total', { limiter: label });
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'rate limit excedido',
        retry_after_s: retryAfter,
        limit: max,
        window_ms: windowMs,
      });
    }
    next();
  };
}

export const globalLimiter = createLimiter({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  label: 'global',
});

export const invokeLimiter = createLimiter({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_INVOKE_MAX,
  label: 'invoke',
});
