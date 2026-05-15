#!/usr/bin/env node
// scripts/smoke-test.mjs
// SMOKE TEST end-to-end para HOMOLOGAÇÃO.
//
// Sobe o servidor numa porta livre, exercita o pipeline completo
// (HTTP + estáticos + APIs internas) e emite PASS/FAIL claro.
//
// Não exige nenhuma dependência externa. Usado pelo cliente em homologação
// como prova viva de que a aplicação está executável e funcional.

import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = Number(process.env.SMOKE_PORT || 4900);
const JSON_OUT = process.argv.includes('--json');

const cases = [];
let serverProc;

// ── 1) sobe o servidor ──────────────────────────────────────────────────────
async function startServer() {
  serverProc = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      LOG_LEVEL: 'silent',
      RATE_LIMIT_ENABLED: 'true',          // queremos validar os headers
      RATE_LIMIT_MAX_REQUESTS: '10000',    // muito alto p/ não interferir
      RATE_LIMIT_INVOKE_MAX: '10000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Polling em /api/live até responder ou estourar timeout
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const r = await req('GET', '/api/live');
      if (r.status === 200) return;
    } catch {
      // ainda subindo
    }
    await sleep(80);
  }
  throw new Error('Timeout subindo servidor (>5s sem responder em /api/live)');
}

function stopServer() {
  if (serverProc && !serverProc.killed) serverProc.kill('SIGTERM');
}

// ── 2) cliente HTTP leve ────────────────────────────────────────────────────
function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const r = http.request(
      {
        host: '127.0.0.1', port: PORT, path, method,
        headers: { 'content-type': 'application/json', 'content-length': data?.length || 0 },
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          const isJson = (res.headers['content-type'] || '').includes('application/json');
          let parsed = buf;
          if (isJson && buf) { try { parsed = JSON.parse(buf); } catch {} }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      },
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

// ── 3) runner ───────────────────────────────────────────────────────────────
async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    cases.push({ name, status: 'pass', ms: Date.now() - t0 });
    if (!JSON_OUT) log.pass(name, Date.now() - t0);
  } catch (err) {
    cases.push({ name, status: 'fail', ms: Date.now() - t0, error: err.message });
    if (!JSON_OUT) log.fail(name, err.message, Date.now() - t0);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ── 4) cenários ─────────────────────────────────────────────────────────────
async function runAll() {
  await step('GET /api/health responde 200 com catalog_total=302', async () => {
    const r = await req('GET', '/api/health');
    assert(r.status === 200, `status ${r.status}`);
    assert(r.body.catalog_total === 302, `catalog_total=${r.body.catalog_total}`);
  });

  await step('GET /api/version expõe build info', async () => {
    const r = await req('GET', '/api/version');
    assert(r.status === 200);
    assert(typeof r.body.version === 'string');
    assert(r.body.catalog_total === 302);
  });

  await step('GET /api/catalog retorna 302 itens', async () => {
    const r = await req('GET', '/api/catalog');
    assert(r.status === 200);
    assert(r.body.total === 302, `total=${r.body.total}`);
  });

  await step('GET /api/catalog?q=pinnacle filtra subset', async () => {
    const r = await req('GET', '/api/catalog?q=pinnacle');
    assert(r.body.total > 0 && r.body.total < 302, `total=${r.body.total}`);
  });

  await step('GET /api/catalog?subcategory=Odds&pricing=Freemium combina', async () => {
    const r = await req('GET', '/api/catalog?subcategory=Odds&pricing=Freemium');
    for (const a of r.body.items) {
      assert(a.subcategory === 'Odds');
      assert(a.pricing === 'Freemium');
    }
  });

  await step('GET /api/catalog/1 retorna Tank01 MLB', async () => {
    const r = await req('GET', '/api/catalog/1');
    assert(r.body.api.id === 1);
    assert(r.body.api.name.includes('Tank01 MLB'));
  });

  await step('GET /api/catalog/999999 → 404', async () => {
    const r = await req('GET', '/api/catalog/999999');
    assert(r.status === 404);
  });

  await step('GET /api/catalog/stats devolve 8 subcategorias', async () => {
    const r = await req('GET', '/api/catalog/stats');
    assert(Object.keys(r.body.stats.bySubcategory).length === 8);
  });

  await step('POST /api/invoke mock retorna ok=true', async () => {
    const r = await req('POST', '/api/invoke', { apiId: 1, mode: 'mock' });
    assert(r.status === 200);
    assert(r.body.ok === true);
    assert(r.body.data._mock === true);
  });

  await step('POST /api/invoke real sem chave → 502', async () => {
    const r = await req('POST', '/api/invoke', { apiId: 1, mode: 'real' });
    assert(r.status === 502, `status=${r.status}`);
    assert(/chave|key/i.test(r.body.error));
  });

  await step('POST /api/invoke/batch (10 chamadas mock) → 10/10 ok', async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ apiId: i + 1, mode: 'mock' }));
    const r = await req('POST', '/api/invoke/batch', { items });
    assert(r.status === 200, `status=${r.status}`);
    assert(r.body.succeeded === 10 && r.body.failed === 0);
  });

  await step('POST /api/invoke/batch > 50 itens → 413', async () => {
    const items = Array.from({ length: 51 }, (_, i) => ({ apiId: i + 1 }));
    const r = await req('POST', '/api/invoke/batch', { items });
    assert(r.status === 413);
  });

  await step('GET / serve o HTML da SPA (200, >20kB)', async () => {
    const r = await req('GET', '/');
    assert(r.status === 200);
    assert(typeof r.body === 'string' && r.body.length > 20000, 'HTML pequeno demais');
  });

  await step('GET /styles.css 200', async () => {
    const r = await req('GET', '/styles.css');
    assert(r.status === 200);
  });

  await step('GET /js/app.js 200', async () => {
    const r = await req('GET', '/js/app.js');
    assert(r.status === 200);
  });

  await step('GET /rota/inexistente cai no SPA fallback (200)', async () => {
    const r = await req('GET', '/qualquer/rota/profunda');
    assert(r.status === 200, `status=${r.status}`);
  });

  await step('GET /api/inexistente NÃO cai no fallback (404)', async () => {
    const r = await req('GET', '/api/inexistente');
    assert(r.status === 404);
  });

  await step('Security headers presentes em /api/health', async () => {
    const r = await req('GET', '/api/health');
    assert(r.headers['x-content-type-options'] === 'nosniff');
    assert(r.headers['x-frame-options'] === 'DENY');
    assert(r.headers['referrer-policy'] === 'no-referrer');
    assert(r.headers['content-security-policy'], 'CSP ausente');
    assert(r.headers['strict-transport-security'], 'HSTS ausente');
    assert(!r.headers['x-powered-by'], 'x-powered-by deveria estar desabilitado');
  });

  await step('POST /api/invoke sem apiId → 400', async () => {
    const r = await req('POST', '/api/invoke', {});
    assert(r.status === 400);
  });

  // ── v3.2 production checks ──────────────────────────────────────────────
  await step('GET /api/live → 200', async () => {
    const r = await req('GET', '/api/live');
    assert(r.status === 200);
  });

  await step('GET /api/ready → 200 catalog_ready=true', async () => {
    const r = await req('GET', '/api/ready');
    assert(r.status === 200);
    assert(r.body.catalog_ready === true);
  });

  await step('GET /api/metrics retorna Prometheus text', async () => {
    const r = await req('GET', '/api/metrics');
    assert(r.status === 200);
    assert(/app_uptime_seconds\s+\d+/.test(r.body), 'sem métrica app_uptime_seconds');
  });

  await step('Request-ID é exposto em response header', async () => {
    const r = await req('GET', '/api/health');
    assert(r.headers['x-request-id'], 'X-Request-ID ausente');
  });

  await step('Rate-limit headers presentes em rotas não-probe', async () => {
    // /api/health é probe (isenta), usamos /api/catalog
    const r = await req('GET', '/api/catalog?limit=1');
    assert(r.headers['x-ratelimit-limit'], 'X-RateLimit-Limit ausente');
    assert(r.headers['x-ratelimit-remaining'], 'X-RateLimit-Remaining ausente');
  });

  await step('Probes (/live, /ready, /health) isentas do rate-limit (sem headers)', async () => {
    const r = await req('GET', '/api/live');
    assert(!r.headers['x-ratelimit-limit'], '/api/live deveria ser isenta');
  });

  await step('Validation: mode inválido → 400 com details', async () => {
    const r = await req('POST', '/api/invoke', { apiId: 1, mode: 'invalid' });
    assert(r.status === 400);
    assert(Array.isArray(r.body.details));
  });

  // ── Regressões de auditoria de produção ──────────────────────────────────
  await step('REGRESSÃO: JSON malformado → 400 (não 500)', async () => {
    const r = await reqRaw('POST', '/api/invoke', '{"apiId":1,INVALID}',
      { 'content-type': 'application/json' });
    assert(r.status === 400, `esperado 400, recebido ${r.status}`);
    assert(/JSON malformado/.test(r.body.error || ''));
  });

  await step('REGRESSÃO: body > 64kb → 413', async () => {
    const huge = '{"apiId":1,"endpoint":"' + 'x'.repeat(80_000) + '"}';
    const r = await reqRaw('POST', '/api/invoke', huge,
      { 'content-type': 'application/json' });
    assert(r.status === 413, `esperado 413, recebido ${r.status}`);
  });

  await step('REGRESSÃO: Path traversal /api/catalog/../../etc/passwd', async () => {
    // Express normaliza o path antes do routing, cai no SPA fallback.
    // Importante é não vazar nada do filesystem.
    const r = await req('GET', '/api/catalog/../../etc/passwd');
    // 200 com HTML (SPA fallback) OU 404 — ambos OK contanto que não exponha arquivo
    assert(r.status === 200 || r.status === 404, `status inesperado: ${r.status}`);
    if (typeof r.body === 'string') {
      assert(!r.body.includes('root:'), 'NUNCA deve expor /etc/passwd');
    }
  });
}

// Variante "raw" para enviar body bruto (testar erros de parse)
function reqRaw(method, path, body, headers) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(body);
    const r = http.request(
      {
        host: '127.0.0.1', port: PORT, path, method,
        headers: { 'content-length': data.length, ...headers },
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          const isJson = (res.headers['content-type'] || '').includes('application/json');
          let parsed = buf;
          if (isJson && buf) { try { parsed = JSON.parse(buf); } catch {} }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      },
    );
    r.on('error', reject);
    r.write(data);
    r.end();
  });
}

// ── 5) logger ───────────────────────────────────────────────────────────────
const c = (s, code) => (JSON_OUT ? '' : `\x1b[${code}m${s}\x1b[0m`);
const log = {
  banner: () => {
    console.log('');
    console.log(c('━'.repeat(74), 90));
    console.log(c('  SMOKE TEST', '1;38;5;226') + c('  /  APIS // SPORT  /  homologação', 90));
    console.log(c('━'.repeat(74), 90));
    console.log('');
  },
  pass: (name, ms) => {
    console.log(`  ${c('✔', '1;32')} ${name.padEnd(56)} ${c(ms + 'ms', 90)}`);
  },
  fail: (name, msg, ms) => {
    console.log(`  ${c('✘', '1;31')} ${c(name.padEnd(56), '1;31')} ${c(ms + 'ms', 90)}`);
    console.log(`    ${c(msg, 31)}`);
  },
  summary: (passed, failed, total, ms) => {
    console.log('');
    console.log(c('━'.repeat(74), 90));
    const ok = failed === 0;
    const tag = ok
      ? c('  HOMOLOGAÇÃO: ACEITÁVEL', '1;30;48;5;226')
      : c('  HOMOLOGAÇÃO: REJEITAR — falhas detectadas', '1;97;48;5;196');
    console.log(tag);
    console.log(`  ${passed} / ${total} cenários ${ok ? c('✓','1;32') : c('✘','1;31')} · ${ms}ms total`);
    console.log('');
  },
};

// ── 6) main ─────────────────────────────────────────────────────────────────
(async () => {
  if (!JSON_OUT) log.banner();
  const t0 = Date.now();
  try {
    await startServer();
    await runAll();
  } catch (err) {
    cases.push({ name: 'boot', status: 'fail', error: err.message });
    if (!JSON_OUT) log.fail('boot do servidor', err.message, 0);
  } finally {
    stopServer();
  }
  const passed = cases.filter((c) => c.status === 'pass').length;
  const failed = cases.length - passed;
  if (JSON_OUT) {
    console.log(JSON.stringify({ passed, failed, total: cases.length, ms: Date.now() - t0, cases }, null, 2));
  } else {
    log.summary(passed, failed, cases.length, Date.now() - t0);
  }
  process.exit(failed === 0 ? 0 : 1);
})();
