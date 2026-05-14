// @ts-check
// public/js/dashboard.js
// Renderiza o dashboard analítico — charts em SVG nativo, zero deps.

import { $, pad3, escape } from './format.js';

/**
 * @typedef {Object} CatalogStats
 * @property {number} total
 * @property {Object<string, number>} bySubcategory
 * @property {Object<string, number>} byPricing
 * @property {number} providers_unique
 * @property {Array<{name: string, count: number}>} top_providers
 * @property {Array<Object>} top_by_popularity
 * @property {Array<{bin: string, range: [number, number], count: number}>} popularity_histogram
 * @property {{p50: number, p95: number, p99: number, max: number, mean: number}} latency
 * @property {{p50: number, mean: number, with_100: number, with_zero: number}} success_rate
 * @property {number} no_telemetry
 * @property {number} no_telemetry_pct
 * @property {Array<{id: number, name: string, x: number, y: number, r: number}>} scatter
 */

/**
 * @param {{total: number, stats: CatalogStats}} payload
 */
export function renderDashboard(payload) {
  const { total, stats } = payload;
  renderKpis(total, stats);
  renderSubcategoryChart(stats.bySubcategory);
  renderPricingDonut(stats.byPricing, total);
  renderPopularityHistogram(stats.popularity_histogram);
  renderProvidersChart(stats.top_providers);
  renderScatter(stats.scatter, stats.latency.p95);
  renderLeaderboard(stats.top_by_popularity);
}

// ── KPIs ────────────────────────────────────────────────────────────────────
function renderKpis(total, s) {
  setText('#kpi-total',      total);
  setText('#kpi-freemium',   s.byPricing.Freemium || 0);
  setText('#kpi-providers',  s.providers_unique);
  setText('#kpi-empty',      `${s.no_telemetry}`);
  setText('#kpi-lat-p50',    s.latency.p50);
  setText('#kpi-lat-p95',    s.latency.p95);
  setText('#kpi-succ-mean',  s.success_rate.mean);
}

// ── Bar chart horizontal genérico ───────────────────────────────────────────
/**
 * @param {Array<{label: string, value: number}>} rows
 * @param {string} tone
 */
function renderHorizontalBars(rows, tone = 'volt') {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return rows
    .map(
      (r) => `
      <div class="bar-row">
        <span class="bar-row__label" title="${escape(r.label)}">${escape(r.label)}</span>
        <div class="bar-row__track">
          <div class="bar-row__fill" data-tone="${tone}" style="width: ${(r.value / max) * 100}%"></div>
        </div>
        <span class="bar-row__value">${r.value}</span>
      </div>`,
    )
    .join('');
}

function renderSubcategoryChart(bySub) {
  const rows = Object.entries(bySub)
    .map(([label, value]) => ({ label: prettySub(label), value }))
    .sort((a, b) => b.value - a.value);
  const root = $('#chart-subcategory');
  if (root) root.innerHTML = renderHorizontalBars(rows, 'volt');
}

function renderProvidersChart(topProviders) {
  const rows = topProviders.map((p) => ({ label: p.name, value: p.count }));
  const root = $('#chart-providers');
  if (root) root.innerHTML = renderHorizontalBars(rows, 'cyan');
}

function prettySub(s) {
  return s
    .replace('Casas de Apostas', 'Casas')
    .replace('Predicao', 'Predição')
    .replace('Dados de Apostas', 'Dados');
}

// ── Pricing donut ───────────────────────────────────────────────────────────
function renderPricingDonut(byPricing, total) {
  const entries = Object.entries(byPricing); // [['Freemium', 244], ...]
  const colors = { Freemium: 'var(--volt)', Gratuito: 'var(--cyan)', Pago: 'var(--amber)' };

  const cx = 80, cy = 80, r = 56, sw = 18;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const arcs = entries
    .map(([label, value]) => {
      const frac = value / total;
      const dash = frac * circ;
      const arc = `
        <circle cx="${cx}" cy="${cy}" r="${r}"
          stroke="${colors[label]}" stroke-width="${sw}" fill="none"
          stroke-dasharray="${dash} ${circ - dash}"
          stroke-dashoffset="${-offset}"
          transform="rotate(-90 ${cx} ${cy})"
          style="transition: stroke-dasharray 800ms cubic-bezier(0.2,0.7,0.2,1);"
        />`;
      offset += dash;
      return arc;
    })
    .join('');

  const svg = `
    <svg class="donut" viewBox="0 0 160 160" role="img" aria-label="Distribuição por preço">
      <circle cx="${cx}" cy="${cy}" r="${r}" stroke="var(--line)" stroke-width="${sw}" fill="none"/>
      ${arcs}
      <text x="${cx}" y="${cy - 4}" text-anchor="middle"
        style="font-family: var(--ff-display); font-size: 30px; font-variation-settings: 'opsz' 144,'wght' 320,'SOFT' 50; fill: var(--ink);">${total}</text>
      <text x="${cx}" y="${cy + 18}" text-anchor="middle"
        style="font-family: var(--ff-mono); font-size: 9px; fill: var(--ink-muted); letter-spacing: 0.16em; text-transform: uppercase;">APIs</text>
    </svg>`;

  const legend = entries
    .map(([label, value]) => {
      const pct = ((value / total) * 100).toFixed(1);
      return `<div class="donut__legend-item" style="--c: ${colors[label]}">
        <span>${escape(label)}</span><small>${value} · ${pct}%</small>
      </div>`;
    })
    .join('');

  const root = $('#chart-pricing');
  if (root) root.innerHTML = svg + `<div class="donut__legend">${legend}</div>`;
}

// ── Histogram (popularidade) ────────────────────────────────────────────────
function renderPopularityHistogram(hist) {
  const W = 600, H = 200, M = { l: 28, r: 12, t: 20, b: 30 };
  const innerW = W - M.l - M.r, innerH = H - M.t - M.b;
  const max = Math.max(...hist.map((b) => b.count), 1);
  const barW = innerW / hist.length;
  const padX = 4;

  const bars = hist
    .map((b, i) => {
      const h = (b.count / max) * innerH;
      const x = M.l + i * barW + padX;
      const y = M.t + innerH - h;
      const w = barW - padX * 2;
      return `
        <g>
          <rect class="bar" x="${x}" y="${y}" width="${w}" height="${h}"
                style="animation: barGrow 700ms cubic-bezier(0.2,0.7,0.2,1) ${i * 40}ms both; transform-origin: ${x + w/2}px ${M.t + innerH}px; transform: scaleY(0);">
            <title>${b.bin}: ${b.count} APIs</title>
          </rect>
          <text class="count" x="${x + w / 2}" y="${y - 4}">${b.count}</text>
          <text class="tick" x="${x + w / 2}" y="${H - 12}" text-anchor="middle">${b.bin}</text>
        </g>`;
    })
    .join('');

  // Y-axis label
  const yTicks = [0, Math.floor(max / 2), max]
    .map(
      (v) => `<text class="tick" x="${M.l - 6}" y="${M.t + innerH - (v / max) * innerH + 3}" text-anchor="end">${v}</text>`,
    )
    .join('');

  const svg = `
    <svg class="histogram" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Histograma de popularidade">
      <style>
        .histogram .bar { animation-fill-mode: both !important; }
        @keyframes histBar { from { transform: scaleY(0); } to { transform: scaleY(1); } }
      </style>
      <line class="axis" x1="${M.l}" y1="${M.t + innerH}" x2="${W - M.r}" y2="${M.t + innerH}"/>
      <line class="axis" x1="${M.l}" y1="${M.t}" x2="${M.l}" y2="${M.t + innerH}"/>
      ${yTicks}
      ${bars}
    </svg>
  `;
  const root = $('#chart-popularity');
  if (root) root.innerHTML = svg;
}

// ── Scatter latency × success ───────────────────────────────────────────────
function renderScatter(points, latP95) {
  const W = 800, H = 320, M = { l: 50, r: 16, t: 16, b: 36 };
  const innerW = W - M.l - M.r, innerH = H - M.t - M.b;

  // X em escala log (latency 1–10000ms é grande demais para linear).
  // Mas usuário pode ter pontos com x=0 (mock data sem telemetria). Filtramos zeros no backend.
  // Usamos escala linear capada para clareza.
  const xMax = 10_000;
  const xToPx = (v) => M.l + (Math.min(v, xMax) / xMax) * innerW;
  const yToPx = (v) => M.t + innerH - (v / 100) * innerH;
  const rToPx = (r) => 2 + (r / 10) * 6; // popularity 0..9.9 → raio 2..8

  // Gridlines de Y (0, 25, 50, 75, 100%)
  const yGrid = [0, 25, 50, 75, 100]
    .map(
      (y) => `
      <line class="grid-line" x1="${M.l}" y1="${yToPx(y)}" x2="${W - M.r}" y2="${yToPx(y)}"/>
      <text class="tick" x="${M.l - 8}" y="${yToPx(y) + 3}" text-anchor="end">${y}%</text>
    `,
    )
    .join('');

  // X ticks: 0, 250, 1000, 2500, 5000, 10000
  const xTicks = [0, 250, 1000, 2500, 5000, 10000]
    .map(
      (x) => `
      <text class="tick" x="${xToPx(x)}" y="${H - 18}" text-anchor="middle">${x === 10000 ? '10k+' : x}</text>
    `,
    )
    .join('');

  // Linha de referência p95 latency
  const p95X = xToPx(latP95);
  const p95Line = `
    <line class="grid-line" x1="${p95X}" y1="${M.t}" x2="${p95X}" y2="${M.t + innerH}" stroke="var(--amber)" stroke-dasharray="4,4"/>
    <text class="tick" x="${p95X + 4}" y="${M.t + 12}" style="fill: var(--amber);">p95 ${latP95}ms</text>
  `;

  const dots = points
    .map(
      (p) => `<circle class="dot" cx="${xToPx(p.x)}" cy="${yToPx(p.y)}" r="${rToPx(p.r)}">
        <title>#${pad3(p.id)} ${p.name} · ${p.x}ms · ${p.y}% · pop ${p.r}</title>
      </circle>`,
    )
    .join('');

  const svg = `
    <svg class="scatter" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Scatter latency × success">
      ${yGrid}
      <line class="axis-line" x1="${M.l}" y1="${M.t + innerH}" x2="${W - M.r}" y2="${M.t + innerH}"/>
      <line class="axis-line" x1="${M.l}" y1="${M.t}" x2="${M.l}" y2="${M.t + innerH}"/>
      ${xTicks}
      ${p95Line}
      <text class="axis-label" x="${M.l + innerW / 2}" y="${H - 4}" text-anchor="middle">Latência (ms)</text>
      <text class="axis-label" x="14" y="${M.t + innerH / 2}" transform="rotate(-90 14 ${M.t + innerH / 2})" text-anchor="middle">Taxa de sucesso</text>
      ${dots}
    </svg>
  `;
  const root = $('#chart-scatter');
  if (root) root.innerHTML = svg;
}

// ── Leaderboard ─────────────────────────────────────────────────────────────
function renderLeaderboard(top) {
  const max = Math.max(...top.map((a) => a.popularity), 1);
  const root = $('#chart-leaderboard');
  if (!root) return;
  root.innerHTML = top
    .map(
      (a) => `
      <li data-id="${a.id}">
        <span></span>
        <div>
          <div class="leaderboard__name">${escape(a.name)}</div>
          <div class="leaderboard__sub">${escape(a.subcategory)} · ${escape(a.pricing)}</div>
        </div>
        <span class="leaderboard__bar" style="--w: ${(a.popularity / max) * 100}%"></span>
        <span class="leaderboard__pop">${a.popularity}</span>
      </li>`,
    )
    .join('');
}

function setText(sel, value) {
  const el = $(sel);
  if (el) el.textContent = String(value);
}
