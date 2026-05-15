// tests/server.test.mjs
// Smoke tests do servidor Express via supertest-like usando http.request nativo.
// Garante que as rotas estão expostas e que o batch funciona com 302 APIs.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// Desabilita rate-limit nos testes para não atrapalhar cenários paralelos
process.env.RATE_LIMIT_ENABLED = 'false';
process.env.LOG_LEVEL = 'silent';
process.env.NODE_ENV = 'test';

const app = (await import('../server.js')).default;

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

function request(method, path, body, extraHeaders = {}) {
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
          ...extraHeaders,
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

// ── v3.2.0 — production-grade ──────────────────────────────────────────────
test('GET /api/live retorna 200', async () => {
  const r = await request('GET', '/api/live');
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'OK');
});

test('GET /api/ready retorna 200 com catalog_ready=true', async () => {
  const r = await request('GET', '/api/ready');
  assert.equal(r.status, 200);
  assert.equal(r.body.catalog_ready, true);
});

test('GET /api/version expõe build info', async () => {
  const r = await request('GET', '/api/version');
  assert.equal(r.status, 200);
  assert.equal(r.body.catalog_total, 302);
  assert.ok(r.body.version);
});

test('GET /api/metrics retorna texto Prometheus', async () => {
  const r = await request('GET', '/api/metrics');
  assert.equal(r.status, 200);
  assert.ok(/app_uptime_seconds\s+\d+/.test(r.body), 'sem app_uptime_seconds');
});

test('GET /api/metrics/json retorna snapshot', async () => {
  const r = await request('GET', '/api/metrics/json');
  assert.equal(r.status, 200);
  assert.ok('uptime_s' in r.body);
  assert.ok('counters' in r.body);
});

test('Request ID é gerado se não vier do cliente', async () => {
  const r = await request('GET', '/api/health');
  assert.ok(r.headers['x-request-id']);
  assert.match(r.headers['x-request-id'], /^[\w-]+$/);
});

test('Request ID do cliente é preservado', async () => {
  const r = await new Promise((resolve, reject) => {
    const url = new URL('/api/health', baseUrl);
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname, method: 'GET',
        headers: { 'x-request-id': 'meu-id-123' } },
      (res) => { let b=''; res.on('data', c => b+=c); res.on('end', () => resolve({headers:res.headers,body:JSON.parse(b)})); }
    );
    req.on('error', reject); req.end();
  });
  assert.equal(r.headers['x-request-id'], 'meu-id-123');
});

test('Security headers presentes (CSP, X-Frame-Options, etc.)', async () => {
  const r = await request('GET', '/api/health');
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal(r.headers['x-frame-options'], 'DENY');
  assert.equal(r.headers['referrer-policy'], 'no-referrer');
  assert.ok(r.headers['content-security-policy']);
  assert.ok(r.headers['strict-transport-security']);
});

test('CORS preflight OPTIONS responde 204', async () => {
  const r = await request('OPTIONS', '/api/catalog');
  assert.equal(r.status, 204);
});

test('CORS preflight permite headers de autenticação documentados', async () => {
  const r = await request('OPTIONS', '/api/invoke', null, {
    origin: 'http://localhost:3000',
    'access-control-request-method': 'POST',
    'access-control-request-headers': 'content-type, authorization, x-invoke-token, x-metrics-token',
  });
  assert.equal(r.status, 204);
  const allowed = r.headers['access-control-allow-headers'].toLowerCase();
  assert.match(allowed, /authorization/);
  assert.match(allowed, /x-invoke-token/);
  assert.match(allowed, /x-metrics-token/);
});

test('Validation: apiId não numérico retorna 400 estruturado', async () => {
  const r = await request('POST', '/api/invoke', { apiId: 'abc' });
  assert.equal(r.status, 400);
  assert.ok(Array.isArray(r.body.details));
});

test('Validation: mode inválido retorna 400', async () => {
  const r = await request('POST', '/api/invoke', { apiId: 1, mode: 'fake' });
  assert.equal(r.status, 400);
});



test('Validation: endpoint absoluto é rejeitado', async () => {
  const r = await request('POST', '/api/invoke', { apiId: 1, endpoint: 'https://evil.example/path' });
  assert.equal(r.status, 400);
  assert.ok(r.body.details.some((d) => /relativo|absoluta/i.test(d)));
});

test('Request ID inválido do cliente é substituído por UUID seguro', async () => {
  const r = await new Promise((resolve, reject) => {
    const url = new URL('/api/health', baseUrl);
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname, method: 'GET',
        headers: { 'x-request-id': 'id inválido com espaço' } },
      (res) => { let b=''; res.on('data', c => b+=c); res.on('end', () => resolve({headers:res.headers,body:JSON.parse(b)})); }
    );
    req.on('error', reject); req.end();
  });
  assert.notEqual(r.headers['x-request-id'], 'id inválido com espaço');
  assert.match(r.headers['x-request-id'], /^[A-Za-z0-9._:-]+$/);
});

test('POST /api/log-error rejeita payload vazio', async () => {
  const r = await request('POST', '/api/log-error', {});
  assert.equal(r.status, 400);
  assert.match(r.body.error, /vazio/);
});

test('Validation: batch com item inválido retorna 400 com detalhes', async () => {
  const r = await request('POST', '/api/invoke/batch', {
    items: [{ apiId: 1 }, { apiId: 'x' }],
  });
  assert.equal(r.status, 400);
  assert.ok(r.body.details.some((d) => /items\[1\]/.test(d)));
});

test('404 em /api/* retorna JSON estruturado com request_id', async () => {
  const r = await request('GET', '/api/inexistente');
  assert.equal(r.status, 404);
  assert.ok(r.body.error);
  assert.ok(r.body.request_id);
});

// ── Regressões da auditoria produção 2026-05-14 ────────────────────────────
test('REGRESSÃO: JSON malformado retorna 400 (não 500)', async () => {
  // Envia JSON sintaticamente quebrado
  const r = await rawRequest('POST', '/api/invoke', '{"apiId":1,"mode":INVALID}', {
    'content-type': 'application/json',
  });
  assert.equal(r.status, 400, 'JSON inválido deve ser 400, não 500');
  assert.match(r.body.error, /JSON malformado/);
  assert.ok(r.body.request_id);
});

test('REGRESSÃO: body > 64kb retorna 413 (não 500)', async () => {
  const huge = '{"apiId":1,"endpoint":"' + 'x'.repeat(80_000) + '"}';
  const r = await rawRequest('POST', '/api/invoke', huge, {
    'content-type': 'application/json',
  });
  assert.equal(r.status, 413, 'body grande deve ser 413');
  assert.match(r.body.error, /payload muito grande/);
});

// Helper raw que não força JSON.stringify no body — para testar
// erros de parse.
function rawRequest(method, path, rawBody, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const data = Buffer.from(rawBody);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: { 'content-length': data.length, ...extraHeaders },
      },
      (res) => {
        let chunks = '';
        res.on('data', (c) => (chunks += c));
        res.on('end', () => {
          const isJson = (res.headers['content-type'] || '').includes('application/json');
          let parsed = chunks || null;
          if (isJson && chunks) {
            try { parsed = JSON.parse(chunks); } catch { /* keep raw */ }
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}
