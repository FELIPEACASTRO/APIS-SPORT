// @ts-check
// public/js/services.js
// Chamadas ao backend interno. SRP: rede.

// Aceita 200-299 OU 304 (Not Modified — browser deveria entregar do cache).
function ok(response) {
  return response.ok || response.status === 304;
}

export async function fetchHealth() {
  const r = await fetch('/api/health', { cache: 'no-store' });
  if (!ok(r)) throw new Error(`Falha no health-check (HTTP ${r.status})`);
  return r.json();
}

export async function fetchCatalog(filters = {}) {
  const params = new URLSearchParams();
  if (filters.query)         params.set('q', filters.query);
  if (filters.subcategory)   params.set('subcategory', filters.subcategory);
  if (filters.pricing)       params.set('pricing', filters.pricing);
  if (filters.minPopularity) params.set('minPopularity', filters.minPopularity);
  if (filters.sort)          params.set('sort', filters.sort);

  // cache: 'no-store' força o browser a buscar do servidor (não usa cache)
  const r = await fetch(`/api/catalog?${params}`, { cache: 'no-store' });
  if (!ok(r)) throw new Error(`Falha ao listar catálogo (HTTP ${r.status})`);
  return r.json();
}

export async function fetchStats() {
  const r = await fetch('/api/catalog/stats', { cache: 'no-store' });
  if (!ok(r)) throw new Error(`Falha ao buscar stats (HTTP ${r.status})`);
  return r.json();
}

export async function invokeBatch({ items, mode, rapidApiKey, signal }) {
  const r = await fetch('/api/invoke/batch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items, mode, rapidApiKey: rapidApiKey || undefined }),
    signal,
  });
  return r.json();
}
