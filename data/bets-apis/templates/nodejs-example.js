/**
 * Exemplo de chamada às APIs de bets do RapidAPI em Node.js.
 *
 * Requer: npm install axios
 * Uso:    RAPIDAPI_KEY=sua_chave node nodejs-example.js
 *
 * O catálogo completo das 302 APIs está em ../catalog.json (+ part2/part3).
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
if (!RAPIDAPI_KEY) {
  console.error('Defina a variável RAPIDAPI_KEY antes de executar.');
  process.exit(1);
}

/**
 * Cria um cliente axios para uma API específica do RapidAPI a partir do host.
 * @param {string} host - p.ex. 'pinnacle-odds-api.p.rapidapi.com'
 */
function rapidApiClient(host) {
  return axios.create({
    baseURL: `https://${host}`,
    headers: {
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': host,
    },
    timeout: 10_000,
  });
}

/**
 * Carrega o catálogo de APIs (combinação dos três arquivos JSON).
 */
function loadCatalog() {
  const dir = path.join(__dirname, '..');
  const parts = ['catalog.json', 'catalog-part2.json', 'catalog-part3.json'];
  const all = [];
  for (const file of parts) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
    all.push(...data.apis);
  }
  return all;
}

/**
 * Procura uma API pelo nome (busca parcial, case-insensitive).
 */
function findApi(catalog, query) {
  const q = query.toLowerCase();
  return catalog.filter((api) => api.name.toLowerCase().includes(q));
}

// ---------------------------------------------------------------------------
// Exemplo 1 — Chamar Pinnacle Odds API
// ---------------------------------------------------------------------------
async function exemploPinnacleOdds() {
  const client = rapidApiClient('pinnacle-odds-api.p.rapidapi.com');
  const { data } = await client.get('/v1/sports');
  console.log('Sports na Pinnacle:', data);
}

// ---------------------------------------------------------------------------
// Exemplo 2 — Encontrar e listar todas as APIs Pinnacle no catálogo
// ---------------------------------------------------------------------------
function exemploListarPinnacle() {
  const catalog = loadCatalog();
  const pinnacleApis = findApi(catalog, 'pinnacle');
  console.log(`Encontradas ${pinnacleApis.length} APIs Pinnacle:`);
  for (const api of pinnacleApis) {
    console.log(`  [${api.id}] ${api.name}  →  ${api.rapidapi_host}`);
  }
}

// ---------------------------------------------------------------------------
// Exemplo 3 — Filtrar apenas APIs Freemium com popularidade ≥ 9.5
// ---------------------------------------------------------------------------
function exemploTopFreemium() {
  const catalog = loadCatalog();
  const top = catalog
    .filter((api) => api.pricing === 'Freemium' && api.popularity >= 9.5)
    .sort((a, b) => b.popularity - a.popularity);
  console.log(`Top ${top.length} APIs Freemium (popularidade ≥ 9.5):`);
  for (const api of top.slice(0, 20)) {
    console.log(
      `  ${api.popularity}  ${api.name.padEnd(45)}  ${api.subcategory}`
    );
  }
}

(async () => {
  exemploListarPinnacle();
  exemploTopFreemium();
  // Descomente para chamar a API real (consome cota):
  // await exemploPinnacleOdds();
})().catch((err) => {
  console.error('Erro:', err.response?.status, err.response?.data || err.message);
  process.exit(1);
});
