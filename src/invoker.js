// src/invoker.js
// Camada que faz a "chamada" propriamente dita.
//
// Dois modos:
//   - mock: retorna resposta determinística sem rede (sempre disponível)
//   - real: faz proxy para o RapidAPI usando RAPIDAPI_KEY do .env
//
// SRP estrito: este módulo NÃO conhece HTTP/Express. Recebe descritor da chamada
// e retorna um Promise<InvokeResult>. Plugável.

import { config } from './config.js';
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

/** @param {InvokeRequest} req */
export async function invokeApi(req) {
  const started = Date.now();
  let api;
  let endpoint = '/';
  let mode = 'mock';

  try {
    api = getApiById(req.apiId);
    endpoint = normalizeEndpoint(req.endpoint || '/');
    mode = decideMode(req);
    if (mode === 'mock') {
      const data = mockResponseFor(api, endpoint);
      return buildResult({ api, endpoint, mode, status: 200, data, started, ok: true });
    }
    return await invokeReal({ api, endpoint, req, started });
  } catch (err) {
    const message = err?.message || String(err);
    const status = /não encontrada|not found/i.test(message) ? 404 : 0;
    return buildResult({
      api: api || { id: Number(req.apiId) || 0, name: 'API desconhecida', rapidapi_host: '' },
      endpoint,
      mode,
      status,
      data: null,
      started,
      ok: false,
      error: message,
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
  const timer = setTimeout(() => controller.abort(), config.UPSTREAM_TIMEOUT_MS);

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
      api: api || { id: Number(req.apiId) || 0, name: 'API desconhecida', rapidapi_host: '' },
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
