#!/usr/bin/env node
// scripts/qa-100x.mjs
// Double-check 100x: auditoria automatizada destrutiva/rigorosa com Node puro.
// Cobre contrato, config, segurança, dados, UI/A11y, documentação, Docker/CI,
// probes dinâmicos, autenticação real, métricas, rate limit e regressões HTTP.

import fs from 'node:fs';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { loadCatalog } from '../src/catalog.js';

const checks = [];
const serverProcs = [];
const PORT = Number(process.env.QA100X_PORT || 5010);
const RATE_PORT = PORT + 1;

function pass(name, details = '') { checks.push({ ok: true, name, details }); }
function fail(name, details = '') { checks.push({ ok: false, name, details }); }
function assertCheck(name, condition, details = '') { condition ? pass(name, details) : fail(name, details); }
function read(path) { return fs.readFileSync(path, 'utf8'); }
function json(path) { return JSON.parse(read(path)); }
function count(text, re) { return [...text.matchAll(re)].length; }
function sum(values) { return values.reduce((a, b) => a + b, 0); }
function headerIncludes(headers, name, needle) { return String(headers[name] || '').toLowerCase().includes(needle.toLowerCase()); }

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'coverage'].includes(entry.name)) continue;
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(full, acc);
    else acc.push(full.replace(/^\.\//, ''));
  }
  return acc;
}

function runConfigImport(env) {
  return spawnSync(
    process.execPath,
    ['--input-type=module', '-e', "import('./src/config.js')"],
    {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      encoding: 'utf8',
    },
  );
}

function staticContractChecks() {
  const pkg = json('package.json');
  const lock = json('package-lock.json');
  const openapi = read('openapi.yaml');
  const ci = read('.github/workflows/ci.yml');
  const env = read('.env.example');
  const dockerfile = read('Dockerfile');
  const dockerignore = read('.dockerignore');
  const compose = read('docker-compose.yml');
  const endpoints = [
    '/api/live',
    '/api/ready',
    '/api/health',
    '/api/version',
    '/api/metrics',
    '/api/metrics/json',
    '/api/catalog',
    '/api/catalog/stats',
    '/api/catalog/{id}',
    '/api/invoke',
    '/api/invoke/batch',
    '/api/log-error',
  ];

  assertCheck('package.json e package-lock têm mesma versão', pkg.version === lock.version && lock.packages[''].version === pkg.version);
  assertCheck('package/license lock alinhados em MIT', pkg.license === 'MIT' && lock.packages[''].license === 'MIT');
  assertCheck('package é ESM e main aponta para server.js', pkg.type === 'module' && pkg.main === 'server.js');
  assertCheck('engine Node declarado como >=20', pkg.engines?.node === '>=20');
  assertCheck('OpenAPI version acompanha package.json', new RegExp(`version: ${pkg.version.replaceAll('.', '\\.')}`).test(openapi));
  assertCheck('lockfile v3+ presente', lock.lockfileVersion >= 3 && Boolean(lock.packages?.['']));
  assertCheck('dependência runtime única esperada é express', Object.keys(pkg.dependencies || {}).join(',') === 'express');
  assertCheck('start script sobe node server.js', pkg.scripts.start === 'node server.js');
  assertCheck('coverage usa cobertura nativa do node:test', pkg.scripts.coverage === 'node --experimental-test-coverage --test tests/*.test.mjs');
  for (const script of ['lint', 'test', 'coverage', 'qa', 'qa:100x', 'smoke', 'integration', 'homolog']) {
    assertCheck(`script npm obrigatório existe: ${script}`, Boolean(pkg.scripts[script]));
  }
  assertCheck('homolog inclui lint/test/qa/qa:100x/smoke/integration', ['npm run lint', 'npm test', 'npm run qa', 'npm run qa:100x', 'npm run smoke', 'npm run integration'].every((cmd) => pkg.scripts.homolog.includes(cmd)));
  assertCheck('CI executa lint/test/qa/qa:100x/smoke/integration', ['npm run lint', 'npm test', 'npm run qa', 'npm run qa:100x', 'npm run smoke', 'npm run integration'].every((cmd) => ci.includes(cmd)));
  assertCheck('CI contém SCA npm audit não bloqueante', /npm audit --audit-level=moderate/.test(ci) && /continue-on-error: true/.test(ci));
  assertCheck('CI usa npm ci', /npm ci\b/.test(ci));
  assertCheck('.env.example documenta REAL_INVOKE_TOKEN', /REAL_INVOKE_TOKEN=/.test(env));
  assertCheck('.env.example exige REQUIRE_REAL_AUTH=true por padrão', /REQUIRE_REAL_AUTH=true/.test(env));
  assertCheck('.env.example bloqueia client RapidAPI key por padrão', /ALLOW_CLIENT_RAPIDAPI_KEY=false/.test(env));
  assertCheck('.env.example usa CORS explícito', /CORS_ORIGIN=http:\/\/localhost:3000/.test(env));
  assertCheck('.env.example documenta METRICS_TOKEN e UPSTREAM_TIMEOUT_MS', /METRICS_TOKEN=/.test(env) && /UPSTREAM_TIMEOUT_MS=10000/.test(env));
  assertCheck('OpenAPI documenta todos endpoints públicos', endpoints.every((ep) => openapi.includes(`  ${ep}:`)));
  assertCheck('OpenAPI documenta InvokeToken/MetricsToken/BearerAuth', /InvokeToken:/.test(openapi) && /MetricsToken:/.test(openapi) && /BearerAuth:/.test(openapi));
  assertCheck('OpenAPI documenta 401/403 em invoke e metrics', count(openapi, /'401':/g) >= 2 && count(openapi, /'403':/g) >= 2);
  assertCheck('CORS permite headers de InvokeToken/MetricsToken/BearerAuth', /Authorization/.test(read('src/middleware/cors.js')) && /X-Invoke-Token/.test(read('src/middleware/cors.js')) && /X-Metrics-Token/.test(read('src/middleware/cors.js')));
  assertCheck('Dockerfile usa npm ci no build', /RUN npm ci --no-audit --no-fund/.test(dockerfile) && /RUN npm ci --omit=dev --no-audit --no-fund/.test(dockerfile));
  assertCheck('Dockerfile gate inclui qa:100x', /npm test && npm run qa && npm run qa:100x/.test(dockerfile));
  assertCheck('Dockerfile roda como usuário não-root', /USER app/.test(dockerfile) && /adduser/.test(dockerfile));
  assertCheck('Dockerfile expõe healthcheck /api/live', /HEALTHCHECK/.test(dockerfile) && /\/api\/live/.test(dockerfile));
  assertCheck('.dockerignore exclui segredos e artefatos pesados', ['.env', '.env.*', 'node_modules', '.git', 'coverage'].every((item) => dockerignore.includes(item)));
  assertCheck('docker-compose mantém client RapidAPI key bloqueada', /ALLOW_CLIENT_RAPIDAPI_KEY:\s+"false"/.test(compose));
  assertCheck('docker-compose documenta REAL_INVOKE_TOKEN e METRICS_TOKEN', /REAL_INVOKE_TOKEN/.test(compose) && /METRICS_TOKEN/.test(compose));
}

function sourceSecurityChecks() {
  const files = [
    'server.js',
    ...fs.readdirSync('src').filter((f) => f.endsWith('.js')).map((f) => `src/${f}`),
    ...fs.readdirSync('src/middleware').filter((f) => f.endsWith('.js')).map((f) => `src/middleware/${f}`),
    ...fs.readdirSync('public/js').filter((f) => f.endsWith('.js')).map((f) => `public/js/${f}`),
  ];
  const combined = files.map((f) => `\n// ${f}\n${read(f)}`).join('\n');
  const logger = read('src/logger.js');
  const validation = read('src/middleware/validation.js');
  const server = read('server.js');
  const security = read('src/middleware/security.js');
  const allTextFiles = walk('.')
    .filter((f) => /\.(js|mjs|json|md|yaml|yml|html|css|example|gitignore|dockerignore)$/.test(f))
    .filter((f) => !f.startsWith('data/bets-apis/'));
  const allText = allTextFiles.map((f) => `\n// ${f}\n${read(f)}`).join('\n');

  assertCheck('não há eval()', !/\beval\s*\(/.test(combined));
  assertCheck('não há new Function()', !/new\s+Function\s*\(/.test(combined));
  assertCheck('não há document.write()', !/document\.write\s*\(/.test(combined));
  assertCheck('não há setTimeout/setInterval com string', !/set(?:Timeout|Interval)\s*\(\s*[`'"]/.test(combined));
  assertCheck('CSP não permite unsafe-inline em script-src', !/script-src[^\n]+unsafe-inline/.test(security));
  assertCheck('CSP restringe object/base/form/frame', ['object-src \'none\'', 'base-uri \'self\'', 'form-action \'self\'', 'frame-ancestors \'none\''].every((v) => security.includes(v)));
  assertCheck('security headers incluem nosniff/deny/hsts/referrer/permissions', ['X-Content-Type-Options', 'X-Frame-Options', 'Strict-Transport-Security', 'Referrer-Policy', 'Permissions-Policy'].every((h) => security.includes(h)));
  assertCheck('config falha CORS credentials com wildcard', /CORS_CREDENTIALS=true não pode/.test(read('src/config.js')));
  assertCheck('production com RAPIDAPI_KEY exige REAL_INVOKE_TOKEN', /REAL_INVOKE_TOKEN é obrigatório/.test(read('src/config.js')));
  assertCheck('invoker usa UPSTREAM_TIMEOUT_MS configurável', /config\.UPSTREAM_TIMEOUT_MS/.test(read('src/invoker.js')));
  assertCheck('catálogo valida shape no loadCatalog', /validateApiShape\(api\)/.test(read('src/catalog.js')));
  assertCheck('request-id aplica regex segura e limite 64', /incoming\.length <= 64/.test(read('src/middleware/request-id.js')) && /\^\[A-Za-z0-9\._:-\]\+\$/.test(read('src/middleware/request-id.js')));
  assertCheck('validation rejeita URL absoluta, protocol-relative, fragmento e controle', /URL absoluta/.test(validation) && /startsWith\('\/\/'\)/.test(validation) && /includes\('#'\)/.test(validation) && /\\u0000-\\u001f/.test(validation));
  assertCheck('validation limita apiId, endpoint, query e rapidApiKey', ['id > 100000', 'length > 1000', 'k.length > 64', 'sv.length > 256', 'rapidApiKey.length > 200'].every((needle) => validation.includes(needle)));
  assertCheck('batch limita máximo de 50 itens', /body\.items\.length > 50/.test(validation));
  assertCheck('server limita JSON body a 64kb', /express\.json\(\{ limit: '64kb' \}\)/.test(server));
  assertCheck('server protege modo real antes do invoker', /validateBody\(invokeSchema\), requireRealInvokeAuth, async/.test(server));
  assertCheck('server protege metrics com requireMetricsToken', /app\.get\('\/api\/metrics', requireMetricsToken/.test(server) && /app\.get\('\/api\/metrics\/json', requireMetricsToken/.test(server));
  assertCheck('server suporta Bearer token para invoke/metrics', /authorization\.startsWith\('Bearer '\)/.test(server));
  assertCheck('server bloqueia rapidApiKey client-side quando desabilitada', /ALLOW_CLIENT_RAPIDAPI_KEY/.test(server) && /rapidApiKey no cliente está desabilitada/.test(server));
  assertCheck('server trunca payload de log-error', /truncate\(body\.message, 500\)/.test(server) && /truncate\(body\.stack, 3000\)/.test(server));
  assertCheck('logger redige rapidApiKey/authorization/cookie/tokens com chaves normalizadas', ['rapidapikey', 'authorization', 'cookie', 'x-invoke-token', 'x-metrics-token'].every((k) => logger.includes(`'${k}'`)) && /REDACT\.has\(k\.toLowerCase\(\)\)/.test(logger));
  assertCheck('localStorage não persiste rapidApiKey', !/safeSet\(['"]rapidApiKey/.test(read('public/js/storage.js')) && !/rapidApiKey/.test(read('public/js/storage.js')));
  assertCheck('não há credenciais reais hardcoded em arquivos de texto', !/(?:x-rapidapi-key|rapidapi_key|rapidApiKey)\s*[:=]\s*['"]?(?!$|<|REAL_KEY|client-key|server-key|rapid-secret)[A-Za-z0-9_-]{20,}/i.test(allText));
}

function configBootChecks() {
  let r = runConfigImport({ NODE_ENV: 'production', CORS_ORIGIN: '*', CORS_CREDENTIALS: 'true', RAPIDAPI_KEY: '', REAL_INVOKE_TOKEN: '' });
  assertCheck('config boot rejeita CORS credentials com wildcard', r.status !== 0 && /CORS_CREDENTIALS=true não pode/.test(r.stderr + r.stdout));
  r = runConfigImport({ NODE_ENV: 'production', RAPIDAPI_KEY: 'server-key', REQUIRE_REAL_AUTH: 'true', REAL_INVOKE_TOKEN: '', CORS_ORIGIN: 'https://example.com', CORS_CREDENTIALS: 'false' });
  assertCheck('config boot rejeita RAPIDAPI_KEY sem REAL_INVOKE_TOKEN em produção', r.status !== 0 && /REAL_INVOKE_TOKEN é obrigatório/.test(r.stderr + r.stdout));
  r = runConfigImport({ NODE_ENV: 'production', RAPIDAPI_KEY: 'server-key', REQUIRE_REAL_AUTH: 'true', REAL_INVOKE_TOKEN: 'token', CORS_ORIGIN: 'https://example.com', CORS_CREDENTIALS: 'false' });
  assertCheck('config boot aceita produção segura com token real', r.status === 0, r.stderr || r.stdout);
  r = runConfigImport({ NODE_ENV: 'production', PORT: '99999', RAPIDAPI_KEY: '', REAL_INVOKE_TOKEN: '', CORS_ORIGIN: 'https://example.com', CORS_CREDENTIALS: 'false' });
  assertCheck('config boot rejeita PORT fora do intervalo', r.status !== 0 && /PORT=99999/.test(r.stderr + r.stdout));
  r = runConfigImport({ NODE_ENV: 'production', UPSTREAM_TIMEOUT_MS: '1', RAPIDAPI_KEY: '', REAL_INVOKE_TOKEN: '', CORS_ORIGIN: 'https://example.com', CORS_CREDENTIALS: 'false' });
  assertCheck('config boot rejeita timeout upstream inseguro', r.status !== 0 && /UPSTREAM_TIMEOUT_MS=1/.test(r.stderr + r.stdout));
}

function catalogChecks() {
  const { apis, stats } = loadCatalog();
  const ids = new Set(apis.map((a) => a.id));
  const hosts = new Set(apis.map((a) => a.rapidapi_host));
  const zeroTelemetry = apis.filter((a) => a.popularity === 0 && a.latency_ms === 0 && a.success_rate_pct === 0);
  const hugeLatency = apis.filter((a) => a.latency_ms > 30_000);
  const subcategories = new Set(apis.map((a) => a.subcategory));
  const pricing = new Set(apis.map((a) => a.pricing));
  const partTotal = ['catalog.json', 'catalog-part2.json', 'catalog-part3.json']
    .map((file) => json(`data/bets-apis/${file}`).apis.length);

  assertCheck('catálogo tem exatamente 302 APIs', apis.length === 302);
  assertCheck('arquivos parciais somam 302 APIs', sum(partTotal) === 302, partTotal.join('+'));
  assertCheck('ids são únicos', ids.size === apis.length);
  assertCheck('ids são sequenciais sem lacunas 1..302', apis.map((a) => a.id).sort((a, b) => a - b).every((id, idx) => id === idx + 1));
  assertCheck('hosts são únicos', hosts.size === apis.length);
  assertCheck('todos hosts seguem *.p.rapidapi.com', apis.every((a) => /^[a-z0-9_-]+\.p\.rapidapi\.com$/i.test(a.rapidapi_host)));
  assertCheck('rapidapi_url aponta para página RapidAPI HTTPS', apis.every((a) => typeof a.rapidapi_url === 'string' && /^https:\/\/rapidapi\.com\//.test(a.rapidapi_url)));
  assertCheck('campos textuais obrigatórios são não vazios', apis.every((a) => [a.name, a.subcategory, a.pricing, a.rapidapi_url, a.rapidapi_host, a.description].every((v) => typeof v === 'string' && v.trim())));
  assertCheck('métricas numéricas estão em faixas esperadas', apis.every((a) => Number.isFinite(a.popularity) && a.popularity >= 0 && a.popularity <= 10 && Number.isFinite(a.latency_ms) && a.latency_ms >= 0 && Number.isFinite(a.success_rate_pct) && a.success_rate_pct >= 0 && a.success_rate_pct <= 100));
  assertCheck('stats por subcategoria somam 302', sum(Object.values(stats.bySubcategory)) === 302);
  assertCheck('stats por pricing somam 302', sum(Object.values(stats.byPricing)) === 302);
  assertCheck('subcategorias esperadas permanecem 8', subcategories.size === 8);
  assertCheck('pricing restrito a Freemium/Gratuito/Pago', [...pricing].every((p) => ['Freemium', 'Gratuito', 'Pago'].includes(p)));
  assertCheck('top_by_popularity tem 10 itens ordenados', stats.top_by_popularity.length === 10 && stats.top_by_popularity.every((item, idx, arr) => idx === 0 || arr[idx - 1].popularity >= item.popularity));
  assertCheck('histograma de popularidade soma 302', sum(stats.popularity_histogram.map((b) => b.count)) === 302);
  assertCheck('scatter exclui entradas sem telemetria', stats.scatter.every((p) => p.x > 0 && p.y > 0));
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
  const modules = [...html.matchAll(/<script\s+type="module"\s+src="([^"]+)"/g)].map((m) => m[1]);

  assertCheck('HTML declara lang pt-BR', /<html lang="pt-BR">/.test(html));
  assertCheck('viewport mobile correto', /width=device-width, initial-scale=1/.test(html));
  assertCheck('description meta presente', /<meta name="description"/.test(html));
  assertCheck('skip link aponta para workspace', /class="skip-link" href="#workspace"/.test(html));
  assertCheck('tabs têm role tablist/tab/tabpanel', /role="tablist"/.test(html) && count(html, /role="tab"/g) >= 3 && count(html, /role="tabpanel"/g) >= 3);
  assertCheck('todos botões HTML têm nome acessível estático ou texto', unnamedButtons.length === 0, JSON.stringify(unnamedButtons));
  assertCheck('todos dialogs têm aria-label/aria-labelledby', dialogs.length >= 5 && dialogs.every((attrs) => /aria-label|aria-labelledby/.test(attrs)));
  assertCheck('há aria-live para status/toasts/resultados', count(html, /aria-live=/g) >= 3);
  assertCheck('inputs têm id/aria ou estão em labels/templates controlados', inputs.every((attrs) => /id=|aria-label|tabindex="-1"|type="radio"/.test(attrs)));
  assertCheck('HTML não contém script inline', !/<script(?!\s+type="module"\s+src=)[^>]*>[\s\S]*?<\/script>/.test(html));
  assertCheck('app principal é carregado como módulo', modules.includes('./js/app.js'));
  assertCheck('CSS tem foco visível', /:focus-visible/.test(css));
  assertCheck('CSS respeita reduced motion', /prefers-reduced-motion/.test(css));
  assertCheck('CSS tem responsividade mobile/tablet', count(css, /@media\b/g) >= 8);
  assertCheck('CSS usa tokens de tema centralizados', count(css, /--[a-z0-9-]+:/g) >= 40);
  assertCheck('dashboard escapa nome em SVG title', /escape\(p\.name\)/.test(dashboard));
  assertCheck('confirmDialog não injeta HTML dinâmico', !/confirm-body'\)\.innerHTML/.test(app) && /confirm-body'\)\.textContent/.test(app));
  assertCheck('toTreeHTML escapa strings antes de innerHTML de tree', /escape\(value\)/.test(read('public/js/format.js')) && /treeEl\.innerHTML = toTreeHTML/.test(views));
  assertCheck('templates/drawer escapam ou usam textContent em campos textuais dinâmicos', /drawer-title'\)\.textContent = api\.name/.test(views) && /escape\(api\.description/.test(views) && /escape\(api\.rapidapi_url\)/.test(views));
}

function documentationFreshnessChecks() {
  const pkg = json('package.json');
  const readme = read('README.md');
  const ops = read('OPERATIONS.md');
  const audit = read('docs/audits/2026-05-15-auditoria-arquitetura-integracoes-ux.md');
  assertCheck('README não recomenda colar chave RapidAPI na UI em produção', !/cole sua chave na UI/i.test(readme));
  assertCheck('README documenta REAL_INVOKE_TOKEN', /REAL_INVOKE_TOKEN/.test(readme));
  assertCheck('README documenta qa:100x', /qa:100x/.test(readme));
  assertCheck('README badge de versão acompanha package.json', readme.includes(`version-${pkg.version}-blueviolet`));
  assertCheck('README engine acompanha package.json', /node-%3E%3D20/.test(readme));
  assertCheck('README homolog cita integration', /homolog\s+#.*integration/.test(readme));
  assertCheck('OPERATIONS não afirma que cliente pode enviar chave por request', !/cliente também pode enviar/i.test(ops));
  assertCheck('OPERATIONS documenta METRICS_TOKEN e ALLOW_CLIENT_RAPIDAPI_KEY', /METRICS_TOKEN/.test(ops) && /ALLOW_CLIENT_RAPIDAPI_KEY/.test(ops));
  assertCheck('OPERATIONS documenta secrets Kubernetes para real invoke', /REAL_INVOKE_TOKEN/.test(ops) && /secretKeyRef/.test(ops) && /metrics-token/.test(ops));
  assertCheck('auditoria arquitetura cobre microserviços, Node.js e UX', /microserviços/i.test(audit) && /Desenvolvimento Node\.js/.test(audit) && /experiência do usuário/i.test(audit));
}

function req(method, path, body, headers = {}, port = PORT) {
  return rawReq(method, path, body === undefined || body === null ? null : JSON.stringify(body), {
    'content-type': 'application/json',
    ...headers,
  }, port);
}

function rawReq(method, path, rawBody = null, headers = {}, port = PORT) {
  return new Promise((resolve, reject) => {
    const data = rawBody === null ? null : Buffer.from(rawBody);
    const r = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers: { 'content-length': data?.length || 0, ...headers },
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

async function startServer(port, env = {}) {
  const proc = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(port), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcs.push(proc);
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) break;
    try { if ((await req('GET', '/api/live', null, {}, port)).status === 200) return proc; }
    catch { /* booting */ }
    await sleep(80);
  }
  return proc;
}

async function dynamicSecurityChecks() {
  const proc = await startServer(PORT, {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    RATE_LIMIT_ENABLED: 'false',
    RAPIDAPI_KEY: 'server-key-for-auth-gate-only',
    REQUIRE_REAL_AUTH: 'true',
    REAL_INVOKE_TOKEN: 'invoke-token',
    ALLOW_CLIENT_RAPIDAPI_KEY: 'false',
    METRICS_TOKEN: 'metrics-token',
    UPSTREAM_TIMEOUT_MS: '100',
  });

  const live = await req('GET', '/api/live');
  assertCheck('servidor dinâmico sobe para QA 100x', proc.exitCode === null && live.status === 200);

  let r = await req('GET', '/api/health');
  assertCheck('health expõe headers de segurança', r.status === 200 && r.headers['x-content-type-options'] === 'nosniff' && r.headers['x-frame-options'] === 'DENY' && Boolean(r.headers['strict-transport-security']));
  assertCheck('CSP dinâmico bloqueia inline script', /script-src 'self'/.test(r.headers['content-security-policy'] || '') && !/script-src[^;]+unsafe-inline/.test(r.headers['content-security-policy'] || ''));
  r = await req('OPTIONS', '/api/invoke', null, {
    origin: 'http://localhost:3000',
    'access-control-request-method': 'POST',
    'access-control-request-headers': 'content-type, authorization, x-invoke-token, x-metrics-token',
  });
  assertCheck('preflight CORS dinâmico libera headers de auth', r.status === 204 && headerIncludes(r.headers, 'access-control-allow-headers', 'authorization') && headerIncludes(r.headers, 'access-control-allow-headers', 'x-invoke-token') && headerIncludes(r.headers, 'access-control-allow-headers', 'x-metrics-token'));
  r = await req('GET', '/api/metrics');
  assertCheck('metrics sem token retorna 401', r.status === 401);
  r = await req('GET', '/api/metrics', null, { authorization: 'Bearer wrong' });
  assertCheck('metrics bearer errado retorna 403', r.status === 403);
  r = await req('GET', '/api/metrics', null, { authorization: 'Bearer metrics-token' });
  assertCheck('metrics com Bearer token retorna 200', r.status === 200 && /app_uptime_seconds/.test(String(r.body)));
  r = await req('GET', '/api/metrics/json', null, { 'x-metrics-token': 'metrics-token' });
  assertCheck('metrics/json com token retorna snapshot', r.status === 200 && typeof r.body?.uptime_s === 'number' && typeof r.body?.counters === 'object');
  r = await req('POST', '/api/invoke', { apiId: 1, mode: 'real' });
  assertCheck('real invoke server-key sem token retorna 401 antes do upstream', r.status === 401);
  r = await req('POST', '/api/invoke', { apiId: 1, mode: 'real' }, { 'x-invoke-token': 'wrong' });
  assertCheck('real invoke token errado retorna 403', r.status === 403);
  r = await req('POST', '/api/invoke', { apiId: 99999, mode: 'real' }, { authorization: 'Bearer invoke-token' });
  assertCheck('real invoke aceita Bearer token antes da validação de catálogo', r.status === 404 && r.body?.request_id);
  r = await req('POST', '/api/invoke/batch', { mode: 'real', items: [{ apiId: 1 }] });
  assertCheck('batch real herdado sem token retorna 401', r.status === 401);
  r = await req('POST', '/api/invoke', { apiId: 1, mode: 'real', rapidApiKey: 'client-key' }, { 'x-invoke-token': 'invoke-token' });
  assertCheck('rapidApiKey client-side bloqueada retorna 403', r.status === 403 && /desabilitada/.test(r.body.error));
  r = await req('POST', '/api/invoke', { apiId: 1, mode: 'mock' });
  assertCheck('mock invoke continua sem token', r.status === 200 && r.body.ok === true);
  r = await req('POST', '/api/invoke', { apiId: 1, endpoint: 'https://evil.example' });
  assertCheck('endpoint absoluto https é rejeitado dinamicamente', r.status === 400);
  r = await req('POST', '/api/invoke', { apiId: 1, endpoint: '//evil.example/path' });
  assertCheck('endpoint protocol-relative é rejeitado dinamicamente', r.status === 400);
  r = await req('POST', '/api/invoke', { apiId: 1, endpoint: '/ok#fragment' });
  assertCheck('endpoint com fragment é rejeitado dinamicamente', r.status === 400);
  r = await rawReq('POST', '/api/invoke', JSON.stringify({ apiId: 1, endpoint: '/bad\u0001' }), { 'content-type': 'application/json' });
  assertCheck('endpoint com caractere de controle é rejeitado dinamicamente', r.status === 400);
  r = await req('GET', '/api/health', null, { 'x-request-id': 'id-com:ponto.123' });
  assertCheck('request-id válido é preservado dinamicamente', r.status === 200 && r.headers['x-request-id'] === 'id-com:ponto.123');
  r = await req('GET', '/api/health', null, { 'x-request-id': 'id com espaço' });
  assertCheck('request-id inválido é substituído dinamicamente', r.status === 200 && r.headers['x-request-id'] !== 'id com espaço');
  r = await rawReq('POST', '/api/invoke', '{malformed', { 'content-type': 'application/json' });
  assertCheck('JSON malformado retorna 400 dinamicamente', r.status === 400 && /JSON malformado/.test(r.body?.error || ''));
  r = await rawReq('POST', '/api/invoke', JSON.stringify({ apiId: 1, payload: 'x'.repeat(70_000) }), { 'content-type': 'application/json' });
  assertCheck('payload >64kb retorna 413 dinamicamente', r.status === 413);
  r = await req('POST', '/api/invoke/batch', { items: Array.from({ length: 51 }, (_, i) => ({ apiId: i + 1 })) });
  assertCheck('batch acima de 50 retorna 413 dinamicamente', r.status === 413);
  r = await req('GET', '/api/inexistente');
  assertCheck('404 de /api/* retorna JSON estruturado', r.status === 404 && r.body?.request_id);
  r = await req('GET', '/rota-spa-inexistente');
  assertCheck('fallback SPA não captura /api mas captura rota web', r.status === 200 && String(r.body).includes('APIS'));
}

async function dynamicRateLimitChecks() {
  const proc = await startServer(RATE_PORT, {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    RATE_LIMIT_ENABLED: 'true',
    RATE_LIMIT_WINDOW_MS: '60000',
    RATE_LIMIT_MAX_REQUESTS: '2',
    RATE_LIMIT_INVOKE_MAX: '1',
    RAPIDAPI_KEY: '',
    REAL_INVOKE_TOKEN: '',
    METRICS_TOKEN: '',
  });
  assertCheck('servidor de rate-limit sobe para QA 100x', proc.exitCode === null && (await req('GET', '/api/live', null, {}, RATE_PORT)).status === 200);
  let r = await req('GET', '/api/catalog?limit=1', null, {}, RATE_PORT);
  assertCheck('rate-limit primeira request normal passa', r.status === 200 && r.headers['x-ratelimit-limit'] === '2');
  r = await req('GET', '/api/catalog?limit=1', null, {}, RATE_PORT);
  assertCheck('rate-limit segunda request normal passa', r.status === 200 && r.headers['x-ratelimit-remaining'] === '0');
  r = await req('GET', '/api/catalog?limit=1', null, {}, RATE_PORT);
  assertCheck('rate-limit terceira request normal bloqueia 429', r.status === 429 && r.headers['retry-after']);
  r = await req('GET', '/api/live', null, {}, RATE_PORT);
  assertCheck('probes continuam isentas de rate-limit', r.status === 200 && !('x-ratelimit-limit' in r.headers));
}

async function main() {
  staticContractChecks();
  sourceSecurityChecks();
  configBootChecks();
  catalogChecks();
  frontendUxUiA11yChecks();
  documentationFreshnessChecks();
  await dynamicSecurityChecks();
  await dynamicRateLimitChecks();

  for (const proc of serverProcs) if (!proc.killed) proc.kill('SIGTERM');

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
  for (const proc of serverProcs) if (!proc.killed) proc.kill('SIGTERM');
  console.error('QA 100x crashed:', err);
  process.exit(1);
});
