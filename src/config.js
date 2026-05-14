// src/config.js
// Single source of truth para configuração da aplicação.
// Valida env vars no boot — falha rápido se algo crítico estiver errado.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// Carrega .env manualmente (zero deps). Node 20.6+ tem --env-file, mas
// queremos compat com 20.0+.
function loadDotenv() {
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadDotenv();

function num(name, def, min = 0, max = Infinity) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  const v = Number(raw);
  if (Number.isNaN(v) || v < min || v > max) {
    throw new Error(`Config inválida: ${name}=${raw} (esperado número entre ${min} e ${max})`);
  }
  return v;
}

function bool(name, def) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function str(name, def, allowed) {
  const raw = (process.env[name] || def || '').trim();
  if (allowed && !allowed.includes(raw)) {
    throw new Error(`Config inválida: ${name}=${raw} (esperado um de: ${allowed.join(', ')})`);
  }
  return raw;
}

export const config = {
  // Servidor
  PORT: num('PORT', 3000, 1, 65535),
  HOST: process.env.HOST || '0.0.0.0',
  NODE_ENV: str('NODE_ENV', 'production', ['production', 'development', 'test']),

  // RapidAPI proxy
  RAPIDAPI_KEY: process.env.RAPIDAPI_KEY || null,
  UPSTREAM_TIMEOUT_MS: num('UPSTREAM_TIMEOUT_MS', 10_000, 100, 60_000),

  // Logging
  LOG_LEVEL: str('LOG_LEVEL', 'info', ['debug', 'info', 'warn', 'error', 'silent']),
  LOG_FORMAT: str('LOG_FORMAT', 'pretty', ['pretty', 'json']),

  // CORS
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*', // ou lista separada por vírgula
  CORS_CREDENTIALS: bool('CORS_CREDENTIALS', false),

  // Rate limiting
  RATE_LIMIT_ENABLED: bool('RATE_LIMIT_ENABLED', true),
  RATE_LIMIT_WINDOW_MS: num('RATE_LIMIT_WINDOW_MS', 60_000, 1000),
  RATE_LIMIT_MAX_REQUESTS: num('RATE_LIMIT_MAX_REQUESTS', 120, 1),
  RATE_LIMIT_INVOKE_MAX: num('RATE_LIMIT_INVOKE_MAX', 30, 1),

  // QA / dev
  QA_REAL_SAMPLE: num('QA_REAL_SAMPLE', 3, 1, 50),
  TRUST_PROXY: bool('TRUST_PROXY', false),

  // Health
  SHUTDOWN_GRACE_MS: num('SHUTDOWN_GRACE_MS', 10_000, 0, 60_000),
};

export function logConfigSummary(log) {
  const summary = {
    NODE_ENV: config.NODE_ENV,
    PORT: config.PORT,
    HOST: config.HOST,
    LOG_LEVEL: config.LOG_LEVEL,
    LOG_FORMAT: config.LOG_FORMAT,
    CORS_ORIGIN: config.CORS_ORIGIN,
    RATE_LIMIT_ENABLED: config.RATE_LIMIT_ENABLED,
    rate_limits: {
      window_ms: config.RATE_LIMIT_WINDOW_MS,
      max_requests: config.RATE_LIMIT_MAX_REQUESTS,
      invoke_max: config.RATE_LIMIT_INVOKE_MAX,
    },
    upstream_timeout_ms: config.UPSTREAM_TIMEOUT_MS,
    trust_proxy: config.TRUST_PROXY,
    has_rapidapi_key: Boolean(config.RAPIDAPI_KEY),
  };
  log.info({ msg: 'config loaded', config: summary });
}
