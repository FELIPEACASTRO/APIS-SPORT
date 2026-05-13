// src/invoker.js
// Camada que faz a "chamada" propriamente dita.
//
// Dois modos:
//   - mock: retorna resposta determinística sem rede (sempre disponível)
//   - real: faz proxy para o RapidAPI usando RAPIDAPI_KEY do .env
//
// SRP estrito: este módulo NÃO conhece HTTP/Express. Recebe descritor da chamada
// e retorna um Promise<InvokeResult>. Plugável.

import { getApiById } from './catalog.js';
import { mockResponseFor } from './mock.js';

/**
 * @typedef {Object} InvokeRequest
 * @property {number} apiId
 * @property {string} [endpoint]   ex: '/v1/sports'
 * @property {'mock'|'real'} [mode]
 * @property {Record<string,string>} [query]
 * @property {string} [rapidApiKey]
 *
 * @typedef {Object} InvokeResult
 * @property {boolean} ok
 * @property {number} api_id
 * @property {string} api_name
 * @property {string} rapidapi_host
 * @property {string} endpoint
 * @property {'mock'|'real'} mode
 * @property {number} status
 * @property {number} duration_ms
 * @property {any} data
 * @property {string} [error]
 */

const DEFAULT_TIMEOUT_MS = 10_000;

/** @param {InvokeRequest} req */
export async function invokeApi(req) {
  const started = Date.now();
  const api = getApiById(req.apiId);
  const endpoint = normalizeEndpoint(req.endpoint || '/');
  const mode = decideMode(req);

  try {
    if (mode === 'mock') {
      const data = mockResponseFor(api, endpoint);
      return buildResult({ api, endpoint, mode, status: 200, data, started, ok: true });
    }
    return await invokeReal({ api, endpoint, req, started });
  } catch (err) {
    return buildResult({
      api,
      endpoint,
      mode,
      status: 0,
      data: null,
      started,
      ok: false,
      error: err?.message || String(err),
    });
  }
}

function decideMode(req) {
  if (req.mode === 'real') return 'real';
  if (req.mode === 'mock') return 'mock';
  // auto: real só se houver chave
  return req.rapidApiKey ? 'real' : 'mock';
}

function normalizeEndpoint(ep) {
  if (!ep) return '/';
  return ep.startsWith('/') ? ep : `/${ep}`;
}

async function invokeReal({ api, endpoint, req, started }) {
  if (!req.rapidApiKey) {
    throw new Error('Modo real requer rapidApiKey ou RAPIDAPI_KEY no servidor');
  }
  const url = new URL(`https://${api.rapidapi_host}${endpoint}`);
  for (const [k, v] of Object.entries(req.query || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': req.rapidApiKey,
        'X-RapidAPI-Host': api.rapidapi_host,
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { _raw: text.slice(0, 2000) };
    }
    return buildResult({
      api,
      endpoint,
      mode: 'real',
      status: response.status,
      data,
      started,
      ok: response.ok,
    });
  } finally {
    clearTimeout(timer);
  }
}

function buildResult({ api, endpoint, mode, status, data, started, ok, error }) {
  return {
    ok: ok && status >= 200 && status < 400,
    api_id: api.id,
    api_name: api.name,
    rapidapi_host: api.rapidapi_host,
    endpoint,
    mode,
    status,
    duration_ms: Date.now() - started,
    data,
    error,
  };
}
