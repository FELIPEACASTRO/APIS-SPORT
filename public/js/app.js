// @ts-check
// public/js/app.js
// Entry point — orquestra estado, serviços, atalhos e overlays.

import { state } from './state.js';
import { fetchHealth, fetchCatalog, fetchStats, invokeBatch } from './services.js';
import { $, $$, debounce, downloadJson, pad3 } from './format.js';
import {
  bindRender,
  renderTab,
  renderCounters,
  renderCatalog,
  renderTray,
  renderActiveFilters,
  renderModeFields,
  renderResults,
  renderDrawer,
  renderStatus,
} from './views.js';
import { renderDashboard } from './dashboard.js';
import { initPalette } from './palette.js';
import { initKeyboard } from './keyboard.js';
import { toastOk, toastInfo, toastWarn, toastError } from './toast.js';
import { PRESETS } from './presets.js';
import { readUrl, syncUrl, persistedSelection, persistedHistory, prefs } from './storage.js';

// ── Captura global de erros para diagnóstico ───────────────────────────────
function reportError(err, source) {
  console.error(`[${source}]`, err);
  try {
    fetch('/api/log-error', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: err?.message || String(err),
        stack: err?.stack || '',
        source: source || 'unknown',
      }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* nada */ }
}
window.addEventListener('error', (e) => reportError(e.error || e.message, 'window.error'));
window.addEventListener('unhandledrejection', (e) => reportError(e.reason, 'unhandledrejection'));

// ── Boot ────────────────────────────────────────────────────────────────────
init().catch((err) => {
  console.error('[init crashed]', err);
  reportError(err, 'init');
  renderStatus({ state: 'error', label: 'falha' });
  toastError('Erro na inicialização: ' + (err.message || 'desconhecido'));
});

async function init() {
  renderStatus({ state: 'pending', label: 'conectando…' });

  // 1) Hidratar URL + localStorage ANTES do fetch
  const urlState = readUrl();
  const savedSelection = persistedSelection.load();
  const savedHistory = persistedHistory.load();

  if (urlState.tab && ['catalog', 'session', 'dashboard'].includes(urlState.tab)) {
    state.set({ tab: urlState.tab });
  }
  state.set({
    filters: {
      query: urlState.q || '',
      subcategory: urlState.sub || '',
      pricing: urlState.pricing || '',
      minPopularity: urlState.pop || 0,
      sort: urlState.sort || 'popularity',
    },
    mode: urlState.mode || 'mock',
    hideEmpty: !!urlState.hideEmpty,
    selected: savedSelection,
    results: savedHistory,
  });

  // 2) Fetches em paralelo com tolerância a falhas — NÃO bloqueia mais
  //    a aplicação inteira se alguma chamada falhar. Continua com defaults.
  const [healthR, catalogR, statsR] = await Promise.allSettled([
    fetchHealth(),
    fetchCatalog(state.get().filters),
    fetchStats(),
  ]);

  const health = healthR.status === 'fulfilled' ? healthR.value : null;
  const catalog = catalogR.status === 'fulfilled' ? catalogR.value : { items: [] };
  const stats = statsR.status === 'fulfilled' ? statsR.value : null;

  state.set({
    serverHasKey: health?.server_has_rapidapi_key || false,
    catalog: catalog.items,
    filtered: state.get().hideEmpty
      ? catalog.items.filter((a) => a.popularity > 0)
      : catalog.items,
    stats,
  });

  // Notifica falhas individuais via toast (não bloqueia a UI)
  const failures = [];
  if (healthR.status === 'rejected') failures.push('health');
  if (catalogR.status === 'rejected') failures.push('catálogo');
  if (statsR.status === 'rejected') failures.push('stats');

  if (failures.length === 0) {
    renderStatus({ state: 'ok', label: 'pronto' });
    if (health?.server_has_rapidapi_key) {
      toastInfo('Chave RapidAPI detectada no servidor — modo real disponível.');
    }
  } else if (failures.length < 3) {
    renderStatus({ state: 'ok', label: 'parcial' });
    toastWarn(`Falha ao carregar: ${failures.join(', ')}. App continua disponível.`);
  } else {
    // Todas falharam — provavelmente servidor offline
    renderStatus({ state: 'error', label: 'offline' });
    toastError('Servidor não respondeu. Tente recarregar a página.');
  }

  // 3) Sincronizar inputs com state hidratado
  safe('syncFilterInputs', syncFilterInputs);
  safe('syncOtherInputs',  syncOtherInputs);

  // 4) Wire-up — cada um isolado, falha de um não derruba os outros
  safe('bindRender', () => bindRender({
    onToggle: toggleSelected,
    onOpenDrawer: openDrawer,
  }));
  safe('wireTabs',     wireTabs);
  safe('wireFilters',  wireFilters);
  safe('wirePresets',  wirePresets);
  safe('wireSession',  wireSession);
  safe('wireTray',     wireTray);
  safe('wireOverlays', wireOverlays);

  // 5) Palette
  let paletteCtrl = { open() {}, close() {} };
  safe('initPalette', () => {
    paletteCtrl = initPalette({
      getState: () => state.get(),
      onPick: (entry, mods) => onPalettePick(entry, mods),
    });
  });

  // 6) Atalhos globais
  safe('initKeyboard', () => initKeyboard({
    openPalette:    () => paletteCtrl.open(),
    focusSearch:    () => $('#f-query')?.focus(),
    switchTab:      (tab) => setTab(tab),
    execute:        () => executeSelected(),
    selectAllVisible: () => selectAllVisible(),
    clearSelection: () => clearSelection(),
    openShortcuts:  () => $('#shortcuts')?.showModal(),
    closeAll:       () => closeAllOverlays(),
  }));

  // 7) State → render reativo + persistência (cada operação em isolado)
  state.on((s) => {
    safe('renderCounters',      () => renderCounters(s));
    safe('renderCatalog',       () => renderCatalog(s));
    safe('renderTray',          () => renderTray(s));
    safe('renderActiveFilters', () => renderActiveFilters(s, removeFilter));
    safe('renderModeFields',    () => renderModeFields(s));
    safe('renderResults',       () => renderResults(s));
    safe('persistSelection',    () => persistedSelection.save(s.selected));
    safe('persistHistory',      () => persistedHistory.save(s.results));
    safe('syncUrl', () => syncUrl({
      tab: s.tab, filters: s.filters, mode: s.mode, hideEmpty: s.hideEmpty,
    }));
  });

  // Render inicial
  safe('renderTab', () => renderTab(state.get().tab));
  safe('refreshDashboard', () => {
    if (state.get().tab === 'dashboard') refreshDashboard();
  });

  // Onboarding na primeira visita
  safe('onboarding', () => {
    if (!prefs.hasSeenOnboarding()) {
      setTimeout(() => $('#onboarding')?.showModal(), 400);
    }
  });
}

// Wrapper que loga erros sem propagar — mantém o init "à prova de balas".
function safe(label, fn) {
  try { fn(); }
  catch (err) {
    console.warn(`[safe:${label}]`, err);
  }
}

// (showBootError / hideBootError / wireBootError removidos — UI nunca
//  é bloqueada por overlay fullscreen; falhas viram toast discreto)

// ── Tabs ────────────────────────────────────────────────────────────────────
function wireTabs() {
  $$('#tab-catalog, #tab-session, #tab-dashboard').forEach((b) => {
    b.addEventListener('click', () => setTab(b.dataset.tab));
  });
}
function setTab(tab) {
  state.set({ tab });
  renderTab(tab);
  if (tab === 'dashboard') refreshDashboard();
}

let dashboardLoaded = false;
async function refreshDashboard() {
  if (dashboardLoaded) return; // catálogo é estático em runtime, 1 fetch basta
  try {
    const stats = await fetchStats();
    renderDashboard(stats);
    dashboardLoaded = true;
  } catch (err) {
    toastError('Falha ao carregar stats: ' + err.message);
  }
}

// ── Filters ─────────────────────────────────────────────────────────────────
function wireFilters() {
  const q   = $('#f-query');
  const sub = $('#f-subcategory');
  const pri = $('#f-pricing');
  const pop = $('#f-minpop');
  const sort= $('#f-sort');
  const hideEmpty = $('#f-hide-empty');

  const apply = debounce(async () => {
    const next = {
      query: q.value.trim(),
      subcategory: sub.value,
      pricing: pri.value,
      minPopularity: Number(pop.value) || 0,
      sort: sort.value || 'popularity',
    };
    state.set({ filters: next });
    await refilter();
  }, 160);

  q.addEventListener('input', apply);
  sub.addEventListener('input', apply);
  pri.addEventListener('input', apply);
  pop.addEventListener('input', apply);
  sort.addEventListener('input', apply);
  hideEmpty.addEventListener('change', () => {
    state.set({ hideEmpty: hideEmpty.checked });
    refilter();
  });
}

async function refilter() {
  const s = state.get();
  try {
    let { items } = await fetchCatalog(s.filters);
    if (s.hideEmpty) {
      items = items.filter((api) => api.popularity > 0);
    }
    state.set({ filtered: items });
  } catch (err) {
    toastError(err.message);
  }
}

function removeFilter(key) {
  const f = { ...state.get().filters };
  if (key === 'minPopularity') f[key] = 0;
  else f[key] = '';
  state.set({ filters: f });
  syncFilterInputs();
  refilter();
}

// ── Presets ─────────────────────────────────────────────────────────────────
function wirePresets() {
  $$('.chip--preset').forEach((b) => {
    b.addEventListener('click', () => applyPreset(b.dataset.preset));
  });
}

async function applyPreset(name) {
  const preset = PRESETS[name];
  if (!preset) return;
  if (preset.reset) {
    state.set({
      filters: { query: '', subcategory: '', pricing: '', minPopularity: 0, sort: 'popularity' },
      selected: new Set(),
    });
    syncFilterInputs();
    await refilter();
    toastInfo('Tudo limpo.');
    return;
  }

  const f = { query: '', subcategory: '', pricing: '', minPopularity: 0, sort: 'popularity', ...preset.filters };
  state.set({ filters: f });
  syncFilterInputs();
  await refilter();

  if (preset.selectIds) {
    const selected = new Set(state.get().selected);
    for (const id of preset.selectIds) selected.add(id);
    state.set({ selected });
    toastOk(`Preset "${preset.label}" aplicado — ${preset.selectIds.length} pré-selecionadas.`);
  } else {
    toastInfo(`Preset "${preset.label}" aplicado.`);
  }
}

function syncFilterInputs() {
  const f = state.get().filters;
  $('#f-query').value       = f.query || '';
  $('#f-subcategory').value = f.subcategory || '';
  $('#f-pricing').value     = f.pricing || '';
  $('#f-minpop').value      = String(f.minPopularity || 0);
  $('#f-sort').value        = f.sort || 'popularity';
  $('#f-hide-empty').checked = !!state.get().hideEmpty;
}

function syncOtherInputs() {
  const s = state.get();
  // Mode radio
  $$('input[name="mode"]').forEach((r) => { r.checked = r.value === s.mode; });
}

// ── Selection ───────────────────────────────────────────────────────────────
function toggleSelected(id) {
  const selected = new Set(state.get().selected);
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  state.set({ selected });
}
function selectAllVisible() {
  const selected = new Set(state.get().selected);
  for (const api of state.get().filtered) selected.add(api.id);
  state.set({ selected });
  toastOk(`${state.get().filtered.length} adicionadas à seleção.`);
}
function clearSelection() {
  const previous = new Set(state.get().selected);
  if (previous.size === 0) return;
  state.set({ selected: new Set() });
  // Undo (restaura em 4s)
  toastWithAction(`${previous.size} seleção(ões) removidas`, 'Desfazer', () => {
    state.set({ selected: previous });
    toastInfo('Seleção restaurada.');
  });
}

function toastWithAction(body, actionLabel, onAction) {
  // simples: por enquanto, usa toastInfo com botão renderizado via DOM
  // limitação atual do toast.js: vamos só logar e usar prompt
  // melhor solução: mensagem com tempo extra + atalho
  const handler = () => { onAction(); document.removeEventListener('keydown', keyHandler); };
  const keyHandler = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
      e.preventDefault();
      handler();
    }
  };
  document.addEventListener('keydown', keyHandler);
  setTimeout(() => document.removeEventListener('keydown', keyHandler), 5000);
  toastInfo(`${body} · ${actionLabel.toLowerCase()} com Ctrl+Z`);
}

// ── Session ─────────────────────────────────────────────────────────────────
function wireSession() {
  $$('input[name="mode"]').forEach((r) => {
    r.addEventListener('change', (e) => {
      state.set({ mode: e.target.value });
      if (e.target.value === 'real' && !state.get().rapidApiKey && !state.get().serverHasKey) {
        toastWarn('Cole a sua chave RapidAPI para usar modo real.');
      }
    });
  });
  $('#f-key').addEventListener('input', (e) => state.set({ rapidApiKey: e.target.value }));
  $('#f-endpoint').addEventListener('input', (e) =>
    state.set({ endpoint: e.target.value || '/' }),
  );

  $('#btn-export').addEventListener('click', () => {
    const { results } = state.get();
    downloadJson(`apis-sport-results-${Date.now()}.json`, results);
    toastOk('Arquivo JSON baixado.');
  });
  $('#btn-clear-results').addEventListener('click', () => {
    const previous = [...state.get().results];
    if (previous.length === 0) return;
    state.set({ results: [] });
    toastWithAction(`${previous.length} resultado(s) limpos`, 'Desfazer', () => {
      state.set({ results: previous });
      toastInfo('Resultados restaurados.');
    });
  });
}

// ── Tray ────────────────────────────────────────────────────────────────────
function wireTray() {
  $('#btn-execute').addEventListener('click', executeSelected);
  $('#btn-clear-selection').addEventListener('click', clearSelection);
  $('#btn-cancel').addEventListener('click', cancelExecution);
  $('#tray-toggle').addEventListener('click', () => {
    // Em mobile, volta para Catálogo para revisar a seleção.
    // Em desktop, simplesmente foca o primeiro chip.
    setTab('catalog');
  });
}

let _executeAbort = null;

async function executeSelected() {
  const s = state.get();
  if (s.invoking) return;
  if (s.selected.size === 0) {
    toastWarn('Selecione ao menos uma API no Catálogo.');
    return;
  }
  if (s.mode === 'real' && !s.rapidApiKey && !s.serverHasKey) {
    toastWarn('Modo real requer chave RapidAPI — preencha em Sessão.');
    setTab('session');
    setTimeout(() => $('#f-key').focus(), 100);
    return;
  }

  // Confirmar batch grande em modo real (consome cota)
  if (s.mode === 'real' && s.selected.size > 20) {
    const ok = await confirmDialog({
      title: 'Batch grande em modo real',
      body: `Você está prestes a executar <strong>${s.selected.size} chamadas reais</strong> ao RapidAPI. Isso vai consumir cota da sua chave. Deseja continuar?`,
      confirmText: 'Executar',
    });
    if (!ok) return;
  }

  // muda para sessão para o usuário ver os resultados
  setTab('session');

  state.set({ invoking: true });
  toggleCancelButton(true);

  const ids = Array.from(s.selected);
  const items = ids.map((apiId) => ({
    apiId,
    endpoint: s.endpoint || '/',
    mode: s.mode,
  }));

  // Placeholders pendentes
  const pending = items.map(({ apiId }) => {
    const api = s.catalog.find((a) => a.id === apiId);
    return {
      ok: false,
      api_id: apiId,
      api_name: api?.name ?? `#${apiId}`,
      rapidapi_host: api?.rapidapi_host ?? '—',
      endpoint: s.endpoint || '/',
      mode: s.mode,
      status: 0,
      duration_ms: 0,
      data: { _pending: true },
      _pending: true,
    };
  });
  state.set({ results: [...s.results, ...pending] });

  _executeAbort = new AbortController();
  try {
    const j = await invokeBatch({
      items,
      mode: s.mode,
      rapidApiKey: s.mode === 'real' ? s.rapidApiKey : undefined,
      signal: _executeAbort.signal,
    });

    // remove os pendentes desta invocação e empilha os reais
    const results = state.get().results.filter((r) => !r._pending);
    state.set({ results: [...results, ...j.results] });

    if (j.failed === 0) {
      toastOk(`${j.succeeded} chamada(s) concluída(s) em modo ${s.mode}.`);
    } else if (j.succeeded === 0) {
      toastError(`Todas as ${j.failed} chamada(s) falharam.`);
    } else {
      toastWarn(`${j.succeeded}/${j.total} ok · ${j.failed} falha(s).`);
    }
  } catch (err) {
    const results = state.get().results.filter((r) => !r._pending);
    state.set({ results });
    if (err.name === 'AbortError') {
      toastInfo('Execução cancelada pelo usuário.');
    } else {
      toastError(`Erro de rede: ${err.message}`);
    }
  } finally {
    state.set({ invoking: false });
    toggleCancelButton(false);
    _executeAbort = null;
  }
}

function cancelExecution() {
  if (_executeAbort) {
    _executeAbort.abort();
  }
}
function toggleCancelButton(visible) {
  const btn = $('#btn-cancel');
  if (btn) btn.hidden = !visible;
}

// ── Drawer & Overlays ───────────────────────────────────────────────────────
function wireOverlays() {
  // Drawer
  $('#drawer-close').addEventListener('click', () => $('#drawer').close());
  $('#drawer').addEventListener('click', (e) => {
    if (e.target === $('#drawer')) $('#drawer').close();
  });

  // Shortcuts modal
  $('#open-shortcuts').addEventListener('click', () => $('#shortcuts').showModal());
  $('[data-close="shortcuts"]').addEventListener('click', () => $('#shortcuts').close());
  $('#shortcuts').addEventListener('click', (e) => {
    if (e.target === $('#shortcuts')) $('#shortcuts').close();
  });

  // Onboarding modal
  $('#open-help').addEventListener('click', () => $('#onboarding').showModal());
  $$('#onboarding [data-close="onboarding"]').forEach((b) =>
    b.addEventListener('click', () => {
      prefs.markOnboarded();
      $('#onboarding').close();
    }),
  );
  $('#onboarding').addEventListener('click', (e) => {
    if (e.target === $('#onboarding')) { prefs.markOnboarded(); $('#onboarding').close(); }
  });
  $('#onboarding [data-action="open-shortcuts-from-onboarding"]').addEventListener('click', () => {
    prefs.markOnboarded();
    $('#onboarding').close();
    $('#shortcuts').showModal();
  });
}

// ── Confirm dialog ─────────────────────────────────────────────────────────
function confirmDialog({ title, body, confirmText = 'Confirmar' }) {
  return new Promise((resolve) => {
    const dlg = $('#confirm');
    $('#confirm-title').textContent = title || 'Confirmar';
    $('#confirm-body').innerHTML = body || '';
    const btnOk = dlg.querySelector('[data-confirm="ok"]');
    const btnCancel = dlg.querySelector('[data-confirm="cancel"]');
    btnOk.textContent = confirmText;

    const cleanup = (result) => {
      btnOk.removeEventListener('click', onOk);
      btnCancel.removeEventListener('click', onCancel);
      dlg.removeEventListener('close', onClose);
      dlg.close();
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onClose = () => resolve(false);

    btnOk.addEventListener('click', onOk);
    btnCancel.addEventListener('click', onCancel);
    dlg.addEventListener('close', onClose);
    dlg.showModal();
  });
}

function openDrawer(id) {
  const api = state.get().catalog.find((a) => a.id === id);
  if (!api) return;
  renderDrawer(api);
  $('#drawer').showModal();
}

function closeAllOverlays() {
  ['#palette', '#drawer', '#shortcuts', '#onboarding', '#confirm'].forEach((sel) => {
    const el = $(sel);
    if (el?.open) el.close();
  });
}

// ── Palette pick handler ────────────────────────────────────────────────────
function onPalettePick(entry, mods) {
  if (entry.type === 'api') {
    if (mods.shift) {
      toggleSelected(entry.item.id);
      toastOk(`#${pad3(entry.item.id)} ${entry.item.name} ${state.get().selected.has(entry.item.id) ? 'adicionada' : 'removida'}.`);
    } else {
      openDrawer(entry.item.id);
    }
    return;
  }
  const a = entry.item.id;
  if (a === 'a:catalog')    setTab('catalog');
  else if (a === 'a:session') setTab('session');
  else if (a === 'a:select-all') selectAllVisible();
  else if (a === 'a:clear')   clearSelection();
  else if (a === 'a:execute') executeSelected();
}
