// src/middleware/request-id.js
// Atribui um ID único a cada request. Honra X-Request-ID se presente.

import { randomUUID } from 'node:crypto';

export function requestId() {
  return (req, res, next) => {
    const incoming = req.headers['x-request-id'];
    const isValid = typeof incoming === 'string' &&
      incoming.length <= 64 &&
      /^[A-Za-z0-9._:-]+$/.test(incoming);
    req.id = isValid ? incoming : randomUUID();
    res.setHeader('X-Request-ID', req.id);
    next();
  };
}
