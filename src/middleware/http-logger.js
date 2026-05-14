// src/middleware/http-logger.js
// Loga cada request HTTP no fim (status + duração) e atualiza métricas.

import { log } from '../logger.js';
import { inc, observe } from '../metrics.js';

export function httpLogger() {
  return (req, res, next) => {
    const t0 = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - t0;
      const route = req.route?.path || normalize(req.path);
      const labels = {
        method: req.method,
        route,
        status: String(res.statusCode),
      };
      inc('http_requests_total', labels);
      observe('http_request_duration_ms', { method: req.method, route }, ms);

      const entry = {
        msg: 'http',
        req_id: req.id,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        ms,
        ip: clientIp(req),
        ua: (req.headers['user-agent'] || '').slice(0, 100),
      };
      if (res.statusCode >= 500) log.error(entry);
      else if (res.statusCode >= 400) log.warn(entry);
      else log.info(entry);
    });
    next();
  };
}

// Normalização para evitar explosão de cardinalidade no Prometheus.
// /api/catalog/123 → /api/catalog/:id
// /api/foo/42/bar  → /api/foo/:id/bar
function normalize(path) {
  return path.replace(/\/(\d+)(?=\/|$)/g, '/:id');
}

export function clientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}
