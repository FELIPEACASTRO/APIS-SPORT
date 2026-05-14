// server.js — Express API gateway + estática SPA.
// Endpoints:
//   GET  /api/health
//   GET  /api/catalog                 (com query: q, subcategory, pricing, minPopularity, limit)
//   GET  /api/catalog/stats
//   GET  /api/catalog/:id
//   POST /api/invoke                  body: { apiId, endpoint?, mode?, query?, rapidApiKey? }
//   POST /api/invoke/batch            body: { items: [...], mode?, rapidApiKey? }

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

import { loadCatalog, filterCatalog, getApiById } from './src/catalog.js';
import { invokeApi } from './src/invoker.js';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 3000);
const SERVER_KEY = process.env.RAPIDAPI_KEY || null;

// Lemos o index.html uma vez no boot — evita custos repetidos e
// contorna problema do res.sendFile com paths Windows no Express 5.
const INDEX_HTML = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

app.disable('x-powered-by');

// Security headers — equivalentes ao helmet básico, sem dependência externa.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  next();
});

// Logging mínimo (timestamp + method + path + status + duration) — facilita
// auditoria durante homologação. Stdout estruturado, sem dep externa.
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - t0;
    const line = `${new Date().toISOString()} ${req.method.padEnd(5)} ${String(res.statusCode)} ${ms.toString().padStart(4)}ms ${req.originalUrl}`;
    if (res.statusCode >= 500) console.error(line);
    else if (process.env.LOG_LEVEL !== 'silent') console.log(line);
  });
  next();
});

app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public'), { etag: true, maxAge: '1h' }));

// ---------------------------------------------------------------------------
// Health & Version
// ---------------------------------------------------------------------------
const APP_VERSION = '2.1.0';
const BUILD_INFO = {
  version: APP_VERSION,
  catalog_source: 'RapidAPI dossiê 11/05/2026',
  catalog_total: 302,
  node_version: process.version,
  platform: process.platform,
};

app.get('/api/health', (_req, res) => {
  const { meta, apis } = loadCatalog();
  res.json({
    status: 'OK',
    version: APP_VERSION,
    catalog_total: apis.length,
    catalog_generated_at: meta.generated_at,
    server_has_rapidapi_key: Boolean(SERVER_KEY),
    uptime_s: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/version', (_req, res) => {
  res.json(BUILD_INFO);
});

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------
app.get('/api/catalog', (req, res) => {
  const filters = {
    query: req.query.q,
    subcategory: req.query.subcategory,
    pricing: req.query.pricing,
    minPopularity: req.query.minPopularity !== undefined
      ? Number(req.query.minPopularity)
      : undefined,
  };
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const sortBy = req.query.sort || 'popularity';

  let items = filterCatalog(filters);
  items.sort(makeSorter(sortBy));
  if (limit && limit > 0) items = items.slice(0, limit);

  res.json({
    total: items.length,
    filters,
    items,
  });
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
    res.status(404).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Invoke
// ---------------------------------------------------------------------------
app.post('/api/invoke', async (req, res) => {
  const { apiId, endpoint, mode, query, rapidApiKey } = req.body || {};
  if (!apiId) {
    return res.status(400).json({ error: 'apiId é obrigatório' });
  }
  const result = await invokeApi({
    apiId: Number(apiId),
    endpoint,
    mode,
    query,
    rapidApiKey: rapidApiKey || SERVER_KEY,
  });
  // Propaga status do RapidAPI (401/403/429/etc) ao invés de mascarar como 502.
  // Para erros de rede locais (result.status === 0), retornamos 502.
  const httpStatus =
    result.ok ? 200 :
    result.status >= 400 ? result.status :
    502;
  res.status(httpStatus).json(result);
});

app.post('/api/invoke/batch', async (req, res) => {
  const { items, mode, rapidApiKey } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items[] é obrigatório' });
  }
  if (items.length > 50) {
    return res.status(413).json({ error: 'máximo 50 chamadas por batch' });
  }
  const key = rapidApiKey || SERVER_KEY;
  const results = await Promise.all(
    items.map((item) =>
      invokeApi({
        apiId: Number(item.apiId),
        endpoint: item.endpoint,
        mode: item.mode || mode,
        query: item.query,
        rapidApiKey: key,
      }),
    ),
  );
  const allOk = results.every((r) => r.ok);
  res.status(allOk ? 200 : 207).json({
    total: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
});

// ---------------------------------------------------------------------------
// Fallback SPA — middleware final para qualquer GET fora de /api/*
// (Express 5 não aceita mais "*" cru em route paths)
// Usamos res.type+send para evitar problemas do sendFile com paths Windows.
// ---------------------------------------------------------------------------
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
  res.type('html').send(INDEX_HTML);
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function makeSorter(sortBy) {
  switch (sortBy) {
    case 'name':
      return (a, b) => a.name.localeCompare(b.name);
    case 'latency':
      return (a, b) => (a.latency_ms || 1e9) - (b.latency_ms || 1e9);
    case 'success':
      return (a, b) => b.success_rate_pct - a.success_rate_pct;
    case 'popularity':
    default:
      return (a, b) => b.popularity - a.popularity || a.id - b.id;
  }
}

// Boot apenas quando este arquivo é o entry point (node server.js).
// Ao ser importado (tests, scripts), NÃO abre porta — evita conflito
// e race no listen.
const isEntryPoint = (() => {
  try {
    const argvPath = path.resolve(process.argv[1] || '');
    return argvPath === __filename;
  } catch { return false; }
})();

if (isEntryPoint) {
  app.listen(PORT, () => {
    const { apis } = loadCatalog();
    console.log(`▸ APIs SPORT — terminal editorial iniciado`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`  catálogo: ${apis.length} APIs carregadas`);
    console.log(`  RAPIDAPI_KEY: ${SERVER_KEY ? 'detectada (modo real disponível)' : 'ausente (mock automático)'}`);
  });
}

export default app;
