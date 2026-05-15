#!/usr/bin/env node
// scripts/qa-100x.mjs
// Double-check 100x: auditoria automatizada destrutiva/rigorosa com Node puro.
// Cobre contrato, config, segurança, dados, UI/A11y estático e probes dinâmicos
// sem depender de serviços externos.

import fs from 'node:fs';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { loadCatalog } from '../src/catalog.js';

const checks = [];
let serverProc;
const PORT = Number(process.env.QA100X_PORT || 5010);

function pass(name, details = '') { checks.push({ ok: true, name, details }); }
function fail(name, details = '') { checks.push({ ok: false, name, details }); }
function assertCheck(name, condition, details = '') { condition ? pass(name, details) : fail(name, details); }
function read(path) { return fs.readFileSync(path, 'utf8'); }
function json(path) { return JSON.parse(read(path)); }
function count(text, re) { return [...text.matchAll(re)].length; }

function staticContractChecks() {
  const pkg = json('package.json');
  const lock = json('package-lock.json');
  const openapi = read('openapi.yaml');
  const ci = read('.github/workflows/ci.yml');
  const env = read('.env.example');

  assertCheck('package.json e package-lock têm mesma versão', pkg.version === lock.version && lock.packages[''].version === pkg.version);
  assertCheck('package/license lock alinhados em MIT', pkg.license === 'MIT' && lock.packages[''].license === 'MIT');
  assertCheck('OpenAPI version acompanha package.json', new RegExp(`version: ${pkg.version.replaceAll('.', '\\.')}`).test(openapi));
  for (const script of ['lint', 'test', 'qa', 'qa:100x', 'smoke', 'integration', 'homolog']) {
    assertCheck(`script npm obrigatório existe: ${script}`, Boolean(pkg.scripts[script]));
  }
  assertCheck('homolog inclui qa:100x', /npm run qa:100x/.test(pkg.scripts.homolog));
  assertCheck('CI executa integration', /npm run integration/.test(ci));
  assertCheck('CI contém SCA npm audit não bloqueante', /npm audit --audit-level=moderate/.test(ci) && /continue-on-error: true/.test(ci));
  assertCheck('.env.example documenta REAL_INVOKE_TOKEN', /REAL_INVOKE_TOKEN=/.test(env));
  assertCheck('.env.example bloqueia client RapidAPI key por padrão', /ALLOW_CLIENT_RAPIDAPI_KEY=false/.test(env));
  assertCheck('.env.example usa CORS explícito', /CORS_ORIGIN=http:\/\/localhost:3000/.test(env));
  assertCheck('OpenAPI documenta /api/log-error', /\/api\/log-error:/.test(openapi));
  assertCheck('OpenAPI documenta InvokeToken/MetricsToken/BearerAuth', /InvokeToken:/.test(openapi) && /MetricsToken:/.test(openapi) && /BearerAuth:/.test(openapi));
}

function sourceSecurityChecks() {
  const files = [
    'server.js',
    ...fs.readdirSync('src').filter((f) => f.endsWith('.js')).map((f) => `src/${f}`),
    ...fs.readdirSync('src/middleware').filter((f) => f.endsWith('.js')).map((f) => `src/middleware/${f}`),
    ...fs.readdirSync('public/js').filter((f) => f.endsWith('.js')).map((f) => `public/js/${f}`),
  ];
  const combined = files.map((f) => `\n// ${f}\n${read(f)}`).join('\n');

  assertCheck('não há eval()', !/\beval\s*\(/.test(combined));
  assertCheck('não há new Function()', !/new\s+Function\s*\(/.test(combined));
  assertCheck('CSP não permite unsafe-inline em script-src', !/script-src[^\n]+unsafe-inline/.test(read('src/middleware/security.js')));
  assertCheck('config falha CORS credentials com wildcard', /CORS_CREDENTIALS=true não pode/.test(read('src/config.js')));
  assertCheck('production com RAPIDAPI_KEY exige REAL_INVOKE_TOKEN', /REAL_INVOKE_TOKEN é obrigatório/.test(read('src/config.js')));
  assertCheck('invoker usa UPSTREAM_TIMEOUT_MS configurável', /config\.UPSTREAM_TIMEOUT_MS/.test(read('src/invoker.js')));
  assertCheck('catálogo valida shape no loadCatalog', /validateApiShape\(api\)/.test(read('src/catalog.js')));
  assertCheck('request-id aplica regex segura', /\^\[A-Za-z0-9\._:-\]\+\$/.test(read('src/middleware/request-id.js')));
  assertCheck('validation rejeita URL absoluta em endpoint', /URL absoluta/.test(read('src/middleware/validation.js')));
  assertCheck('logger redige rapidApiKey/authorization/cookie', /rapidApiKey/.test(read('src/logger.js')) && /authorization/.test(read('src/logger.js')) && /cookie/.test(read('src/logger.js')));
}

function catalogChecks() {
  const { apis, stats } = loadCatalog();
  const ids = new Set(apis.map((a) => a.id));
  const hosts = new Set(apis.map((a) => a.rapidapi_host));
  const zeroTelemetry = apis.filter((a) => a.popularity === 0 && a.latency_ms === 0 && a.success_rate_pct === 0);
  const hugeLatency = apis.filter((a) => a.latency_ms > 30_000);

  assertCheck('catálogo tem exatamente 302 APIs', apis.length === 302);
  assertCheck('ids são únicos', ids.size === apis.length);
  assertCheck('hosts são únicos', hosts.size === apis.length);
  assertCheck('todos hosts seguem *.p.rapidapi.com', apis.every((a) => /^[a-z0-9_-]+\.p\.rapidapi\.com$/i.test(a.rapidapi_host)));
  assertCheck('stats por subcategoria somam 302', Object.values(stats.bySubcategory).reduce((a, b) => a + b, 0) === 302);
  assertCheck('stats por pricing somam 302', Object.values(stats.byPricing).reduce((a, b) => a + b, 0) === 302);
  assertCheck('lacunas de telemetria continuam explícitas no dossiê', zeroTelemetry.length > 0 && /Telemetria totalmente zerada \| 85/.test(read('docs/audits/2026-05-15-auditoria-rigorosa.md')), `${zeroTelemetry.length} entradas`);
  assertCheck('outliers de latência continuam explícitos no dossiê', hugeLatency.length === 8 && /Latência acima de 30s \| 8/.test(read('docs/audits/2026-05-15-auditoria-rigorosa.md')));
}

function frontendUxUiA11yChecks() {
  const html = read('public/index.html');
  const css = read('public/styles.css');
  const dashboard = read('public/js/dashboard.js');
  const app = read('public/js/app.js');
  const views = read('public/js/views.js');

  const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({ attrs: m[1], text: m[2].replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim() }));
  const unnamedButtons = buttons.filter((b) => !/(aria-label|aria-labelledby)/.test(b.attrs) && !b.text);
  const dialogs = [...html.matchAll(/<dialog\b([^>]*)>/g)].map((m) => m[1]);
  const inputs = [...html.matchAll(/<input\b([^>]*)>/g)].map((m) => m[1]);

  assertCheck('todos botões HTML têm nome acessível estático ou texto', unnamedButtons.length === 0, JSON.stringify(unnamedButtons));
  assertCheck('todos dialogs têm aria-label/aria-labelledby', dialogs.length >= 5 && dialogs.every((attrs) => /aria-label|aria-labelledby/.test(attrs)));
  assertCheck('há aria-live para status/toasts/resultados', count(html, /aria-live=/g) >= 3);
  assertCheck('inputs têm id/aria ou estão em labels/templates controlados', inputs.every((attrs) => /id=|aria-label|tabindex="-1"|type="radio"/.test(attrs)));
  assertCheck('CSS tem foco visível', /:focus-visible/.test(css));
  assertCheck('CSS respeita reduced motion', /prefers-reduced-motion/.test(css));
  assertCheck('CSS tem responsividade mobile/tablet', count(css, /@media\b/g) >= 8);
  assertCheck('dashboard escapa nome em SVG title', /escape\(p\.name\)/.test(dashboard));
  assertCheck('confirmDialog não injeta HTML dinâmico', !/confirm-body'\)\.innerHTML/.test(app) && /confirm-body'\)\.textContent/.test(app));
  assertCheck('toTreeHTML escapa strings antes de innerHTML de tree', /escape\(value\)/.test(read('public/js/format.js')) && /treeEl\.innerHTML = toTreeHTML/.test(views));
}

function documentationFreshnessChecks() {
  const readme = read('README.md');
  const ops = read('OPERATIONS.md');
  assertCheck('README não recomenda colar chave RapidAPI na UI em produção', !/cole sua chave na UI/i.test(readme));
  assertCheck('README documenta REAL_INVOKE_TOKEN', /REAL_INVOKE_TOKEN/.test(readme));
  assertCheck('README documenta qa:100x', /qa:100x/.test(readme));
  assertCheck('OPERATIONS não afirma que cliente pode enviar chave por request', !/cliente também pode enviar/i.test(ops));
  assertCheck('OPERATIONS documenta METRICS_TOKEN e ALLOW_CLIENT_RAPIDAPI_KEY', /METRICS_TOKEN/.test(ops) && /ALLOW_CLIENT_RAPIDAPI_KEY/.test(ops));
}

function req(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const r = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        path,
        method,
        headers: { 'content-type': 'application/json', 'content-length': data?.length || 0, ...headers },
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          const isJson = (res.headers['content-type'] || '').includes('application/json');
          let parsed = buf || null;
          if (isJson && buf) { try { parsed = JSON.parse(buf); } catch { /* keep raw */ } }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      },
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function dynamicSecurityChecks() {
  serverProc = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      RATE_LIMIT_ENABLED: 'false',
      RAPIDAPI_KEY: 'server-key-for-auth-gate-only',
      REQUIRE_REAL_AUTH: 'true',
      REAL_INVOKE_TOKEN: 'invoke-token',
      ALLOW_CLIENT_RAPIDAPI_KEY: 'false',
      METRICS_TOKEN: 'metrics-token',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try { if ((await req('GET', '/api/live')).status === 200) break; }
    catch { /* booting */ }
    await sleep(80);
  }

  const live = await req('GET', '/api/live');
  assertCheck('servidor dinâmico sobe para QA 100x', live.status === 200);

  let r = await req('GET', '/api/metrics');
  assertCheck('metrics sem token retorna 401', r.status === 401);
  r = await req('GET', '/api/metrics', null, { 'x-metrics-token': 'metrics-token' });
  assertCheck('metrics com token retorna 200', r.status === 200 && /app_uptime_seconds/.test(String(r.body)));
  r = await req('POST', '/api/invoke', { apiId: 1, mode: 'real' });
  assertCheck('real invoke server-key sem token retorna 401 antes do upstream', r.status === 401);
  r = await req('POST', '/api/invoke', { apiId: 1, mode: 'real' }, { 'x-invoke-token': 'wrong' });
  assertCheck('real invoke token errado retorna 403', r.status === 403);
  r = await req('POST', '/api/invoke', { apiId: 1, mode: 'real', rapidApiKey: 'client-key' }, { 'x-invoke-token': 'invoke-token' });
  assertCheck('rapidApiKey client-side bloqueada retorna 403', r.status === 403 && /desabilitada/.test(r.body.error));
  r = await req('POST', '/api/invoke', { apiId: 1, mode: 'mock' });
  assertCheck('mock invoke continua sem token', r.status === 200 && r.body.ok === true);
  r = await req('POST', '/api/invoke', { apiId: 1, endpoint: 'https://evil.example' });
  assertCheck('endpoint absoluto rejeitado dinamicamente', r.status === 400);
  r = await req('GET', '/api/health', null, { 'x-request-id': 'id com espaço' });
  assertCheck('request-id inválido é substituído dinamicamente', r.status === 200 && r.headers['x-request-id'] !== 'id com espaço');
}

async function main() {
  staticContractChecks();
  sourceSecurityChecks();
  catalogChecks();
  frontendUxUiA11yChecks();
  documentationFreshnessChecks();
  await dynamicSecurityChecks();

  if (serverProc && !serverProc.killed) serverProc.kill('SIGTERM');

  const failed = checks.filter((c) => !c.ok);
  const passed = checks.length - failed.length;
  console.log('\n══ QA 100x / DOUBLE-CHECK DEVASTADOR ══');
  for (const c of checks) {
    const icon = c.ok ? '✔' : '✘';
    console.log(`${icon} ${c.name}${c.details ? ` — ${c.details}` : ''}`);
  }
  console.log(`\nResultado: ${passed}/${checks.length} checks passaram`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  if (serverProc && !serverProc.killed) serverProc.kill('SIGTERM');
  console.error('QA 100x crashed:', err);
  process.exit(1);
});
