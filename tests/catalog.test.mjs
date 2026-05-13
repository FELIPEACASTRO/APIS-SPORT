// tests/catalog.test.mjs
// Valida que o catálogo está íntegro: 302 APIs, sem duplicatas de id,
// hosts no padrão *.p.rapidapi.com, distribuição por subcategoria/preço bate
// com a documentação do dossiê.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  loadCatalog,
  filterCatalog,
  getApiById,
  validateApiShape,
} from '../src/catalog.js';

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

test('catálogo carrega as 302 APIs', () => {
  const { apis } = loadCatalog();
  assert.equal(apis.length, EXPECTED.total, 'total deve ser 302');
});

test('todos os ids são únicos e sequenciais (1..302)', () => {
  const { apis } = loadCatalog();
  const ids = apis.map((a) => a.id).sort((a, b) => a - b);
  assert.deepEqual(ids, Array.from({ length: 302 }, (_, i) => i + 1));
});

test('toda API tem rapidapi_host no padrão *.p.rapidapi.com', () => {
  const { apis } = loadCatalog();
  for (const api of apis) {
    const v = validateApiShape(api);
    assert.equal(v.ok, true, `API #${api.id} ${api.name}: ${v.reason || 'ok'}`);
  }
});

test('distribuição por subcategoria bate com o dossiê', () => {
  const { stats } = loadCatalog();
  for (const [sub, expected] of Object.entries(EXPECTED.bySubcategory)) {
    assert.equal(stats.bySubcategory[sub], expected, `${sub}: esperava ${expected}`);
  }
});

test('distribuição por preço bate com o dossiê', () => {
  const { stats } = loadCatalog();
  for (const [pricing, expected] of Object.entries(EXPECTED.byPricing)) {
    assert.equal(stats.byPricing[pricing], expected, `${pricing}: esperava ${expected}`);
  }
});

test('filterCatalog por busca de texto retorna subset', () => {
  const full = filterCatalog();
  const pinnacle = filterCatalog({ query: 'pinnacle' });
  assert.ok(pinnacle.length > 0);
  assert.ok(pinnacle.length < full.length);
  for (const api of pinnacle) {
    const blob = `${api.name} ${api.provider} ${api.description}`.toLowerCase();
    assert.ok(blob.includes('pinnacle'), `${api.name} não tem "pinnacle"`);
  }
});

test('filterCatalog por subcategory + pricing combina restritivamente', () => {
  const oddsFreemium = filterCatalog({ subcategory: 'Odds', pricing: 'Freemium' });
  assert.ok(oddsFreemium.length > 0);
  for (const api of oddsFreemium) {
    assert.equal(api.subcategory, 'Odds');
    assert.equal(api.pricing, 'Freemium');
  }
});

test('filterCatalog por minPopularity descarta valores abaixo', () => {
  const top = filterCatalog({ minPopularity: 9.5 });
  assert.ok(top.length > 0);
  for (const api of top) assert.ok(api.popularity >= 9.5);
});

test('getApiById retorna por id e lança em id inexistente', () => {
  const api = getApiById(1);
  assert.equal(api.name, 'Tank01 MLB Live In-Game Real Time Statistics');
  assert.throws(() => getApiById(999999), /não encontrada/);
});

test('cache funciona: chamadas múltiplas retornam mesma referência', () => {
  const a = loadCatalog();
  const b = loadCatalog();
  assert.equal(a, b, 'cache deveria devolver o mesmo objeto');
});
