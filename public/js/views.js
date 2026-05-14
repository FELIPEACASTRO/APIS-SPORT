// public/js/views.js
// Render do catálogo, da sessão e dos resultados. Sem React — DOM nativo + templates.

import { $, $$, pad3, prettyJson, toTreeHTML, escape, copyToClipboard } from './format.js';
import { toastOk, toastInfo } from './toast.js';

let _renderCallbacks = {};

export function bindRender(callbacks) {
  _renderCallbacks = callbacks;
}

// ── Tabs ────────────────────────────────────────────────────────────────────
export function renderTab(tab) {
  document.body.dataset.tab = tab;
  $$('#tab-catalog, #tab-session').forEach((b) => {
    const isActive = b.dataset.tab === tab;
    b.setAttribute('aria-selected', String(isActive));
  });
  $('#view-catalog').hidden = tab !== 'catalog';
  $('#view-session').hidden = tab !== 'session';
}

// ── Counters ────────────────────────────────────────────────────────────────
export function renderCounters(state) {
  if (state.stats) {
    $('#cnt-total').textContent     = state.stats.total;
    $('#cnt-freemium').textContent  = state.stats.stats.byPricing['Freemium'] || 0;
    $('#cnt-gratuito').textContent  = state.stats.stats.byPricing['Gratuito'] || 0;
    $('#cnt-pago').textContent      = state.stats.stats.byPricing['Pago']     || 0;
    $('#tab-count-catalog').textContent = state.stats.total;
  }
  $('#tab-count-session').textContent = state.results.length;
}

// ── Catalog list ────────────────────────────────────────────────────────────
export function renderCatalog(state) {
  const list = $('#catalog-list');
  list.innerHTML = '';

  const meta = $('#catalog-meta');
  meta.innerHTML = `Mostrando <strong>${state.filtered.length}</strong> de <strong>${state.catalog.length}</strong> APIs.`;

  if (state.filtered.length === 0) {
    list.innerHTML = `
      <li class="catalog-empty">
        <h3>Nada encontrado.</h3>
        <p>Tente afrouxar os filtros ou use um preset.</p>
      </li>
    `;
    return;
  }

  const tpl = $('#tpl-catalog-item');
  const frag = document.createDocumentFragment();
  for (const api of state.filtered) {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = api.id;
    if (state.selected.has(api.id)) node.dataset.selected = 'true';

    fill(node, 'id', pad3(api.id));
    fill(node, 'name', api.name);
    fillTag(node, 'subcategory', api.subcategory);
    fillTag(node, 'pricing', api.pricing, { pricing: api.pricing });
    fillTag(node, 'provider', api.provider || '—');
    fill(node, 'description', api.description || '');
    fill(node, 'rapidapi_host', api.rapidapi_host);
    fill(node, 'popularity', api.popularity);
    fill(node, 'latency_ms', api.latency_ms);
    fill(node, 'success_rate_pct', api.success_rate_pct);

    // Badge "sem dados" para APIs com popularity=0 (cerca de 35% do catálogo
    // — fidelidade ao dossiê fonte, telemetria não disponível no RapidAPI).
    if (api.popularity === 0) {
      const meta = node.querySelector('.catalog-item__meta');
      const badge = document.createElement('span');
      badge.className = 'tag tag--empty';
      badge.textContent = 'sem telemetria';
      badge.title = 'Dossiê fonte não registra popularidade/latência/sucesso para esta API';
      meta.appendChild(badge);
    }

    const cb = node.querySelector('.catalog-item__cb');
    cb.checked = state.selected.has(api.id);
    cb.addEventListener('change', () => _renderCallbacks.onToggle?.(api.id));

    // clicar no card abre drawer
    node.querySelector('[data-action="open-drawer"]').addEventListener('click', (e) => {
      e.preventDefault();
      _renderCallbacks.onOpenDrawer?.(api.id);
    });

    // teclado: Enter alterna seleção, Space também
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        _renderCallbacks.onToggle?.(api.id);
      }
    });

    frag.appendChild(node);
  }
  list.appendChild(frag);
}

// ── Tray ────────────────────────────────────────────────────────────────────
export function renderTray(state) {
  const tray = $('#tray');
  const count = state.selected.size;
  tray.dataset.state = count === 0 ? 'empty' : 'has';
  $('#tray-count').textContent = count;

  const chips = $('#tray-chips');
  chips.innerHTML = '';
  if (count > 0) {
    const tpl = $('#tpl-tray-chip');
    const ids = Array.from(state.selected);
    const frag = document.createDocumentFragment();
    for (const id of ids) {
      const api = state.catalog.find((a) => a.id === id);
      if (!api) continue;
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.querySelector('[data-field="name"]').textContent = `#${pad3(id)} ${api.name}`;
      node.querySelector('[data-action="remove"]').addEventListener('click', () =>
        _renderCallbacks.onToggle?.(id),
      );
      frag.appendChild(node);
    }
    chips.appendChild(frag);
  }

  const btn = $('#btn-execute');
  btn.disabled = count === 0 || state.invoking;
  btn.dataset.loading = String(state.invoking);
}

// ── Active filters chips ────────────────────────────────────────────────────
export function renderActiveFilters(state, onRemove) {
  const root = $('#active-filters');
  root.innerHTML = '';
  const filters = [];
  if (state.filters.query)         filters.push({ key: 'query',         label: `busca: "${state.filters.query}"` });
  if (state.filters.subcategory)   filters.push({ key: 'subcategory',   label: state.filters.subcategory });
  if (state.filters.pricing)       filters.push({ key: 'pricing',       label: state.filters.pricing });
  if (state.filters.minPopularity) filters.push({ key: 'minPopularity', label: `pop ≥ ${state.filters.minPopularity}` });
  if (filters.length === 0) return;

  for (const f of filters) {
    const chip = document.createElement('span');
    chip.className = 'chip chip--active';
    chip.innerHTML = `${escape(f.label)} <button aria-label="Remover filtro">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.22 4.22a.75.75 0 0 1 1.06 0L8 6.94l2.72-2.72a.75.75 0 1 1 1.06 1.06L9.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L8 9.06l-2.72 2.72a.75.75 0 0 1-1.06-1.06L6.94 8 4.22 5.28a.75.75 0 0 1 0-1.06Z" fill="currentColor"/></svg>
    </button>`;
    chip.querySelector('button').addEventListener('click', () => onRemove(f.key));
    root.appendChild(chip);
  }
}

// ── Mode visibility ─────────────────────────────────────────────────────────
export function renderModeFields(state) {
  $('#key-field').hidden = state.mode !== 'real';
}

// ── Results ─────────────────────────────────────────────────────────────────
export function renderResults(state) {
  const root  = $('#results-body');
  const empty = $('#results-empty');
  const btnExport = $('#btn-export');
  const btnClear  = $('#btn-clear-results');

  root.innerHTML = '';
  if (state.results.length === 0) {
    empty.hidden = false;
    btnExport.disabled = true;
    btnClear.disabled = true;
    return;
  }
  empty.hidden = true;
  btnExport.disabled = false;
  btnClear.disabled = false;

  const tpl = $('#tpl-result-card');
  const frag = document.createDocumentFragment();

  // mais recentes primeiro
  const items = [...state.results].reverse();
  for (const r of items) {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.state = r._pending ? 'pending' : (r.ok ? 'ok' : 'error');
    fill(node, 'api_id', `#${pad3(r.api_id)}`);
    fill(node, 'api_name', r.api_name);
    const badge = node.querySelector('[data-field="mode"]');
    badge.textContent = r.mode;
    badge.dataset.mode = r.mode;
    const stat = node.querySelector('[data-field="status"]');
    stat.textContent = r._pending ? 'pendente…' : `HTTP ${r.status}`;
    stat.dataset.ok = String(r.ok && !r._pending);
    fill(node, 'rapidapi_host', r.rapidapi_host);
    fill(node, 'endpoint', r.endpoint);
    fill(node, 'duration_ms', r.duration_ms ?? 0);

    const treeEl = node.querySelector('[data-field="tree"]');
    const jsonEl = node.querySelector('[data-field="json"]');
    const rawEl  = node.querySelector('[data-field="raw"]');
    treeEl.innerHTML = toTreeHTML(r.data);
    jsonEl.textContent = prettyJson(r.data);
    rawEl.textContent  = JSON.stringify(r.data);

    const tabs = node.querySelectorAll('.vtab');
    const body = node.querySelector('.result__viewer-body');
    tabs.forEach((t) => {
      t.addEventListener('click', () => {
        tabs.forEach((x) => x.setAttribute('aria-selected', String(x === t)));
        body.dataset.mode = t.dataset.mode;
      });
    });

    node.querySelector('[data-action="copy"]').addEventListener('click', async () => {
      const ok = await copyToClipboard(prettyJson(r.data));
      if (ok) toastOk('JSON copiado para a área de transferência.');
    });

    if (r.error) {
      const errEl = node.querySelector('[data-field="error"]');
      errEl.textContent = `erro: ${r.error}`;
      errEl.hidden = false;
    }

    frag.appendChild(node);
  }
  root.appendChild(frag);
}

// ── Drawer ──────────────────────────────────────────────────────────────────
export function renderDrawer(api) {
  $('#drawer-id').textContent = `#${pad3(api.id)}`;
  $('#drawer-title').textContent = api.name;
  $('#drawer-body').innerHTML = `
    <dl>
      <dt>Subcategoria</dt>     <dd>${escape(api.subcategory)}</dd>
      <dt>Preço</dt>            <dd><span class="tag tag--pricing" data-pricing="${escape(api.pricing)}">${escape(api.pricing)}</span></dd>
      <dt>Provedor</dt>         <dd>${escape(api.provider || '—')}</dd>
      <dt>Popularidade</dt>     <dd>${api.popularity}</dd>
      <dt>Latência</dt>         <dd>${api.latency_ms} ms <small>(reportada pelo RapidAPI)</small></dd>
      <dt>Sucesso</dt>          <dd>${api.success_rate_pct}%</dd>
      <dt>Host</dt>             <dd><code>${escape(api.rapidapi_host)}</code></dd>
    </dl>
    <p style="color:var(--ink-muted); font-size:0.92rem; line-height:1.5;">
      ${escape(api.description || '')}
    </p>
    <div class="drawer__cta">
      <button class="action" data-action="copy-host">Copiar host</button>
      <button class="action" data-action="select">Selecionar</button>
      <a class="action action--ghost" href="${escape(api.rapidapi_url)}" target="_blank" rel="noopener">
        Abrir no RapidAPI ↗
      </a>
    </div>
  `;
  $('#drawer-body [data-action="copy-host"]').addEventListener('click', async () => {
    const ok = await copyToClipboard(api.rapidapi_host);
    if (ok) toastOk(`Host de "${api.name}" copiado.`);
  });
  $('#drawer-body [data-action="select"]').addEventListener('click', () => {
    _renderCallbacks.onToggle?.(api.id);
    toastInfo('API adicionada à seleção.');
  });
}

// ── Status pill (top-right) ─────────────────────────────────────────────────
export function renderStatus({ state, label }) {
  const dot = $('#ts-dot');
  const lbl = $('#ts-label');
  dot.dataset.state = state;
  lbl.textContent = label;
}

// ── helpers ─────────────────────────────────────────────────────────────────
function fill(node, field, value) {
  const el = node.querySelector(`[data-field="${field}"]`);
  if (el) el.textContent = value;
}
/** Preenche texto e seta data-attributes explícitos no elemento (case-sensitive). */
function fillTag(node, field, value, dataAttrs = {}) {
  const el = node.querySelector(`[data-field="${field}"]`);
  if (!el) return;
  el.textContent = value;
  for (const [k, v] of Object.entries(dataAttrs)) {
    el.dataset[k] = v;
  }
}
