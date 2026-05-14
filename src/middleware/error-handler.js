// src/middleware/error-handler.js
// 404 + handler global de erros. Sempre devolve JSON estruturado em /api/*.

import { log } from '../logger.js';
import { inc } from '../metrics.js';

export function notFound() {
  return (req, res, next) => {
    if (!req.path.startsWith('/api/')) return next();
    inc('http_errors_total', { code: '404' });
    res.status(404).json({
      error: 'rota não encontrada',
      path: req.path,
      request_id: req.id,
    });
  };
}

export function errorHandler() {
  // 4 args = Express trata como error middleware
  return (err, req, res, _next) => {
    inc('http_errors_total', { code: '500' });
    log.error({
      msg: 'unhandled error',
      req_id: req.id,
      path: req.path,
      error: err.message,
      stack: err.stack,
    });
    if (res.headersSent) return;
    res.status(500).json({
      error: 'erro interno',
      request_id: req.id,
    });
  };
}
