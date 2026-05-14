// @ts-check
// public/js/state.js
// Store reativo simples. Sem framework — emit/subscribe nativo.

class Store extends EventTarget {
  constructor(initial) {
    super();
    this._state = structuredClone(initial);
  }
  get() { return this._state; }
  set(patch) {
    Object.assign(this._state, patch);
    this.dispatchEvent(new CustomEvent('change', { detail: this._state }));
  }
  on(handler) {
    this.addEventListener('change', (e) => handler(e.detail));
    handler(this._state);
  }
}

export const state = new Store({
  tab: 'catalog',          // 'catalog' | 'session'
  catalog: [],
  filtered: [],
  stats: null,
  selected: new Set(),
  filters: { query: '', subcategory: '', pricing: '', minPopularity: 0, sort: 'popularity' },
  hideEmpty: false,        // esconder APIs sem telemetria (popularity === 0)
  activeFilters: [],
  mode: 'mock',            // 'mock' | 'real'
  rapidApiKey: '',
  endpoint: '/',
  invoking: false,
  results: [],
  serverHasKey: false,
});
