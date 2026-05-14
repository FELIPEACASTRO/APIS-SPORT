// src/middleware/request-id.js
// Atribui um ID único a cada request. Honra X-Request-ID se presente.

import { randomUUID } from 'node:crypto';

export function requestId() {
  return (req, res, next) => {
    const incoming = req.headers['x-request-id'];
    req.id = (typeof incoming === 'string' && incoming.length <= 64) ? incoming : randomUUID();
    res.setHeader('X-Request-ID', req.id);
    next();
  };
}
