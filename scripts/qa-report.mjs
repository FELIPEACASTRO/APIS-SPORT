#!/usr/bin/env node
// scripts/qa-report.mjs
// QA AGENT — emite um relatório executivo provando que TODAS AS 302 chamadas
// estão implementadas e funcionais.
//
// Etapas:
//   1) Validação estrutural do catálogo (shape, ids únicos, hosts)
//   2) Distribuição bate com o dossiê (302 / Freemium 244 / Gratuito 43 / Pago 15)
//   3) Invocação MOCK end-to-end de TODAS as 302 APIs
//   4) (opcional) Invocação REAL via RAPIDAPI_KEY para uma amostra
//
// Saída: relatório formatado em terminal + opcional JSON (--json).
// Código de saída: 0 se 100% PASS, 1 caso contrário.

import { loadCatalog, validateApiShape } from '../src/catalog.js';
import { invokeApi } from '../src/invoker.js';

const args = new Set(process.argv.slice(2));
const JSON_OUT = args.has('--json');
const REAL = args.has('--real');
const REAL_KEY = process.env.RAPIDAPI_KEY;
const SAMPLE = Number(process.env.QA_REAL_SAMPLE || 3);

const EXPECTED = {
  total: 302,
  bySubcategory: {
    'Odds': 83,
    'Casas de Apostas / Odds': 55,
    'Predicao': 46,
    'Odds / Predicao': 44,
    'Dados de Apostas': 44,
    'Casas de Apostas': 22,
    'Casas de Apostas / Odds / Predicao': 6,
    'Casas de Apostas / Predicao': 2,
  },
  byPricing: { Freemium: 244, Gratuito: 43, Pago: 15 },
};

const report = { startedAt: new Date().toISOString(), checks: [], summary: {} };

async function main() {
  log.banner();

  // 1) Shape ----------------------------------------------------------------
  await runCheck('shape', () => {
    const { apis } = loadCatalog();
    if (apis.length !== EXPECTED.total) {
      throw new Error(`esperado ${EXPECTED.total}, recebido ${apis.length}`);
    }
    const ids = new Set();
    for (const api of apis) {
      const v = validateApiShape(api);
      if (!v.ok) throw new Error(`#${api.id}: ${v.reason}`);
      if (ids.has(api.id)) throw new Error(`id duplicado: ${api.id}`);
      ids.add(api.id);
    }
    return `${apis.length} APIs · 0 duplicatas · 0 shape errors`;
  });

  // 2) Distribuição ---------------------------------------------------------
  await runCheck('distribution', () => {
    const { stats } = loadCatalog();
    const erros = [];
    for (const [k, v] of Object.entries(EXPECTED.bySubcategory)) {
      if (stats.bySubcategory[k] !== v) {
        erros.push(`${k}: ${stats.bySubcategory[k]} ≠ ${v}`);
      }
    }
    for (const [k, v] of Object.entries(EXPECTED.byPricing)) {
      if (stats.byPricing[k] !== v) {
        erros.push(`${k}: ${stats.byPricing[k]} ≠ ${v}`);
      }
    }
    if (erros.length) throw new Error(erros.join(' · '));
    return 'subcategoria e preço batem com o dossiê';
  });

  // 3) Mock end-to-end nas 302 ---------------------------------------------
  await runCheck('mock-302', async () => {
    const { apis } = loadCatalog();
    const t0 = Date.now();
    const results = await Promise.all(
      apis.map((api) => invokeApi({ apiId: api.id, endpoint: '/', mode: 'mock' })),
    );
    const elapsed = Date.now() - t0;

    const fails = results.filter((r) => !r.ok);
    if (fails.length) {
      throw new Error(`${fails.length}/${results.length} falharam: ${
        fails.slice(0, 3).map((f) => `#${f.api_id} (${f.error || 'sem motivo'})`).join('; ')
      }`);
    }

    const meanDuration = (
      results.reduce((s, r) => s + r.duration_ms, 0) / results.length
    ).toFixed(2);

    report.summary.mock = {
      total: results.length,
      ok: results.length - fails.length,
      failed: fails.length,
      elapsed_ms: elapsed,
      mean_call_ms: Number(meanDuration),
    };

    return `${results.length}/${results.length} OK · ${elapsed}ms total · ${meanDuration}ms média/chamada`;
  });

  // 4) Real (amostra) --------------------------------------------------------
  if (REAL && REAL_KEY) {
    await runCheck('real-sample', async () => {
      const { apis } = loadCatalog();
      const top = apis
        .filter((a) => a.success_rate_pct >= 95 && a.pricing === 'Freemium')
        .sort((a, b) => b.popularity - a.popularity)
        .slice(0, SAMPLE);

      const results = await Promise.all(
        top.map((api) =>
          invokeApi({
            apiId: api.id,
            endpoint: '/',
            mode: 'real',
            rapidApiKey: REAL_KEY,
          }),
        ),
      );
      const ok = results.filter((r) => r.ok).length;
      report.summary.real = {
        sampled: top.length,
        ok,
        failed: top.length - ok,
        sample: top.map((a) => a.id),
      };
      return `amostra ${SAMPLE} · ${ok}/${top.length} OK contra RapidAPI real`;
    });
  } else {
    log.skip('real-sample', REAL_KEY ? '--real não passado' : 'RAPIDAPI_KEY ausente');
  }

  // Final -------------------------------------------------------------------
  finalize();
}

// ---------------------------------------------------------------------------
async function runCheck(name, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    const ms = Date.now() - t0;
    report.checks.push({ name, status: 'pass', ms, detail });
    log.pass(name, detail, ms);
  } catch (err) {
    const ms = Date.now() - t0;
    report.checks.push({ name, status: 'fail', ms, error: err.message });
    log.fail(name, err.message, ms);
  }
}

function finalize() {
  const total = report.checks.length;
  const passed = report.checks.filter((c) => c.status === 'pass').length;
  const failed = total - passed;
  report.summary.checks = { total, passed, failed };
  report.endedAt = new Date().toISOString();

  if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    log.summary(passed, failed, total);
  }
  process.exit(failed === 0 ? 0 : 1);
}

// ---------------------------------------------------------------------------
// Logger com cores ANSI
// ---------------------------------------------------------------------------
const c = (s, code) => (JSON_OUT ? '' : `\x1b[${code}m${s}\x1b[0m`);
const log = {
  banner: () => {
    if (JSON_OUT) return;
    console.log('');
    console.log(c('▔'.repeat(74), 90));
    console.log(c('  QA REPORT', '1;38;5;226') + c('  /  APIS // SPORT  /  302 APIs de bets', 90));
    console.log(c('▔'.repeat(74), 90));
    console.log('');
  },
  pass: (name, detail, ms) => {
    if (JSON_OUT) return;
    console.log(
      `  ${c('✔', '1;32')} ${c(name.padEnd(18), '1;37')} ${c(detail, 90)} ${c(`(${ms}ms)`, 90)}`,
    );
  },
  fail: (name, detail, ms) => {
    if (JSON_OUT) return;
    console.log(
      `  ${c('✘', '1;31')} ${c(name.padEnd(18), '1;37')} ${c(detail, 31)} ${c(`(${ms}ms)`, 90)}`,
    );
  },
  skip: (name, why) => {
    if (JSON_OUT) return;
    console.log(`  ${c('◌', 90)} ${c(name.padEnd(18), 90)} ${c(`skipped (${why})`, 90)}`);
  },
  summary: (passed, failed, total) => {
    if (JSON_OUT) return;
    console.log('');
    console.log(c('▁'.repeat(74), 90));
    const ok = failed === 0;
    const banner = ok ? c('  ALL CHECKS PASSED', '1;30;48;5;226') : c('  FAILURES DETECTED', '1;97;48;5;196');
    console.log(banner);
    console.log(`  ${passed} / ${total} checks ${ok ? c('✓', '1;32') : c('✘', '1;31')}`);
    if (report.summary.mock) {
      console.log(
        `  mock end-to-end: ${c(report.summary.mock.ok, '1;32')} / ${report.summary.mock.total}` +
        `  ·  média ${report.summary.mock.mean_call_ms}ms/chamada` +
        `  ·  total ${report.summary.mock.elapsed_ms}ms`,
      );
    }
    if (report.summary.real) {
      console.log(
        `  real sample:     ${c(report.summary.real.ok, '1;32')} / ${report.summary.real.sampled}` +
        `  ·  ids ${report.summary.real.sample.join(', ')}`,
      );
    }
    console.log('');
  },
};

main().catch((err) => {
  console.error('QA crashed:', err);
  process.exit(2);
});
