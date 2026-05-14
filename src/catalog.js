// src/catalog.js
// Carrega, valida e indexa as 302 APIs do dossiê. SRP: leitura + indexação.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const CATALOG_DIR = path.resolve(__dirname, '..', 'data', 'bets-apis');
const PART_FILES = ['catalog.json', 'catalog-part2.json', 'catalog-part3.json'];

/**
 * @typedef {Object} BetApi
 * @property {number} id
 * @property {string} name
 * @property {string} subcategory
 * @property {string} provider
 * @property {'Freemium'|'Gratuito'|'Pago'} pricing
 * @property {number} popularity
 * @property {number} latency_ms
 * @property {number} success_rate_pct
 * @property {string} rapidapi_url
 * @property {string} rapidapi_host
 * @property {string} description
 */

let cache = null;

/** Carrega o catálogo completo (302 APIs) com cache em memória. */
export function loadCatalog() {
  if (cache) return cache;

  const all = [];
  for (const filename of PART_FILES) {
    const filepath = path.join(CATALOG_DIR, filename);
    const raw = fs.readFileSync(filepath, 'utf8');
    const json = JSON.parse(raw);
    if (!Array.isArray(json.apis)) {
      throw new Error(`Arquivo malformado: ${filename}`);
    }
    all.push(...json.apis);
  }

  // Indexação por id e host para acesso O(1)
  const byId = new Map(all.map((api) => [api.id, api]));
  const byHost = new Map(all.map((api) => [api.rapidapi_host, api]));

  // Estatísticas agregadas
  const stats = buildStats(all);

  cache = {
    apis: all,
    byId,
    byHost,
    stats,
    meta: {
      total: all.length,
      generated_at: new Date().toISOString(),
    },
  };
  return cache;
}

function buildStats(apis) {
  const bySubcategory = {};
  const byPricing = {};
  const byProvider = {};
  for (const api of apis) {
    bySubcategory[api.subcategory] = (bySubcategory[api.subcategory] || 0) + 1;
    byPricing[api.pricing] = (byPricing[api.pricing] || 0) + 1;
    byProvider[api.provider || '(sem provedor)'] =
      (byProvider[api.provider || '(sem provedor)'] || 0) + 1;
  }

  // Top 10 provedores por contagem de APIs
  const topProviders = Object.entries(byProvider)
    .filter(([k]) => k !== '(sem provedor)')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  // Histograma de popularidade em 10 bins (0–10)
  const popularityHistogram = Array.from({ length: 10 }, (_, i) => ({
    bin: `${i}-${i + 1}`,
    range: [i, i + 1],
    count: 0,
  }));
  for (const api of apis) {
    const idx = Math.min(Math.floor(api.popularity), 9);
    popularityHistogram[idx].count++;
  }

  // Top 10 APIs por popularidade
  const topByPopularity = [...apis]
    .sort((a, b) => b.popularity - a.popularity || a.id - b.id)
    .slice(0, 10)
    .map((a) => ({
      id: a.id,
      name: a.name,
      subcategory: a.subcategory,
      pricing: a.pricing,
      popularity: a.popularity,
      latency_ms: a.latency_ms,
      success_rate_pct: a.success_rate_pct,
    }));

  // Percentis de latency e success_rate
  const latencies = apis.map((a) => a.latency_ms).sort((a, b) => a - b);
  const successes = apis.map((a) => a.success_rate_pct).sort((a, b) => a - b);
  const percentile = (arr, p) => arr[Math.floor((arr.length - 1) * p)];

  // Scatter data para latency × success (com pop como tamanho)
  const scatter = apis
    .filter((a) => a.latency_ms > 0 && a.success_rate_pct > 0)
    .map((a) => ({
      id: a.id,
      name: a.name,
      x: Math.min(a.latency_ms, 10_000), // capa em 10s para visualização
      y: a.success_rate_pct,
      r: a.popularity,
    }));

  // % de APIs sem telemetria (popularity===0)
  const noTelemetry = apis.filter((a) => a.popularity === 0).length;

  return {
    bySubcategory,
    byPricing,
    providers_unique: Object.keys(byProvider).length,
    top_providers: topProviders,
    top_by_popularity: topByPopularity,
    popularity_histogram: popularityHistogram,
    latency: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99),
      max: latencies[latencies.length - 1],
      mean: Math.round(latencies.reduce((s, n) => s + n, 0) / latencies.length),
    },
    success_rate: {
      p50: percentile(successes, 0.5),
      mean: +(successes.reduce((s, n) => s + n, 0) / successes.length).toFixed(1),
      with_100: apis.filter((a) => a.success_rate_pct === 100).length,
      with_zero: apis.filter((a) => a.success_rate_pct === 0).length,
    },
    no_telemetry: noTelemetry,
    no_telemetry_pct: +((noTelemetry / apis.length) * 100).toFixed(1),
    scatter,
  };
}

/** Filtra o catálogo com critérios opcionais.
 *  A busca textual cobre name + provider + description + rapidapi_host. */
export function filterCatalog({ query, subcategory, pricing, minPopularity } = {}) {
  const { apis } = loadCatalog();
  const q = (query || '').toLowerCase().trim();

  return apis.filter((api) => {
    if (q) {
      const blob = `${api.name} ${api.provider} ${api.description} ${api.rapidapi_host}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    if (subcategory && api.subcategory !== subcategory) return false;
    if (pricing && api.pricing !== pricing) return false;
    if (typeof minPopularity === 'number' && minPopularity > 0 && api.popularity < minPopularity) return false;
    return true;
  });
}

/** Obtém uma API pelo id (lança se não existir). */
export function getApiById(id) {
  const { byId } = loadCatalog();
  const api = byId.get(Number(id));
  if (!api) throw new Error(`API id=${id} não encontrada no catálogo`);
  return api;
}

/** Valida estrutura mínima de uma entrada do catálogo. */
export function validateApiShape(api) {
  const required = [
    'id',
    'name',
    'subcategory',
    'pricing',
    'rapidapi_url',
    'rapidapi_host',
  ];
  for (const field of required) {
    if (api[field] === undefined || api[field] === null) {
      return { ok: false, field, reason: `campo "${field}" ausente` };
    }
  }
  if (!/^[a-z0-9_-]+\.p\.rapidapi\.com$/i.test(api.rapidapi_host)) {
    return { ok: false, field: 'rapidapi_host', reason: 'host fora do padrão *.p.rapidapi.com' };
  }
  return { ok: true };
}
