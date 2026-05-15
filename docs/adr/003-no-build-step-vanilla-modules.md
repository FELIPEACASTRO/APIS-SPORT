# ADR 003 — Frontend em vanilla ES modules sem bundler

**Status:** Accepted
**Data:** 2026-05-14

## Contexto

Frontend é uma SPA editorial leve (≤ 100 kB JS gross). Bundlers (Vite, esbuild, webpack) trariam:
- Build step (mais 30–80 deps de dev)
- Source maps
- Hot reload
- Tree-shaking

Mas o catálogo é estático e a aplicação não tem muitos componentes.

## Decisão

Servir os arquivos JS direto do `public/js/` como ES modules nativos. Browser carrega `<script type="module">` que importa via `import` relativo.

- Zero build step
- Zero source map (debug usa o original)
- Cache-Control 1h nos assets
- ESLint roda no source que vai para produção

## Consequências

**Positivas:**
- `npm start` sobe instantâneo
- Não há "obra" entre escrever código e ver no navegador
- Debug usa o código real

**Negativas:**
- Sem code splitting automático
- Sem minificação (mas gzip/br no proxy compensa)
- Sem TypeScript com inferência (mitigado por JSDoc + ts-check)

## Alternativas consideradas

- **Vite**: melhor DX em apps grandes, mas overkill para essa SPA
- **Bun**: build < 100ms, mas adiciona runtime alternativo
