// @ts-check
// public/js/services.js
// Chamadas ao backend interno. SRP: rede.

export async function fetchHealth() {
  const r = await fetch('/api/health');
  if (!r.ok) throw new Error('Falha no health-check do servidor');
  return r.json();
}

export async function fetchCatalog(filters = {}) {
  const params = new URLSearchParams();
  if (filters.query)         params.set('q', filters.query);
  if (filters.subcategory)   params.set('subcategory', filters.subcategory);
  if (filters.pricing)       params.set('pricing', filters.pricing);
  if (filters.minPopularity) params.set('minPopularity', filters.minPopularity);
  if (filters.sort)          params.set('sort', filters.sort);

  const r = await fetch(`/api/catalog?${params}`);
  if (!r.ok) throw new Error(`Falha ao listar catálogo (${r.status})`);
  return r.json();
}

export async function fetchStats() {
  const r = await fetch('/api/catalog/stats');
  if (!r.ok) throw new Error('Falha ao buscar stats');
  return r.json();
}

export async function invokeBatch({ items, mode, rapidApiKey }) {
  const r = await fetch('/api/invoke/batch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items, mode, rapidApiKey: rapidApiKey || undefined }),
  });
  return r.json();
}
