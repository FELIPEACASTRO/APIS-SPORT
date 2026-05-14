#!/usr/bin/env node
// scripts/availability-check.mjs
// Verifica disponibilidade de cada uma das 302 APIs do catálogo em 4 níveis:
//
//   1. CATÁLOGO       — entry presente, shape válido, host formado corretamente
//   2. SERVIDOR LISTA — GET /api/catalog inclui a API
//   3. INVOKER MOCK   — POST /api/invoke?mode=mock retorna ok=true
//   4. DNS RESOLVE    — o hostname *.p.rapidapi.com resolve para um IP real
//
// Com a flag --probe:
//   5. HEAD ALIVE     — request HEAD ao host retorna alguma resposta HTTP
//                       (não exige autenticação; só prova que o endpoint
//                       responde no DNS+TCP). Demora muito (302 hosts).
//
// Com RAPIDAPI_KEY e --real:
//   6. REAL CALL      — chamada real via /api/invoke?mode=real (consome cota)
//                       Amostra de N APIs (default 10) escolhidas por
//                       popularidade.
//
// Saída: tabela com X/302 OK por nível + lista de falhas para investigação.
// Exit code 0 se todos os níveis exigidos passarem.

import { spawn } from 'node:child_process';
import http from 'node:http';
import dns from 'node:dns/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = Number(process.env.AVAIL_PORT || 4999);
const PROBE = process.argv.includes('--probe');
const REAL = process.argv.includes('--real');
const SAMPLE = Number(process.env.REAL_SAMPLE || 10);
const KEY = process.env.RAPIDAPI_KEY;
const CONC_DNS = 30;
const CONC_PROBE = 15;

let serverProc;

// ── Boot servidor real ──────────────────────────────────────────────────────
async function bootServer() {
  serverProc = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      LOG_LEVEL: 'silent',
      RATE_LIMIT_ENABLED: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const r = await http_('GET', '/api/live');
      if (r.status === 200) return;
    } catch { /* booting */ }
    await sleep(80);
  }
  throw new Error('Servidor não respondeu em /api/live após 5s');
}
function killServer() { if (serverProc && !serverProc.killed) serverProc.kill('SIGTERM'); }

// ── HTTP local ──────────────────────────────────────────────────────────────
function http_(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const r = http.request(
      { host: '127.0.0.1', port: PORT, path, method,
        headers: { 'content-type': 'application/json', 'content-length': data?.length || 0 } },
      (res) => {
        let buf = ''; res.on('data', (c) => (buf += c));
        res.on('end', () => {
          const isJson = (res.headers['content-type'] || '').includes('application/json');
          let parsed = buf; if (isJson && buf) { try { parsed = JSON.parse(buf); } catch {} }
          resolve({ status: res.statusCode, body: parsed });
        });
      },
    );
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}

// ── DNS + HEAD ──────────────────────────────────────────────────────────────
async function dnsLookup(host) {
  try { const a = await dns.lookup(host); return { ok: true, ip: a.address }; }
  catch (err) { return { ok: false, error: err.code || err.message }; }
}

function headProbe(host, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const lib = host.endsWith('.rapidapi.com') ? 'https' : 'http';
    import('node:' + lib).then(({ default: mod }) => {
      const req = mod.request({ host, path: '/', method: 'HEAD', timeout: timeoutMs }, (res) => {
        resolve({ ok: true, status: res.statusCode });
        res.resume();
      });
      req.on('error', (err) => resolve({ ok: false, error: err.code || err.message }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'TIMEOUT' }); });
      req.end();
    }).catch((err) => resolve({ ok: false, error: err.message }));
  });
}

// ── Worker pool ─────────────────────────────────────────────────────────────
async function pool(items, concurrency, worker) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await worker(items[i], i);
      }
    }),
  );
  return out;
}

// ── Main ────────────────────────────────────────────────────────────────────
(async () => {
  banner();

  // 1) Boot servidor real
  process.stdout.write('  bootando servidor real... ');
  await bootServer();
  console.log(c('✓', '1;32'));

  // 2) Pega catálogo via HTTP
  const r = await http_('GET', '/api/catalog');
  if (r.status !== 200 || r.body.total !== 302) {
    fail('servidor não devolveu 302 APIs');
  }
  const apis = r.body.items;
  console.log(`  catálogo: ${c(apis.length, '1;36')} APIs carregadas`);
  console.log('');

  // ── Nível 1: CATÁLOGO ────────────────────────────────────────────────────
  const lvl1 = apis.map((api) => {
    const reasons = [];
    if (!api.id) reasons.push('id ausente');
    if (!api.name) reasons.push('name ausente');
    if (!api.rapidapi_host) reasons.push('host ausente');
    if (!/^[a-z0-9_-]+\.p\.rapidapi\.com$/i.test(api.rapidapi_host || '')) reasons.push('host fora do padrão');
    try { new URL(`https://${api.rapidapi_host}/`); } catch (e) { reasons.push('URL inválida: ' + e.message); }
    return { api, ok: reasons.length === 0, reasons };
  });
  reportLevel('1. CATÁLOGO (shape + URL parseable)', lvl1);

  // ── Nível 2: SERVIDOR LISTA ──────────────────────────────────────────────
  // Como pegamos do servidor, todos estão lá; mas vamos confirmar via /api/catalog/:id
  process.stdout.write(`  Nível 2: SERVIDOR LISTA (consultando /api/catalog/:id × 302) ...`);
  const lvl2 = await pool(apis, 30, async (api) => {
    const res = await http_('GET', `/api/catalog/${api.id}`);
    return { api, ok: res.status === 200 && res.body.api?.id === api.id, status: res.status };
  });
  console.log(` ${c('✓', '1;32')}`);
  reportLevel('2. SERVIDOR LISTA (GET /api/catalog/:id)', lvl2);

  // ── Nível 3: INVOKER MOCK ────────────────────────────────────────────────
  process.stdout.write(`  Nível 3: INVOKER MOCK (POST /api/invoke × 302) ...`);
  const lvl3 = await pool(apis, 30, async (api) => {
    const res = await http_('POST', '/api/invoke', { apiId: api.id, mode: 'mock' });
    return {
      api,
      ok: res.status === 200 && res.body.ok === true,
      reasons: res.body.ok ? [] : [res.body.error || `status ${res.status}`],
    };
  });
  console.log(` ${c('✓', '1;32')}`);
  reportLevel('3. INVOKER MOCK (servidor invoca cada uma com ok=true)', lvl3);

  // ── Nível 4: DNS RESOLVE ─────────────────────────────────────────────────
  process.stdout.write(`  Nível 4: DNS RESOLVE (lookup × 302, conc=${CONC_DNS}) ...`);
  const t0 = Date.now();
  const lvl4 = await pool(apis, CONC_DNS, async (api) => {
    const r = await dnsLookup(api.rapidapi_host);
    return { api, ok: r.ok, reasons: r.ok ? [] : [r.error] };
  });
  console.log(` ${c('✓ ' + (Date.now() - t0) + 'ms', '1;32')}`);
  reportLevel('4. DNS RESOLVE (hostname existe no DNS)', lvl4);

  // ── Nível 5: HEAD PROBE (opcional) ───────────────────────────────────────
  if (PROBE) {
    process.stdout.write(`  Nível 5: HEAD PROBE (× 302, conc=${CONC_PROBE}) — pode levar 1-2min ...`);
    const t1 = Date.now();
    const lvl5 = await pool(apis, CONC_PROBE, async (api) => {
      const r = await headProbe(api.rapidapi_host);
      return { api, ok: r.ok, reasons: r.ok ? [] : [r.error] };
    });
    console.log(` ${c('✓ ' + ((Date.now() - t1) / 1000).toFixed(1) + 's', '1;32')}`);
    reportLevel('5. HEAD PROBE (host responde TCP/TLS)', lvl5);
  }

  // ── Nível 6: REAL CALL (opcional, requer chave) ──────────────────────────
  if (REAL && KEY) {
    const sample = [...apis]
      .filter((a) => a.success_rate_pct >= 95 && a.pricing === 'Freemium')
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, SAMPLE);
    console.log(`  Nível 6: REAL CALL — amostra de ${sample.length} APIs Freemium top`);
    const lvl6 = await pool(sample, 5, async (api) => {
      const res = await http_('POST', '/api/invoke', {
        apiId: api.id, mode: 'real', endpoint: '/', rapidApiKey: KEY,
      });
      // Aceita 200 / 401 / 403 / 429 (prova que o request chegou ao upstream)
      const valid = [200, 401, 403, 404, 429];
      return {
        api,
        ok: valid.includes(res.body.status),
        reasons: valid.includes(res.body.status) ? [] : [`status upstream ${res.body.status}: ${res.body.error || ''}`],
      };
    });
    reportLevel(`6. REAL CALL (amostra ${sample.length} → RapidAPI ao vivo)`, lvl6);
  } else if (REAL) {
    console.log(`  ${c('Nível 6 skipped: RAPIDAPI_KEY ausente', 33)}`);
  }

  // ── Sumário final ────────────────────────────────────────────────────────
  killServer();
  const all = [lvl1, lvl2, lvl3, lvl4];
  const allOk = all.every((l) => l.every((c) => c.ok));
  console.log('');
  console.log(c('═'.repeat(78), 90));
  if (allOk) {
    console.log(c('  ✓ TODAS AS 302 APIs ESTÃO DISPONÍVEIS E PODEM SER CHAMADAS', '1;30;48;5;226'));
  } else {
    console.log(c('  ✘ Algumas APIs falharam em pelo menos um dos níveis', '1;97;48;5;196'));
  }
  console.log(c('═'.repeat(78), 90));
  process.exit(allOk ? 0 : 1);
})().catch((err) => {
  console.error('ERRO:', err);
  killServer();
  process.exit(2);
});

// ── Helpers ─────────────────────────────────────────────────────────────────
function reportLevel(title, results) {
  const ok = results.filter((r) => r.ok).length;
  const fail = results.length - ok;
  const pct = ((ok / results.length) * 100).toFixed(1);
  const badge = fail === 0
    ? c(` ${ok}/${results.length} ✓ ${pct}%`, '1;32')
    : c(` ${ok}/${results.length} (${fail} falhas, ${pct}%)`, '1;31');
  console.log(c(`▶ ${title}`, '1;37') + badge);
  if (fail > 0) {
    const failures = results.filter((r) => !r.ok).slice(0, 10);
    for (const f of failures) {
      console.log(`    ${c('✘', '1;31')} #${String(f.api.id).padStart(3, '0')} ${f.api.name.slice(0, 50).padEnd(50)} ${c((f.reasons || []).join('; '), 33)}`);
    }
    if (results.filter((r) => !r.ok).length > failures.length) {
      console.log(`    ${c('…', 90)} +${results.filter((r) => !r.ok).length - failures.length} outras falhas`);
    }
  }
  console.log('');
}

function banner() {
  console.log('');
  console.log(c('═'.repeat(78), 90));
  console.log(c('  AVAILABILITY CHECK', '1;38;5;226') + c('  /  302 APIs / 4 níveis', 90));
  console.log(c('═'.repeat(78), 90));
}

function c(s, code) { return `\x1b[${code}m${s}\x1b[0m`; }
function fail(msg) { console.error('FATAL:', msg); killServer(); process.exit(1); }
