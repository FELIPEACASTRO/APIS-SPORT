# Architecture Decision Records

Decisões arquiteturais relevantes deste projeto, em formato [ADR](https://adr.github.io/) leve.

| # | Decisão | Status |
|---|---|---|
| [001](001-zero-runtime-deps.md) | Zero dependências runtime além do Express | Accepted |
| [002](002-mock-as-product-feature.md) | "Modo mock" é feature de produto, não stub de teste | Accepted |
| [003](003-no-build-step-vanilla-modules.md) | Frontend em vanilla ES modules sem bundler | Accepted |
| [004](004-rate-limit-in-memory.md) | Rate limiting in-memory por single-instance | Accepted |
| [005](005-catalog-cache-readonly.md) | Catálogo carregado uma vez em memória, somente leitura | Accepted |
| [006](006-spa-fallback-via-middleware.md) | SPA fallback via middleware (Express 5 sem wildcard) | Accepted |
| [007](007-jsdoc-instead-of-typescript.md) | Tipagem via JSDoc + ts-check, sem build TS | Accepted |
| [008](008-zero-deps-rate-limiter.md) | Rate limiter custom em vez de express-rate-limit | Accepted |
| [009](009-mock-response-by-subcategory.md) | Mock determinístico por subcategoria | Accepted |
| [010](010-real-and-mock-modes.md) | Modos mock e real coexistindo no /api/invoke | Accepted |
