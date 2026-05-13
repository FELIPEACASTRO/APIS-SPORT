// tests/server.test.mjs
// Smoke tests do servidor Express via supertest-like usando http.request nativo.
// Garante que as rotas estão expostas e que o batch funciona com 302 APIs.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../server.js';

let server;
let baseUrl;

before(() => {
  return new Promise((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(() => new Promise((resolve) => server.close(resolve)));

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          'content-type': 'application/json',
          'content-length': data ? data.length : 0,
        },
      },
      (res) => {
        let chunks = '';
        res.on('data', (c) => (chunks += c));
        res.on('end', () => {
          const isJson = (res.headers['content-type'] || '').includes('application/json');
          let parsed = null;
          if (chunks) {
            if (isJson) {
              try { parsed = JSON.parse(chunks); }
              catch { parsed = chunks; }
            } else {
              parsed = chunks;
            }
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsed,
          });
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

test('GET /api/health responde 200 com total=302', async () => {
  const r = await request('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'OK');
  assert.equal(r.body.catalog_total, 302);
});

test('GET /api/catalog retorna 302 itens sem filtros', async () => {
  const r = await request('GET', '/api/catalog');
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 302);
});

test('GET /api/catalog?q=pinnacle filtra resultados', async () => {
  const r = await request('GET', '/api/catalog?q=pinnacle');
  assert.equal(r.status, 200);
  assert.ok(r.body.total > 0);
  assert.ok(r.body.total < 302);
});

test('GET /api/catalog?subcategory=Odds&pricing=Freemium combina filtros', async () => {
  const r = await request('GET', '/api/catalog?subcategory=Odds&pricing=Freemium');
  assert.equal(r.status, 200);
  for (const api of r.body.items) {
    assert.equal(api.subcategory, 'Odds');
    assert.equal(api.pricing, 'Freemium');
  }
});

test('GET /api/catalog/1 retorna a Tank01 MLB', async () => {
  const r = await request('GET', '/api/catalog/1');
  assert.equal(r.status, 200);
  assert.equal(r.body.api.id, 1);
});

test('GET /api/catalog/999999 retorna 404', async () => {
  const r = await request('GET', '/api/catalog/999999');
  assert.equal(r.status, 404);
});

test('POST /api/invoke sem apiId retorna 400', async () => {
  const r = await request('POST', '/api/invoke', {});
  assert.equal(r.status, 400);
});

test('POST /api/invoke em mock retorna 200 com data._mock=true', async () => {
  const r = await request('POST', '/api/invoke', {
    apiId: 1,
    mode: 'mock',
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.data._mock, true);
});

test('POST /api/invoke/batch executa múltiplas chamadas', async () => {
  const items = [1, 2, 3, 4, 5].map((apiId) => ({ apiId, mode: 'mock' }));
  const r = await request('POST', '/api/invoke/batch', { items });
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 5);
  assert.equal(r.body.succeeded, 5);
  assert.equal(r.body.failed, 0);
});

test('POST /api/invoke/batch rejeita batch acima de 50', async () => {
  const items = Array.from({ length: 51 }, (_, i) => ({ apiId: i + 1 }));
  const r = await request('POST', '/api/invoke/batch', { items });
  assert.equal(r.status, 413);
});

// ── Regressões cobertas pela auditoria 2026-05-12 ──
test('GET / serve o HTML da SPA', async () => {
  const r = await request('GET', '/');
  assert.equal(r.status, 200);
});

test('GET de rota desconhecida cai no SPA fallback (200, não 404)', async () => {
  const r = await request('GET', '/qualquer/rota/inexistente');
  assert.equal(r.status, 200, 'SPA fallback deveria servir index.html para rotas não-API');
});

test('GET /api/inexistente NÃO cai no fallback', async () => {
  const r = await request('GET', '/api/inexistente');
  assert.equal(r.status, 404);
});

test('GET /api/catalog?q=pinnacle.p.rapidapi também busca por host', async () => {
  const r = await request('GET', '/api/catalog?q=pinnacle');
  assert.ok(r.body.total > 0);
  for (const api of r.body.items) {
    const blob = `${api.name} ${api.provider} ${api.description} ${api.rapidapi_host}`.toLowerCase();
    assert.ok(blob.includes('pinnacle'), `#${api.id} sem "pinnacle"`);
  }
});

test('GET /api/catalog?minPopularity=0 não exclui ninguém', async () => {
  const r = await request('GET', '/api/catalog?minPopularity=0');
  assert.equal(r.body.total, 302);
});

test('POST /api/invoke em mode=real sem chave devolve status 502 (erro de gateway)', async () => {
  const r = await request('POST', '/api/invoke', { apiId: 1, mode: 'real' });
  assert.equal(r.status, 502, 'sem chave, é erro de gateway local');
  assert.equal(r.body.ok, false);
  assert.match(r.body.error, /chave|key/i);
});
