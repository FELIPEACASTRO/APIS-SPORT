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
    // express.json() lança erros conhecidos que merecem status apropriado
    // ao invés de virar 500 genérico:
    //   - SyntaxError / "entity.parse.failed"   → 400 (JSON malformado)
    //   - "entity.too.large"                    → 413 (payload > limite)
    if (
      err?.type === 'entity.parse.failed' ||
      (err instanceof SyntaxError && 'body' in err)
    ) {
      inc('http_errors_total', { code: '400' });
      if (res.headersSent) return;
      return res.status(400).json({
        error: 'JSON malformado',
        details: [err.message],
        request_id: req.id,
      });
    }
    if (err?.type === 'entity.too.large') {
      inc('http_errors_total', { code: '413' });
      if (res.headersSent) return;
      return res.status(413).json({
        error: 'payload muito grande',
        limit: err.limit,
        received: err.length,
        request_id: req.id,
      });
    }

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
