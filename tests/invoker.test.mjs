// tests/invoker.test.mjs
// Testa o engine de invocação em modo MOCK (sem rede) para garantir que
// TODAS AS 302 CHAMADAS ESTÃO IMPLEMENTADAS E FUNCIONAM end-to-end.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadCatalog, getApiById } from '../src/catalog.js';
import { invokeApi } from '../src/invoker.js';
import { mockResponseFor } from '../src/mock.js';

test('invokeApi em modo mock devolve ok para uma única API', async () => {
  const r = await invokeApi({ apiId: 1, endpoint: '/v1/sports', mode: 'mock' });
  assert.equal(r.ok, true);
  assert.equal(r.api_id, 1);
  assert.equal(r.mode, 'mock');
  assert.equal(r.status, 200);
  assert.ok(r.duration_ms >= 0);
  assert.ok(r.data, 'data deveria existir');
  assert.equal(r.data._mock, true);
});

test('invokeApi sem mode e sem key cai em mock automaticamente', async () => {
  const r = await invokeApi({ apiId: 23, endpoint: '/v1/sports' });
  assert.equal(r.mode, 'mock');
  assert.equal(r.ok, true);
});

test('invokeApi em mode=real sem chave reporta erro mas não crasha', async () => {
  const r = await invokeApi({ apiId: 1, mode: 'real' });
  assert.equal(r.ok, false);
  assert.equal(r.mode, 'real');
  assert.match(r.error || '', /chave|key/i);
});

test('invokeApi propaga endpoint normalizado (com barra inicial)', async () => {
  const r = await invokeApi({ apiId: 10, endpoint: 'odds', mode: 'mock' });
  assert.equal(r.endpoint, '/odds');
});

test('mockResponseFor produz schema coerente com a subcategoria', () => {
  const { apis } = loadCatalog();

  const oddsApi = apis.find((a) => a.subcategory === 'Odds');
  const oddsRes = mockResponseFor(oddsApi);
  assert.ok(Array.isArray(oddsRes.events), 'Odds → events[]');

  const predApi = apis.find((a) => a.subcategory === 'Predicao');
  const predRes = mockResponseFor(predApi);
  assert.ok(Array.isArray(predRes.predictions), 'Predicao → predictions[]');

  const bookApi = apis.find((a) => a.subcategory === 'Casas de Apostas');
  const bookRes = mockResponseFor(bookApi);
  assert.ok(Array.isArray(bookRes.bookmakers), 'Casas de Apostas → bookmakers[]');
});

// ---------------------------------------------------------------------------
// O TESTE-CHAVE: TODAS as 302 APIs respondem em modo mock
// ---------------------------------------------------------------------------
test('TODAS as 302 APIs respondem em modo mock (chamada end-to-end)', async () => {
  const { apis } = loadCatalog();
  assert.equal(apis.length, 302);

  const results = await Promise.all(
    apis.map((api) =>
      invokeApi({ apiId: api.id, endpoint: '/', mode: 'mock' }),
    ),
  );

  // Todas devem ter ok=true em mock
  const failures = results.filter((r) => !r.ok);
  assert.equal(
    failures.length,
    0,
    `${failures.length} APIs falharam: ${failures.slice(0, 5).map((f) => `#${f.api_id} ${f.error}`).join(' / ')}`,
  );

  // Cada resultado deve preservar o host correto
  for (const r of results) {
    const api = getApiById(r.api_id);
    assert.equal(r.rapidapi_host, api.rapidapi_host, `host divergente em #${r.api_id}`);
    assert.equal(r.api_name, api.name, `nome divergente em #${r.api_id}`);
    assert.equal(r.endpoint, '/');
    assert.equal(r.status, 200);
    assert.ok(r.data, `data ausente em #${r.api_id}`);
    assert.equal(r.data._mock, true);
  }
});


test('invokeApi com apiId inexistente retorna erro estruturado 404', async () => {
  const r = await invokeApi({ apiId: 99999, mode: 'mock' });
  assert.equal(r.ok, false);
  assert.equal(r.status, 404);
  assert.match(r.error, /não encontrada/);
});
