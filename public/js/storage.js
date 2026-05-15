// @ts-check
// public/js/storage.js
// Persistência cliente — URL params + localStorage.
//
//  - URL: tab ativa, filtros, modo (shareable links, deep linking)
//  - localStorage: seleção, histórico, preferências, onboarding "visto"
//
// Falha gracioso quando localStorage está bloqueado (privacy mode).

const LS_PREFIX = 'apisport.v3.';

// ── URL state ──────────────────────────────────────────────────────────────
/** @returns {{tab?: string, q?: string, sub?: string, pricing?: string, pop?: number, sort?: string, mode?: string, hideEmpty?: boolean}} */
export function readUrl() {
  const u = new URL(location.href);
  const out = {};
  if (u.searchParams.has('tab')) out.tab = u.searchParams.get('tab');
  if (u.searchParams.has('q')) out.q = u.searchParams.get('q');
  if (u.searchParams.has('sub')) out.sub = u.searchParams.get('sub');
  if (u.searchParams.has('pricing')) out.pricing = u.searchParams.get('pricing');
  if (u.searchParams.has('pop')) out.pop = Number(u.searchParams.get('pop')) || 0;
  if (u.searchParams.has('sort')) out.sort = u.searchParams.get('sort');
  if (u.searchParams.has('mode')) out.mode = u.searchParams.get('mode');
  if (u.searchParams.has('hide_empty')) out.hideEmpty = u.searchParams.get('hide_empty') === '1';
  return out;
}

/**
 * Sincroniza estado da app com URL sem reload.
 * Filtros vazios são omitidos para manter URL limpa.
 */
export function syncUrl({ tab, filters, mode, hideEmpty }) {
  const u = new URL(location.href);
  const params = u.searchParams;
  const setOrDel = (key, value) => {
    if (value === undefined || value === null || value === '' || value === 0 || value === false) {
      params.delete(key);
    } else {
      params.set(key, String(value));
    }
  };
  if (tab && tab !== 'catalog') params.set('tab', tab); else params.delete('tab');
  setOrDel('q', filters?.query);
  setOrDel('sub', filters?.subcategory);
  setOrDel('pricing', filters?.pricing);
  setOrDel('pop', filters?.minPopularity);
  if (filters?.sort && filters.sort !== 'popularity') params.set('sort', filters.sort);
  else params.delete('sort');
  if (mode && mode !== 'mock') params.set('mode', mode); else params.delete('mode');
  if (hideEmpty) params.set('hide_empty', '1'); else params.delete('hide_empty');

  const query = params.toString();
  const newUrl = u.pathname + (query ? '?' + query : '') + u.hash;
  history.replaceState(null, '', newUrl);
}

// ── localStorage (failsafe) ────────────────────────────────────────────────
function safeGet(key) {
  try { return localStorage.getItem(LS_PREFIX + key); }
  catch { return null; }
}
function safeSet(key, value) {
  try { localStorage.setItem(LS_PREFIX + key, value); return true; }
  catch { return false; }
}
function safeRemove(key) {
  try { localStorage.removeItem(LS_PREFIX + key); }
  catch { /* nada */ }
}

/** Seleção (set de ids) — persistida em LS */
export const persistedSelection = {
  /** @returns {Set<number>} */
  load() {
    const raw = safeGet('selection');
    if (!raw) return new Set();
    try { return new Set(JSON.parse(raw)); }
    catch { return new Set(); }
  },
  /** @param {Set<number>} set */
  save(set) {
    safeSet('selection', JSON.stringify([...set]));
  },
  clear() { safeRemove('selection'); },
};

/** Histórico de resultados — persistido (limite 50 para evitar quota) */
export const persistedHistory = {
  /** @returns {Array} */
  load() {
    const raw = safeGet('results');
    if (!raw) return [];
    try { return JSON.parse(raw); }
    catch { return []; }
  },
  /** @param {Array} results */
  save(results) {
    // mantém só os 50 mais recentes
    const trimmed = results.slice(-50);
    safeSet('results', JSON.stringify(trimmed));
  },
  clear() { safeRemove('results'); },
};

/** Preferências do usuário */
export const prefs = {
  hasSeenOnboarding() { return safeGet('onboarded') === '1'; },
  markOnboarded() { safeSet('onboarded', '1'); },
  resetOnboarding() { safeRemove('onboarded'); },
};
