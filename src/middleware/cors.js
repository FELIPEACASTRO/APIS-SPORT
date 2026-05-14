// src/middleware/cors.js
// CORS configurável via CORS_ORIGIN (* ou lista separada por vírgula).

import { config } from '../config.js';

const ALLOWED = config.CORS_ORIGIN === '*'
  ? '*'
  : config.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);

export function cors() {
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (ALLOWED === '*') {
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (origin && ALLOWED.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    if (config.CORS_CREDENTIALS) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, X-Request-ID, X-RapidAPI-Key',
    );
    res.setHeader('Access-Control-Max-Age', '600');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      return res.end();
    }
    next();
  };
}
