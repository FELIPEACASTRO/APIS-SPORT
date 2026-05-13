// public/js/presets.js
// Definições dos presets clicáveis (chips). Cada preset descreve filtros e/ou
// um conjunto de ids a serem pré-selecionados.

export const PRESETS = {
  top10: {
    label: 'Top 10 mais populares',
    filters: { sort: 'popularity', minPopularity: 9.7 },
    selectIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  },
  'freemium-top': {
    label: 'Freemium ≥ 9.5 pop.',
    filters: { pricing: 'Freemium', minPopularity: 9.5, sort: 'popularity' },
  },
  pinnacle: {
    label: 'Pinnacle (5)',
    filters: { query: 'pinnacle', sort: 'popularity' },
  },
  bet365: {
    label: 'Bet365 (8)',
    filters: { query: 'bet365', sort: 'popularity' },
  },
  betfair: {
    label: 'Betfair (7)',
    filters: { query: 'betfair', sort: 'popularity' },
  },
  'odds-only': {
    label: 'Apenas Odds',
    filters: { subcategory: 'Odds', sort: 'popularity' },
  },
  predicao: {
    label: 'Predição',
    filters: { subcategory: 'Predicao', sort: 'popularity' },
  },
  esports: {
    label: 'Esports / CS2',
    filters: { query: 'esports', sort: 'popularity' },
  },
  cleanup: {
    label: 'Limpar tudo',
    reset: true,
  },
};
