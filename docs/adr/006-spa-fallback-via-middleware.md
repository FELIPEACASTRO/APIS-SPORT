# ADR 006 — SPA fallback via middleware (Express 5 sem wildcard `*`)

**Status:** Accepted
**Data:** 2026-05-14 (descoberto na auditoria de produção)

## Contexto

Express 5 removeu o suporte a `*` cru em route patterns. O padrão Express 4:
```js
app.get('*', (_req, res) => res.sendFile('public/index.html'));
```
lança `PathError: Missing parameter name at index 1` no Express 5.

Adicionalmente, `res.sendFile` com path Windows (backslash) falha com `NotFoundError` no middleware `send`.

## Decisão

1. Substituir `app.get('*')` por um middleware `app.use((req, res, next) => ...)` no final do pipeline que filtra `req.method === 'GET' && !req.path.startsWith('/api/')`.
2. Pré-carregar `index.html` no boot via `fs.readFileSync` e enviar com `res.type('html').send(INDEX_HTML)`.

## Consequências

**Positivas:**
- Funciona em Linux, macOS e Windows
- 1 IO em boot, 0 IO por request
- Express 5 idiomatic

**Negativas:**
- `index.html` editado em runtime exige restart (irrelevante em produção)

## Como descobrimos

Auditoria de produção em 2026-05-14 encontrou que `GET /qualquer/rota` retornava 404 ao invés de servir o SPA — bloqueava deep-linking.
