# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versionamento: [SemVer](https://semver.org/).

## [2.1.0] — 2026-05-12

### Added (homologação)
- **`HOMOLOGACAO.md`** — roteiro UAT executável pelo cliente, com checklist de 50+ critérios + tabela de aceite formal.
- **`scripts/smoke-test.mjs`** — 19 cenários end-to-end que sobem o servidor real, fazem requisições e emitem `HOMOLOGAÇÃO: ACEITÁVEL` ou `REJEITAR`.
- **`npm run smoke`** e **`npm run smoke:json`** — execução manual ou em CI/CD.
- **`npm run homolog`** — comando único que encadeia `test + qa + smoke + version`.
- **`/api/version`** — endpoint público com info de build (versão, fonte do catálogo, node, plataforma).
- **`/api/health`** agora reporta `uptime_s`.
- **Security headers** no Express (sem dep externa):
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: no-referrer`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Resource-Policy: same-site`
- **Request logging** estruturado para stdout (`ISO_TIME METHOD STATUS DURATION URL`), com `LOG_LEVEL=silent` para suprimir 2xx/4xx.
- **`.env.example`** documentando `PORT`, `RAPIDAPI_KEY`, `LOG_LEVEL`, `QA_REAL_SAMPLE`.
- **Frontend:** badge visual "sem dados" para APIs com `popularity=0` + filtro "esconder APIs sem telemetria".

### Changed
- Versão `2.0.0 → 2.1.0` (release de homologação).

## [2.0.0] — 2026-05-12

### Added
- **Plataforma completa** para consultar e invocar as **302 APIs de apostas** do RapidAPI.
- **Catálogo** em `data/bets-apis/` (3 JSONs + Markdown legível + 4 templates de chamada).
- **Backend Express 5** (`server.js` + `src/`):
  - `src/catalog.js` — loader cacheado + filterCatalog (busca em `name + provider + description + host`) + `getApiById` + `validateApiShape`.
  - `src/mock.js` — gerador determinístico de respostas por subcategoria (odds, predição, casas, dados).
  - `src/invoker.js` — engine de chamada com modos `mock`/`real`, timeout 10s, normalização de endpoint, propagação de status.
  - Rotas: `/api/health`, `/api/catalog[/stats|/:id]`, `/api/invoke`, `/api/invoke/batch` (até 50).
  - SPA fallback para qualquer GET fora de `/api/*`.
- **Frontend** (`public/`, vanilla ES modules):
  - Estética **Editorial Quant Terminal** — Fraunces + Newsreader + JetBrains Mono, paleta off-black quente, accents volt-lime/âmbar/cyan, grain SVG, linhas-guia tipo papel pautado.
  - 9 módulos JS isolados (`state`, `services`, `views`, `palette`, `keyboard`, `presets`, `toast`, `format`, `app`).
  - 2 tabs (`Catálogo`/`Sessão`) + tray persistente no rodapé com botão `Executar` sempre alcançável.
  - **Command Palette** (`⌘K`) com busca global + ações + setas + Shift+Enter para selecionar.
  - **API Drawer** com copy host, link RapidAPI, ação rápida.
  - **9 presets** clicáveis (Top 10, Freemium ≥ 9.5, Pinnacle, Bet365, Betfair, Odds, Predição, Esports, Limpar).
  - **Response viewer** com 3 modos (`tree`/`json`/`raw`) + copy + download.
  - **Atalhos**: `⌘K`, `/`, `⌘↵`, `⌘A`, `⌘⇧⌫`, `1`/`2`, `?`, `Esc`.
  - **Toasts**, skeleton states, empty states, `prefers-reduced-motion`, focus rings, aria roles em tabs/dialogs/lists.
- **Testes** (`node --test`, zero deps): 32 testes em 3 arquivos (catalog/invoker/server).
- **`scripts/qa-report.mjs`** — relatório executivo `302/302 OK`, com suporte a `--real`, `--json`.

### Fixed (auditoria 2026-05-12)
- **CRÍTICO**: SPA fallback retornava 404 em rotas não-API (`res.sendFile` falhava com `NotFoundError` no `send` middleware em Windows). Pré-lê `index.html` no boot e usa `res.type('html').send`.
- **CRÍTICO**: `app.listen(3000)` rodava ao importar nos testes — frágil se porta ocupada. Guard `isEntryPoint` baseado em `process.argv[1] === __filename`.
- `escape()` agora protege `"` e `'` (atributos HTML).
- `fillTag` reescrito com `el.dataset[k]` idiomático.
- `filterCatalog` busca também em `rapidapi_host`.
- `/api/invoke` em modo `real` propaga status original (401/429/etc.) ao invés de mascarar como 502.
- Palette filter inclui `description` + `subcategory`.

## [1.0.0] — pré-existente

- Boilerplate Express com `index.js`.
