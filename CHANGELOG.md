# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versionamento: [SemVer](https://semver.org/).

## [3.2.0] — 2026-05-14 — UX/UI hardening completo

15 problemas de UX identificados e resolvidos em auditoria sistemática.

### Added — Persistência & Deep linking
- **`src/storage.js`** novo módulo cliente:
  - URL state sync (`?tab=session&q=pinnacle&mode=real&hide_empty=1`) — refresh preserva tudo.
  - localStorage para **seleção persistida** entre sessões (até 302 ids).
  - localStorage para **histórico de resultados** (últimos 50, com trim automático).
  - localStorage para preferências (onboarding visto).
- Filtros, tab e modo agora são compartilháveis via URL.

### Added — Onboarding & ajuda
- **Modal de onboarding** mostrado automaticamente na primeira visita.
- Botão `?` no topbar abre o tour novamente a qualquer momento.
- 3 passos didáticos (Descobrir → Selecionar → Executar) com atalhos integrados.

### Added — Confirmação & Cancelamento
- **Confirm modal** antes de batch real > 20 chamadas (consome cota explícita).
- **Botão Cancelar** aparece durante execução (`AbortController`).
- **Undo via Ctrl+Z** para ações destrutivas (Limpar seleção, Limpar resultados).

### Added — Loading & estados visuais
- **Skeleton placeholders** no boot do catálogo (substitui "carregando…" cru).
- **Spinner inline** no meta de loading.
- **Progress bar indeterminate** no CTA Executar durante execução.

### Added — Devtools
- **Copy as cURL** no drawer da API (gera comando pronto com placeholder de chave).
- **Endpoint datalist** com 12 sufixos comuns (`/v1/sports`, `/getMLBTeams`, etc.) — autocomplete nativo no browser.

### Added — Mobile & A11y
- **Drawer fullscreen** em mobile (era 520px fixos).
- **Modal scroll** em telas pequenas.
- **Skip link** "Pular para o conteúdo" como primeiro focável (`#workspace`).
- **Tray expand** funciona corretamente em mobile (volta para Catálogo).

### Added — Resiliência
- **Boot error screen** quando init falha — substitui interface por card com:
  - Mensagem clara
  - Stack trace expansível (`<details>`)
  - **Botão "Tentar novamente"** que recarrega a página

### Changed
- `clearSelection` agora oferece undo via Ctrl+Z (5s window).
- `clearResults` idem.
- Onboarding é mostrado 400ms após boot (não bloqueia render inicial).
- `Esc` fecha onboarding e confirm além dos outros overlays.

### Version
- 3.1.0 → 3.2.0

### Validação
- npm run lint: 0 errors
- npm test: 53/53
- npm run qa: 3/3 · 302/302
- npm run smoke: 29/29
- npm run integration: 47/47

## [3.1.0] — 2026-05-14 — Dashboard analítico + Tipagem + ADRs

### Added
- **Tab `Dashboard`** com data-viz SVG nativa (zero deps):
  - 7 KPIs (total, freemium, provedores, sem telemetria, latência p50/p95, sucesso médio)
  - Bar chart de APIs por subcategoria (ordenado, animado)
  - Donut chart de share por preço
  - Histograma de popularidade (10 bins, com tooltips)
  - Bar chart de top 10 provedores
  - Scatter plot latência × taxa de sucesso (com p95 marcado)
  - Leaderboard top 10 por popularidade com sparklines
- **Backend stats expandido** (`/api/catalog/stats`):
  - `top_by_popularity` (10 entries)
  - `popularity_histogram` (10 bins de 1 ponto)
  - `top_providers` (até 10 ordenado por count)
  - `latency` percentis (p50, p95, p99, max, mean)
  - `success_rate` (p50, mean, with_100, with_zero)
  - `no_telemetry` + `no_telemetry_pct`
  - `scatter` data points (filtrados, capados em 10s)
- **ETag + Cache-Control** em `/api/catalog` — 304 Not Modified em hits subsequentes
- **Tipagem `// @ts-check` em todos os 10 módulos JS frontend** — editor valida em tempo real via JSDoc + types
- **10 ADRs** em `docs/adr/` documentando decisões arquiteturais:
  - 001 Zero runtime deps
  - 002 Mock como feature de produto
  - 003 Sem build step (vanilla ES modules)
  - 004 Rate limit in-memory
  - 005 Catalog cache read-only
  - 006 SPA fallback via middleware (Express 5)
  - 007 JSDoc em vez de TypeScript
  - 008 Rate limiter custom
  - 009 Mock determinístico por subcategoria
  - 010 Modos mock+real coexistindo
- **Diagrama Mermaid** em `OPERATIONS.md` (arquitetura geral + sequence diagram do POST /api/invoke)
- **Atalho de teclado `3`** → tab Dashboard
- **Tests** para o stats expandido (+6 cenários → 53 total)

### Changed
- Versão 3.0.0 → 3.1.0

## [3.0.0] — 2026-05-14 — **Production-Grade Release**

### Added (production hardening)
- **Observabilidade Prometheus**
  - `/api/metrics` (text exposition v0.0.4) com `http_requests_total`,
    `http_request_duration_ms`, `http_errors_total`, `invoke_total`,
    `rate_limit_blocked_total`, `app_uptime_seconds`.
  - `/api/metrics/json` para snapshot rápido.
- **Kubernetes probes**
  - `/api/live` — liveness (sempre 200 enquanto vivo)
  - `/api/ready` — readiness (503 quando catálogo não carregado ou shutting down)
- **Structured logging** (`src/logger.js`)
  - Formatos `pretty` (dev) e `json` (prod), níveis `debug/info/warn/error/silent`.
  - Redaction automática de campos sensíveis (`rapidApiKey`, `authorization`, `cookie`).
  - Request ID propagado em todos os logs.
- **Pipeline de middleware production-grade** (`src/middleware/`)
  - `request-id` — UUID por request, honra `X-Request-ID` do cliente.
  - `http-logger` — log estruturado fim do request + atualização de métricas.
  - `security` — CSP, HSTS, COOP, CORP, X-Frame-Options DENY, Permissions-Policy.
  - `cors` — configurável via `CORS_ORIGIN` (lista ou `*`).
  - `rate-limit` — sliding window in-memory, limites separados para global e `/invoke`.
  - `validation` — schemas explícitos (`invokeSchema`, `invokeBatchSchema`).
  - `error-handler` — 404 e 500 estruturados com `request_id`.
- **Graceful shutdown** (`src/shutdown.js`)
  - SIGTERM/SIGINT drain de conexões em `SHUTDOWN_GRACE_MS` (default 10s).
  - Handlers para `uncaughtException` e `unhandledRejection`.
  - Bloqueio de novas requests durante shutdown (mantém probes vivas).
- **Configuração validada no boot** (`src/config.js`)
  - Carregamento de `.env` sem dep externa.
  - Validação de tipos/range — falha rápido se algo crítico estiver errado.
  - Resumo logado no startup.
- **Docker**
  - `Dockerfile` multi-stage (deps → test → runtime), non-root user (uid 10001).
  - Healthcheck embutido via `/api/live`.
  - `STOPSIGNAL SIGTERM` para K8s rolling deploys.
  - `.dockerignore` mínimo.
  - `docker-compose.yml` para dev/homologação locais com resource limits.
- **CI/CD** (`.github/workflows/ci.yml`)
  - Job `test`: lint + unit tests + qa + smoke em Ubuntu/Node 22.
  - Job `docker`: build da imagem + probe ao vivo (live/ready/health/metrics).
- **Quality tooling**
  - `eslint.config.js` (flat config, zero deps customizadas) — `npm run lint`.
  - `.editorconfig` para consistência cross-IDE.
  - `LICENSE` MIT.
- **Documentação**
  - `openapi.yaml` — spec OpenAPI 3.1 completa para todos os endpoints.
  - `OPERATIONS.md` — runbook operacional (deploy, troubleshooting, SLOs, K8s manifests).

### Changed
- **Versão** `2.1.0 → 3.0.0`.
- **Lint passa a fazer parte do `npm run homolog`** (lint + test + qa + smoke).
- **Server.js refatorado** para usar pipeline de middleware modular.
- **Smoke test** expandido para 25 cenários (incluindo probes, metrics, headers, validação).
- **Server tests** expandidos para 45 cenários (de 32).
- **`req.body` é validado** antes de chegar nos handlers (request_id propagado em todos os erros 4xx/5xx).
- **Rate-limit aplicado** globalmente + extra strict em `/api/invoke*`.

### Security
- CSP enforced no servidor (`default-src 'self'`, sem `unsafe-eval`, sem `unsafe-inline` JS).
- HSTS (1 ano, includeSubDomains).
- COOP `same-origin`, CORP `same-site`.
- Redaction automática de chaves sensíveis em logs.
- Validation rejeita body malformado antes da lógica de negócio.

### Operations
- Endpoints prontos para K8s (liveness, readiness, prometheus).
- Métricas instrumentadas em todo o pipeline HTTP + invoke.
- Logs estruturados em JSON para ELK/Datadog/Loki via `LOG_FORMAT=json`.
- Graceful shutdown coordenado com `STOPSIGNAL SIGTERM` do Docker.

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
