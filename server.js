// server.js — APIS // SPORT — production-grade entry point.
//
// Stack:
//   Express 5  +  middleware customizados (zero deps extras)
//   - request-id     atribui UUID por request (honra X-Request-ID)
//   - http-logger    logs estruturados + métricas Prometheus
//   - security       CSP, COOP, CORP, HSTS, X-Frame-Options, etc.
//   - cors           configurável via CORS_ORIGIN
//   - rate-limit     in-memory sliding window (global + /invoke)
//   - validation     schemas explícitos por endpoint
//   - error-handler  404 + 500 estruturados
//   - graceful shutdown (SIGTERM/SIGINT, drain de conexões)
//
// Endpoints:
//   GET  /api/health            health-check completo (com uptime, métricas)
//   GET  /api/live              liveness probe (sempre 200)
//   GET  /api/ready             readiness probe (200 quando catalog carregado)
//   GET  /api/metrics           Prometheus text exposition
//   GET  /api/version           build info
//   GET  /api/catalog           lista filtrada (q, subcategory, pricing, minPopularity, sort, limit)
//   GET  /api/catalog/stats     agregados
//   GET  /api/catalog/:id       uma API
//   POST /api/invoke            body validado: { apiId, endpoint?, mode?, query?, rapidApiKey? }
//   POST /api/invoke/batch      body validado: { items: [...], mode?, rapidApiKey? }
//   *                           SPA fallback (serve public/index.html)

import express from 'express';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

import { config, logConfigSummary } from './src/config.js';
import { log } from './src/logger.js';
import { inc, snapshot, toPrometheus } from './src/metrics.js';
import { registerShutdownHandlers, isShuttingDown } from './src/shutdown.js';
import { loadCatalog, filterCatalog, getApiById } from './src/catalog.js';
import { invokeApi } from './src/invoker.js';

import { requestId } from './src/middleware/request-id.js';
import { httpLogger } from './src/middleware/http-logger.js';
import { securityHeaders } from './src/middleware/security.js';
import { cors } from './src/middleware/cors.js';
import { globalLimiter, invokeLimiter } from './src/middleware/rate-limit.js';
import { validateBody, invokeSchema, invokeBatchSchema } from './src/middleware/validation.js';
import { notFound, errorHandler } from './src/middleware/error-handler.js';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version;
const INDEX_HTML = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

const BUILD_INFO = {
  version: APP_VERSION,
  catalog_source: 'RapidAPI dossiê 11/05/2026',
  catalog_total: 302,
  node_version: process.version,
  platform: process.platform,
  started_at: new Date().toISOString(),
};

// ── Carrega e valida catálogo no boot ───────────────────────────────────────
let catalogReady = false;
try {
  const { apis } = loadCatalog();
  catalogReady = true;
  log.info({ msg: 'catalog loaded', total: apis.length });
} catch (err) {
  log.error({ msg: 'failed to load catalog', error: err.message });
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
if (config.TRUST_PROXY) app.set('trust proxy', true);

// ── Pipeline de middleware ──────────────────────────────────────────────────
app.use(requestId());
app.use(securityHeaders());
app.use(cors());
app.use(httpLogger());
app.use(globalLimiter);

// Bloqueia novas requests durante shutdown (mantém /live/ready respondendo)
app.use((req, res, next) => {
  if (!isShuttingDown()) return next();
  if (req.path === '/api/live' || req.path === '/api/ready') return next();
  res.setHeader('Connection', 'close');
  res.status(503).json({ error: 'shutting down', request_id: req.id });
});

app.use(express.json({ limit: '64kb' }));

// Estáticos: cache curto + ETag para revalidação.
// Em dev (NODE_ENV !== 'production'), maxAge=0 força revalidação a cada
// request — evita JS/CSS desatualizado quando código muda. ETag permite
// 304 Not Modified barato quando nada mudou.
const STATIC_MAX_AGE = config.NODE_ENV === 'production' ? '1h' : 0;
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  maxAge: STATIC_MAX_AGE,
  setHeaders: (res, filepath) => {
    // JS modules: sempre revalidar (evita ES module graph quebrado em dev)
    if (filepath.endsWith('.js')) {
      res.setHeader('Cache-Control', config.NODE_ENV === 'production'
        ? 'public, max-age=3600, must-revalidate'
        : 'no-cache, must-revalidate');
    }
  },
}));

// ── Health / Probes ─────────────────────────────────────────────────────────
app.get('/api/live', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/api/ready', (_req, res) => {
  if (catalogReady && !isShuttingDown()) {
    return res.json({ status: 'OK', catalog_ready: true });
  }
  res.status(503).json({ status: 'NOT_READY', catalog_ready: catalogReady });
});

app.get('/api/health', (_req, res) => {
  const { meta, apis } = loadCatalog();
  res.json({
    status: 'OK',
    version: APP_VERSION,
    catalog_total: apis.length,
    catalog_generated_at: meta.generated_at,
    server_has_rapidapi_key: Boolean(config.RAPIDAPI_KEY),
    uptime_s: Math.round(process.uptime()),
    memory: {
      rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heap_used_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    },
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/version', (_req, res) => {
  res.json(BUILD_INFO);
});

app.get('/api/metrics', (_req, res) => {
  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(toPrometheus());
});

app.get('/api/metrics/json', (_req, res) => {
  res.json(snapshot());
});

// ── Catalog ─────────────────────────────────────────────────────────────────
app.get('/api/catalog', (req, res) => {
  const filters = {
    query: req.query.q,
    subcategory: req.query.subcategory,
    pricing: req.query.pricing,
    minPopularity: req.query.minPopularity !== undefined
      ? Number(req.query.minPopularity)
      : undefined,
  };
  const limit = req.query.limit ? Math.min(Number(req.query.limit), 500) : undefined;
  const sortBy = req.query.sort || 'popularity';

  let items = filterCatalog(filters);
  items.sort(makeSorter(sortBy));
  if (limit && limit > 0) items = items.slice(0, limit);

  // ETag baseado nos parâmetros + total (catálogo é estático em runtime)
  const etag = '"' + createHash('sha1')
    .update(JSON.stringify({ filters, limit, sortBy, total: items.length }))
    .digest('hex')
    .slice(0, 16) + '"';
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'public, max-age=60');
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }

  res.json({ total: items.length, filters, items });
});

app.get('/api/catalog/stats', (_req, res) => {
  const { stats, meta, apis } = loadCatalog();
  res.json({ total: apis.length, stats, generated_at: meta.generated_at });
});

app.get('/api/catalog/:id', (req, res) => {
  try {
    const api = getApiById(req.params.id);
    res.json({ api });
  } catch (err) {
    res.status(404).json({ error: err.message, request_id: req.id });
  }
});

// ── Invoke ──────────────────────────────────────────────────────────────────
app.post('/api/invoke', invokeLimiter, validateBody(invokeSchema), async (req, res) => {
  const { apiId, endpoint, mode, query, rapidApiKey } = req.validBody;
  const result = await invokeApi({
    apiId,
    endpoint,
    mode,
    query,
    rapidApiKey: rapidApiKey || config.RAPIDAPI_KEY,
  });
  inc('invoke_total', { mode: result.mode, ok: String(result.ok) });
  const httpStatus =
    result.ok ? 200 :
    result.status >= 400 ? result.status :
    502;
  res.status(httpStatus).json({ ...result, request_id: req.id });
});

app.post('/api/invoke/batch', invokeLimiter, validateBody(invokeBatchSchema), async (req, res) => {
  const { items, mode, rapidApiKey } = req.validBody;
  const key = rapidApiKey || config.RAPIDAPI_KEY;

  // Para evitar sobrecarga do upstream em modo real, limitamos a 10 calls
  // simultâneas. Mock é local — concorrência irrelevante.
  const CONCURRENCY = 10;
  const results = new Array(items.length);
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const chunk = items.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map((item) =>
        invokeApi({
          apiId: item.apiId,
          endpoint: item.endpoint,
          mode: item.mode || mode,
          query: item.query,
          rapidApiKey: key,
        }),
      ),
    );
    for (let j = 0; j < chunkResults.length; j++) results[i + j] = chunkResults[j];
  }

  for (const r of results) inc('invoke_total', { mode: r.mode, ok: String(r.ok) });
  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.length - succeeded;
  res.status(failed === 0 ? 200 : 207).json({
    total: results.length,
    succeeded,
    failed,
    request_id: req.id,
    results,
  });
});

// ── SPA fallback (GET fora de /api/*) ───────────────────────────────────────
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
  res.type('html').send(INDEX_HTML);
});

// ── 404 e error handler globais ─────────────────────────────────────────────
app.use(notFound());
app.use(errorHandler());

// ── Sorter ──────────────────────────────────────────────────────────────────
function makeSorter(sortBy) {
  switch (sortBy) {
    case 'name':       return (a, b) => a.name.localeCompare(b.name);
    case 'latency':    return (a, b) => (a.latency_ms || 1e9) - (b.latency_ms || 1e9);
    case 'success':    return (a, b) => b.success_rate_pct - a.success_rate_pct;
    case 'popularity':
    default:           return (a, b) => b.popularity - a.popularity || a.id - b.id;
  }
}

// ── Boot ────────────────────────────────────────────────────────────────────
const isEntryPoint = (() => {
  try { return path.resolve(process.argv[1] || '') === __filename; }
  catch { return false; }
})();

if (isEntryPoint) {
  logConfigSummary(log);
  const server = app.listen(config.PORT, config.HOST, () => {
    log.info({
      msg: 'server listening',
      url: `http://${config.HOST}:${config.PORT}`,
      version: APP_VERSION,
      pid: process.pid,
    });
  });
  // Keep-alive / headers timeout — evita socket leak atrás de LB
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  registerShutdownHandlers(server, log, async () => {
    log.info({ msg: 'graceful shutdown started' });
  });
}

export default app;
