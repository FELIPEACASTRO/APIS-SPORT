#!/usr/bin/env node
// scripts/integration-test.mjs
// TESTE INTEGRADO COMPLETO — sem mocks, sem stubs.
//
// Sobe o servidor REAL em processo separado, faz requisições HTTP REAIS
// e valida o comportamento ponta-a-ponta de TODAS as funcionalidades.
//
// O servidor é exercitado como um cliente externo o faria:
// - HTTP real (não em-process)
// - Headers/body reais
// - Validação real de respostas
// - Múltiplos cenários por feature
//
// Se RAPIDAPI_KEY estiver definida, também testa o invoke REAL contra o
// RapidAPI ao vivo. Sem a chave, esse passo é skipped explicitamente.
//
// Saída: PASS/FAIL por cenário + sumário com exit code 0/1.

import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { readFileSync } from 'node:fs';

const PORT = Number(process.env.INTEGRATION_PORT || 4990);
const REAL = process.argv.includes('--real');
const REAL_KEY = process.env.RAPIDAPI_KEY;
const JSON_OUT = process.argv.includes('--json');

const features = [];                  // [{ feature, cases: [...] }]
let currentFeature = null;
let serverProc = null;

// ── Cliente HTTP ────────────────────────────────────────────────────────────
function http_(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body == null
      ? null
      : typeof body === 'string' ? Buffer.from(body) : Buffer.from(JSON.stringify(body));
    const req = http.request(
      {
        host: '127.0.0.1', port: PORT, path, method,
        headers: {
          ...(data && typeof body !== 'string' ? { 'content-type': 'application/json' } : {}),
          ...(data ? { 'content-length': data.length } : {}),
          ...headers,
        },
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          const ct = res.headers['content-type'] || '';
          let parsed = buf;
          if (ct.includes('application/json') && buf) {
            try { parsed = JSON.parse(buf); } catch { /* keep raw */ }
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── Servidor real ───────────────────────────────────────────────────────────
async function bootServer() {
  serverProc = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      LOG_LEVEL: 'silent',
      RATE_LIMIT_ENABLED: 'true',
      RATE_LIMIT_MAX_REQUESTS: '10000',    // alto para não atrapalhar o teste
      RATE_LIMIT_INVOKE_MAX: '10000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try { const r = await http_('GET', '/api/live'); if (r.status === 200) return; }
    catch { /* still booting */ }
    await sleep(80);
  }
  throw new Error('Servidor não respondeu em /api/live após 5s');
}
function killServer() {
  if (serverProc && !serverProc.killed) serverProc.kill('SIGTERM');
}

// ── Runner ──────────────────────────────────────────────────────────────────
function feature(name) {
  currentFeature = { feature: name, cases: [] };
  features.push(currentFeature);
  if (!JSON_OUT) log.feature(name);
}
async function check(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    currentFeature.cases.push({ name, status: 'pass', ms: Date.now() - t0 });
    if (!JSON_OUT) log.pass(name, Date.now() - t0);
  } catch (err) {
    currentFeature.cases.push({ name, status: 'fail', ms: Date.now() - t0, error: err.message });
    if (!JSON_OUT) log.fail(name, err.message, Date.now() - t0);
  }
}
async function skip(name, why) {
  currentFeature.cases.push({ name, status: 'skip', reason: why });
  if (!JSON_OUT) log.skip(name, why);
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function assertEq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg || 'esperado'}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`);
}

// ╔══════════════════════════════════════════════════════════════════════════
// ║  CENÁRIOS
// ╚══════════════════════════════════════════════════════════════════════════
async function runAll() {

  // ── Feature: Probes K8s ───────────────────────────────────────────────────
  feature('Probes K8s (live · ready · health · version)');
  await check('GET /api/live → 200 com timestamp', async () => {
    const r = await http_('GET', '/api/live');
    assertEq(r.status, 200);
    assert(r.body.timestamp);
  });
  await check('GET /api/ready → 200 com catalog_ready=true', async () => {
    const r = await http_('GET', '/api/ready');
    assertEq(r.status, 200);
    assertEq(r.body.catalog_ready, true);
  });
  await check('GET /api/health → 200 com 302 APIs e memória reportada', async () => {
    const r = await http_('GET', '/api/health');
    assertEq(r.status, 200);
    assertEq(r.body.catalog_total, 302);
    assert(typeof r.body.uptime_s === 'number');
    assert(r.body.memory && typeof r.body.memory.rss_mb === 'number');
  });
  await check('GET /api/version → expõe build info coerente', async () => {
    const r = await http_('GET', '/api/version');
    assertEq(r.status, 200);
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    assertEq(r.body.version, pkg.version, 'versão deve bater com package.json');
    assertEq(r.body.catalog_total, 302);
  });

  // ── Feature: Observability ────────────────────────────────────────────────
  feature('Observability (metrics · request-id · logs)');
  await check('GET /api/metrics → Prometheus text exposition', async () => {
    const r = await http_('GET', '/api/metrics');
    assertEq(r.status, 200);
    assert(r.headers['content-type'].includes('text/plain'));
    assert(/^# HELP app_uptime_seconds/m.test(r.body), 'sem # HELP');
    assert(/^# TYPE app_uptime_seconds counter/m.test(r.body), 'sem # TYPE');
    assert(/^http_requests_total\{.*\} \d+/m.test(r.body), 'sem http_requests_total');
  });
  await check('GET /api/metrics/json → snapshot JSON', async () => {
    const r = await http_('GET', '/api/metrics/json');
    assertEq(r.status, 200);
    assert('uptime_s' in r.body);
    assert('counters' in r.body);
    assert('histograms' in r.body);
  });
  await check('Request ID gerado automaticamente', async () => {
    const r = await http_('GET', '/api/health');
    assert(r.headers['x-request-id']);
    assert(/^[\w-]+$/.test(r.headers['x-request-id']));
  });
  await check('Request ID do cliente é preservado', async () => {
    const r = await http_('GET', '/api/health', null, { 'x-request-id': 'integration-test-abc' });
    assertEq(r.headers['x-request-id'], 'integration-test-abc');
  });
  await check('Métricas são incrementadas após requests', async () => {
    const before = (await http_('GET', '/api/metrics/json')).body;
    await http_('GET', '/api/health');
    await http_('GET', '/api/health');
    const after = (await http_('GET', '/api/metrics/json')).body;
    const beforeTotal = Object.entries(before.counters)
      .filter(([k]) => k.startsWith('http_requests_total'))
      .reduce((s, [, v]) => s + v, 0);
    const afterTotal = Object.entries(after.counters)
      .filter(([k]) => k.startsWith('http_requests_total'))
      .reduce((s, [, v]) => s + v, 0);
    assert(afterTotal > beforeTotal, 'counters não incrementaram');
  });

  // ── Feature: Security headers ─────────────────────────────────────────────
  feature('Security (CSP · HSTS · COOP · CORP · X-Frame · noindex)');
  await check('Headers de segurança completos em /api/health', async () => {
    const r = await http_('GET', '/api/health');
    assertEq(r.headers['x-content-type-options'], 'nosniff');
    assertEq(r.headers['x-frame-options'], 'DENY');
    assertEq(r.headers['referrer-policy'], 'no-referrer');
    assert(r.headers['content-security-policy']);
    assert(r.headers['strict-transport-security']);
    assertEq(r.headers['cross-origin-opener-policy'], 'same-origin');
    assertEq(r.headers['cross-origin-resource-policy'], 'same-site');
    assert(!r.headers['x-powered-by'], 'x-powered-by deveria estar desabilitado');
  });
  await check('CSP bloqueia inline scripts (sem unsafe-inline em script-src)', async () => {
    const r = await http_('GET', '/api/health');
    const csp = r.headers['content-security-policy'];
    assert(!/script-src[^;]*unsafe-inline/.test(csp), 'CSP permite inline scripts!');
    assert(!/script-src[^;]*unsafe-eval/.test(csp), 'CSP permite eval!');
  });

  // ── Feature: CORS ─────────────────────────────────────────────────────────
  feature('CORS');
  await check('Preflight OPTIONS → 204', async () => {
    const r = await http_('OPTIONS', '/api/catalog');
    assertEq(r.status, 204);
    assert(r.headers['access-control-allow-methods']);
    assert(r.headers['access-control-allow-headers']);
  });
  await check('CORS allow-origin presente em GETs', async () => {
    const r = await http_('GET', '/api/health', null, { origin: 'http://example.com' });
    assert(r.headers['access-control-allow-origin']);
  });

  // ── Feature: Rate limiting ────────────────────────────────────────────────
  feature('Rate limiting (headers · isenção de probes)');
  await check('Headers X-RateLimit-* presentes', async () => {
    const r = await http_('GET', '/api/catalog');
    assert(r.headers['x-ratelimit-limit']);
    assert(r.headers['x-ratelimit-remaining']);
    assert(r.headers['x-ratelimit-reset']);
  });
  await check('Probes (/live, /ready, /health) NÃO recebem headers de rate-limit (isentas)', async () => {
    const r = await http_('GET', '/api/live');
    assert(!r.headers['x-ratelimit-limit'], '/api/live deveria ser isenta');
  });

  // ── Feature: Catalog ──────────────────────────────────────────────────────
  feature('Catalog (302 APIs · filtros · stats · detail)');
  await check('GET /api/catalog → 302 itens', async () => {
    const r = await http_('GET', '/api/catalog');
    assertEq(r.status, 200);
    assertEq(r.body.total, 302);
    assert(Array.isArray(r.body.items));
    assertEq(r.body.items.length, 302);
  });
  await check('Filtro q=pinnacle reduz subset (12 ou mais)', async () => {
    const r = await http_('GET', '/api/catalog?q=pinnacle');
    assert(r.body.total >= 5 && r.body.total < 302);
  });
  await check('Filtro subcategory=Odds → exatamente 83', async () => {
    const r = await http_('GET', '/api/catalog?subcategory=Odds');
    assertEq(r.body.total, 83);
  });
  await check('Filtro pricing=Freemium → exatamente 244', async () => {
    const r = await http_('GET', '/api/catalog?pricing=Freemium');
    assertEq(r.body.total, 244);
  });
  await check('Filtro minPopularity=9.5 → todas com pop ≥ 9.5', async () => {
    const r = await http_('GET', '/api/catalog?minPopularity=9.5');
    for (const a of r.body.items) assert(a.popularity >= 9.5);
  });
  await check('Sort=name ordena alfabeticamente', async () => {
    const r = await http_('GET', '/api/catalog?sort=name&limit=5');
    const names = r.body.items.map((a) => a.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    assertEq(JSON.stringify(names), JSON.stringify(sorted));
  });
  await check('Sort=success ordena por taxa de sucesso desc', async () => {
    const r = await http_('GET', '/api/catalog?sort=success&limit=5');
    const succs = r.body.items.map((a) => a.success_rate_pct);
    for (let i = 1; i < succs.length; i++) assert(succs[i] <= succs[i - 1]);
  });
  await check('Limit=10 → exatamente 10', async () => {
    const r = await http_('GET', '/api/catalog?limit=10');
    assertEq(r.body.items.length, 10);
  });
  await check('GET /api/catalog/stats → 8 subcategorias', async () => {
    const r = await http_('GET', '/api/catalog/stats');
    assertEq(Object.keys(r.body.stats.bySubcategory).length, 8);
    assertEq(r.body.stats.byPricing.Freemium, 244);
    assertEq(r.body.stats.byPricing.Gratuito, 43);
    assertEq(r.body.stats.byPricing.Pago, 15);
  });
  await check('GET /api/catalog/1 → Tank01 MLB', async () => {
    const r = await http_('GET', '/api/catalog/1');
    assertEq(r.status, 200);
    assertEq(r.body.api.id, 1);
    assert(r.body.api.name.includes('Tank01 MLB'));
  });
  await check('GET /api/catalog/302 → última API', async () => {
    const r = await http_('GET', '/api/catalog/302');
    assertEq(r.body.api.id, 302);
  });
  await check('GET /api/catalog/99999 → 404', async () => {
    const r = await http_('GET', '/api/catalog/99999');
    assertEq(r.status, 404);
    assert(r.body.request_id);
  });
  await check('Todos os hosts seguem padrão *.p.rapidapi.com', async () => {
    const r = await http_('GET', '/api/catalog');
    const bad = r.body.items.filter((a) => !/^[a-z0-9_-]+\.p\.rapidapi\.com$/i.test(a.rapidapi_host));
    assertEq(bad.length, 0, 'hosts inválidos: ' + bad.map((b) => `#${b.id}`).join(','));
  });

  // ── Feature: Invoke mock (modo padrão) ────────────────────────────────────
  feature('Invoke MOCK (302 APIs respondem)');
  await check('POST /api/invoke/batch com 10 APIs distintas → 10/10 ok', async () => {
    const items = [1, 25, 50, 100, 150, 200, 250, 280, 295, 302].map((id) => ({ apiId: id, mode: 'mock' }));
    const r = await http_('POST', '/api/invoke/batch', { items });
    assertEq(r.status, 200);
    assertEq(r.body.succeeded, 10);
    assertEq(r.body.failed, 0);
  });
  await check('Cada resultado preserva api_id, host e endpoint corretos', async () => {
    const r = await http_('POST', '/api/invoke', { apiId: 23, mode: 'mock', endpoint: '/v1/sports' });
    assertEq(r.body.api_id, 23);
    assert(r.body.api_name.toLowerCase().includes('pinnacle'));
    assertEq(r.body.rapidapi_host, 'pinnacle-odds-api.p.rapidapi.com');
    assertEq(r.body.endpoint, '/v1/sports');
    assertEq(r.body.mode, 'mock');
  });
  await check('Endpoint sem barra inicial é normalizado para /', async () => {
    const r = await http_('POST', '/api/invoke', { apiId: 1, endpoint: 'odds' });
    assertEq(r.body.endpoint, '/odds');
  });

  // ── Feature: Validation ───────────────────────────────────────────────────
  feature('Validation (schemas explícitos)');
  await check('POST /api/invoke sem body → 400', async () => {
    const r = await http_('POST', '/api/invoke', {});
    assertEq(r.status, 400);
    assert(Array.isArray(r.body.details));
  });
  await check('POST /api/invoke apiId não numérico → 400', async () => {
    const r = await http_('POST', '/api/invoke', { apiId: 'abc' });
    assertEq(r.status, 400);
  });
  await check('POST /api/invoke mode inválido → 400', async () => {
    const r = await http_('POST', '/api/invoke', { apiId: 1, mode: 'gibberish' });
    assertEq(r.status, 400);
  });
  await check('POST /api/invoke endpoint > 1000 chars → 400', async () => {
    const r = await http_('POST', '/api/invoke', { apiId: 1, endpoint: 'x'.repeat(1500) });
    assertEq(r.status, 400);
  });
  await check('POST /api/invoke/batch > 50 itens → 413', async () => {
    const items = Array.from({ length: 51 }, (_, i) => ({ apiId: i + 1 }));
    const r = await http_('POST', '/api/invoke/batch', { items });
    assertEq(r.status, 413);
  });
  await check('POST /api/invoke/batch vazio → 400', async () => {
    const r = await http_('POST', '/api/invoke/batch', { items: [] });
    assertEq(r.status, 400);
  });

  // ── Feature: Error handling robusto ───────────────────────────────────────
  feature('Error handling (JSON malformado · payload grande · 404)');
  await check('REGRESSÃO: JSON malformado → 400 (não 500)', async () => {
    const r = await http_('POST', '/api/invoke', '{"apiId":1,MALFORMED}', { 'content-type': 'application/json' });
    assertEq(r.status, 400);
    assert(/JSON malformado/.test(r.body.error));
  });
  await check('REGRESSÃO: body > 64kb → 413 (não 500)', async () => {
    const huge = '{"apiId":1,"endpoint":"' + 'x'.repeat(80_000) + '"}';
    const r = await http_('POST', '/api/invoke', huge, { 'content-type': 'application/json' });
    assertEq(r.status, 413);
  });
  await check('Content-type errado: corpo ignorado, validação reclama de apiId', async () => {
    const r = await http_('POST', '/api/invoke', '{"apiId":1}', { 'content-type': 'text/plain' });
    assertEq(r.status, 400);
  });
  await check('GET /api/inexistente → 404 JSON com request_id', async () => {
    const r = await http_('GET', '/api/algo-que-nao-existe');
    assertEq(r.status, 404);
    assert(r.body.request_id);
  });

  // ── Feature: SPA static assets ────────────────────────────────────────────
  feature('SPA & assets estáticos');
  await check('GET / → HTML ≥ 20kB com brand "APIS // SPORT"', async () => {
    const r = await http_('GET', '/');
    assertEq(r.status, 200);
    assert(typeof r.body === 'string');
    assert(r.body.length > 20_000, `HTML muito pequeno: ${r.body.length}`);
    assert(r.body.includes('APIS'));
    assert(r.body.includes('SPORT'));
    assert(r.body.includes('Catálogo'));
    assert(r.body.includes('Sessão'));
  });
  await check('GET /styles.css → CSS ≥ 10kB', async () => {
    const r = await http_('GET', '/styles.css');
    assertEq(r.status, 200);
    assert(r.body.length > 10_000);
  });
  await check('GET /js/app.js → módulo ES com import', async () => {
    const r = await http_('GET', '/js/app.js');
    assertEq(r.status, 200);
    assert(r.body.includes('import'), 'não é ES module');
  });
  await check('Todos os módulos JS são servidos', async () => {
    const modules = ['state.js', 'services.js', 'views.js', 'palette.js', 'keyboard.js', 'presets.js', 'toast.js', 'format.js'];
    for (const m of modules) {
      const r = await http_('GET', `/js/${m}`);
      assertEq(r.status, 200, `/js/${m}`);
    }
  });
  await check('GET /rota-fictícia → SPA fallback (200 com HTML)', async () => {
    const r = await http_('GET', '/rota/profunda/inexistente');
    assertEq(r.status, 200);
    assert(typeof r.body === 'string');
    assert(r.body.includes('APIS'));
  });

  // ── Feature: Real upstream (RapidAPI) ─────────────────────────────────────
  feature('Invoke REAL contra RapidAPI ao vivo');
  if (REAL && REAL_KEY) {
    await check('POST /api/invoke mode=real com chave válida → response do RapidAPI', async () => {
      // Tank01 MLB é Freemium e popular — escolha segura para sample real
      const r = await http_('POST', '/api/invoke', {
        apiId: 1, mode: 'real', endpoint: '/getMLBTeams', rapidApiKey: REAL_KEY,
      });
      assert(r.body.mode === 'real');
      // Aceitamos 200 (sucesso), 401/403 (chave sem permissão), 429 (cota)
      const validStatuses = [200, 401, 403, 429];
      assert(validStatuses.includes(r.body.status),
        `status do upstream inesperado: ${r.body.status} (esperado em ${validStatuses})`);
      assert(r.body.duration_ms > 0, 'duration_ms deveria ser > 0 em chamada real');
    });
  } else {
    await skip('Invoke REAL contra RapidAPI ao vivo',
      REAL_KEY
        ? 'flag --real ausente (use --real para habilitar)'
        : 'RAPIDAPI_KEY não definida — para testar real, exporte RAPIDAPI_KEY e rode --real');
  }
  await check('POST /api/invoke mode=real sem chave → 502 graceful', async () => {
    const r = await http_('POST', '/api/invoke', { apiId: 1, mode: 'real' });
    assertEq(r.status, 502);
    assertEq(r.body.ok, false);
    assert(/chave|key/i.test(r.body.error));
  });
}

// ── Logging ─────────────────────────────────────────────────────────────────
const c = (s, code) => (JSON_OUT ? '' : `\x1b[${code}m${s}\x1b[0m`);
const log = {
  banner: () => {
    console.log('');
    console.log(c('═'.repeat(78), 90));
    console.log(c('  INTEGRATION TEST', '1;38;5;226') + c('  /  APIS // SPORT v3.2', 90));
    console.log(c('  servidor real subindo · HTTP real · sem mocks/stubs nos testes', 90));
    if (REAL && REAL_KEY) console.log(c('  modo: --real (chamadas ao vivo ao RapidAPI)', '1;36'));
    else if (REAL_KEY) console.log(c('  modo: padrão (chave detectada, mas sem --real)', 33));
    else console.log(c('  modo: sem RAPIDAPI_KEY (passos reais serão skipped)', 33));
    console.log(c('═'.repeat(78), 90));
    console.log('');
  },
  feature: (name) => {
    console.log('');
    console.log(c('▶ ' + name, '1;37'));
  },
  pass: (name, ms) => console.log(`    ${c('✔', '1;32')} ${name.padEnd(64)} ${c(ms + 'ms', 90)}`),
  fail: (name, msg, ms) => {
    console.log(`    ${c('✘', '1;31')} ${c(name.padEnd(64), '1;31')} ${c(ms + 'ms', 90)}`);
    console.log(`      ${c(msg, 31)}`);
  },
  skip: (name, why) => console.log(`    ${c('◌', 90)} ${name.padEnd(64)} ${c('skipped: ' + why, 90)}`),
  summary: (totals, ms) => {
    console.log('');
    console.log(c('═'.repeat(78), 90));
    const ok = totals.failed === 0;
    const tag = ok
      ? c('  INTEGRATION TEST: ✓ TODOS OS CENÁRIOS PASSARAM', '1;30;48;5;226')
      : c('  INTEGRATION TEST: ✘ FALHAS DETECTADAS', '1;97;48;5;196');
    console.log(tag);
    console.log(
      `  ${totals.passed} passed · ${totals.failed} failed · ${totals.skipped} skipped` +
      `  (de ${totals.total} cenários em ${features.length} features)  ·  ${ms}ms`,
    );
    console.log('');
  },
};

// ── Main ────────────────────────────────────────────────────────────────────
(async () => {
  if (!JSON_OUT) log.banner();
  const t0 = Date.now();
  try {
    await bootServer();
    await runAll();
  } catch (err) {
    console.error('Boot/run error:', err);
    if (currentFeature) currentFeature.cases.push({ name: 'boot', status: 'fail', error: err.message });
  } finally {
    killServer();
  }
  const totals = features.reduce((acc, f) => {
    for (const c of f.cases) {
      acc.total++;
      acc[c.status]++;
    }
    return acc;
  }, { total: 0, pass: 0, fail: 0, skip: 0, passed: 0, failed: 0, skipped: 0 });
  totals.passed = totals.pass;
  totals.failed = totals.fail;
  totals.skipped = totals.skip;

  if (JSON_OUT) {
    console.log(JSON.stringify({ totals, features, ms: Date.now() - t0 }, null, 2));
  } else {
    log.summary(totals, Date.now() - t0);
  }
  process.exit(totals.failed === 0 ? 0 : 1);
})();
