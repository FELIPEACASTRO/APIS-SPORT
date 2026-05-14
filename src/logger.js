// src/logger.js
// Logger leve com níveis e dois formatos (pretty/json). Zero deps.
// Pino-like API mínima. Filtra chaves sensíveis (RAPIDAPI_KEY, authorization).

import { config } from './config.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };
const CURRENT_LEVEL = LEVELS[config.LOG_LEVEL] ?? LEVELS.info;
const FMT = config.LOG_FORMAT;

const REDACT = new Set(['rapidApiKey', 'rapidapi-key', 'x-rapidapi-key', 'authorization', 'cookie']);

function redact(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (REDACT.has(k.toLowerCase())) out[k] = '[REDACTED]';
    else if (typeof v === 'object') out[k] = redact(v);
    else out[k] = v;
  }
  return out;
}

function emit(level, data) {
  if (LEVELS[level] < CURRENT_LEVEL) return;
  const safe = redact(data);
  if (FMT === 'json') {
    console.log(JSON.stringify({ level, time: new Date().toISOString(), ...safe }));
    return;
  }
  // pretty
  const ts = new Date().toISOString();
  const tag = {
    debug: '\x1b[90m[DEBUG]\x1b[0m',
    info:  '\x1b[36m[INFO ]\x1b[0m',
    warn:  '\x1b[33m[WARN ]\x1b[0m',
    error: '\x1b[31m[ERROR]\x1b[0m',
  }[level] || level.toUpperCase();
  const msg = safe.msg || '';
  const rest = { ...safe }; delete rest.msg;
  const restStr = Object.keys(rest).length ? ' ' + JSON.stringify(rest) : '';
  const line = `${ts} ${tag} ${msg}${restStr}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (data) => emit('debug', typeof data === 'string' ? { msg: data } : data),
  info:  (data) => emit('info',  typeof data === 'string' ? { msg: data } : data),
  warn:  (data) => emit('warn',  typeof data === 'string' ? { msg: data } : data),
  error: (data) => emit('error', typeof data === 'string' ? { msg: data } : data),
  child(bindings) {
    return {
      debug: (d) => log.debug({ ...bindings, ...(typeof d === 'string' ? { msg: d } : d) }),
      info:  (d) => log.info({  ...bindings, ...(typeof d === 'string' ? { msg: d } : d) }),
      warn:  (d) => log.warn({  ...bindings, ...(typeof d === 'string' ? { msg: d } : d) }),
      error: (d) => log.error({ ...bindings, ...(typeof d === 'string' ? { msg: d } : d) }),
      child: (b) => log.child({ ...bindings, ...b }),
    };
  },
};
