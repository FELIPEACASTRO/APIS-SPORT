# APIS&nbsp;//&nbsp;SPORT

[![CI](https://img.shields.io/github/actions/workflow/status/FELIPEACASTRO/APIS-SPORT/ci.yml?label=CI)](https://github.com/FELIPEACASTRO/APIS-SPORT/actions)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](#)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Version](https://img.shields.io/badge/version-3.2.0-blueviolet)](CHANGELOG.md)

> Plataforma **production-grade** para invocar as **302 APIs de apostas esportivas** do RapidAPI mapeadas no dossiê de 11/05/2026.

Selecionar uma ou várias APIs, clicar **Buscar** e ver a resposta organizada — com modo `Mock` (sem chave, ideal para QA) e modo `Real` (proxy via RapidAPI).

---

## Quickstart

```bash
npm install
npm start                        # http://localhost:3000
```

Abra o navegador, filtre por subcategoria/preço/popularidade, marque as APIs e clique **Buscar**.

### Modos de execução

| Modo | Quando usar | Requer chave |
|---|---|---|
| **Mock** | Demo, QA, desenvolvimento offline | ❌ |
| **Real** | Chamada real ao RapidAPI via chave server-side | ✅ `RAPIDAPI_KEY` + `REAL_INVOKE_TOKEN` em produção |

Para produção, configure `RAPIDAPI_KEY` no servidor e proteja chamadas reais com `REAL_INVOKE_TOKEN` (`X-Invoke-Token` ou `Authorization: Bearer ...`). O envio de chave RapidAPI pelo browser deve permanecer desabilitado com `ALLOW_CLIENT_RAPIDAPI_KEY=false`.

---

## Estrutura

```
.
├── server.js                    # Express gateway (catalog + invoke + estática)
├── src/
│   ├── catalog.js               # loader das 302 APIs (3 JSONs combinados, cache em memória)
│   ├── invoker.js               # engine de invocação (auto mock/real, timeout, normalização)
│   └── mock.js                  # gerador de respostas mock por subcategoria
├── public/
│   ├── index.html               # UI editorial — Fraunces + Newsreader + JetBrains Mono
│   ├── styles.css               # tema "Editorial Quant Terminal" com grain texture
│   └── app.js                   # ESM module — filtros, seleção, batch, render
├── data/bets-apis/              # catálogo fonte (302 APIs em 3 JSONs)
├── tests/
│   ├── catalog.test.mjs         # shape, distribuição, filtros
│   ├── config.test.mjs          # hardening de env/config
│   ├── invoker.test.mjs         # invoker + TODAS as 302 APIs em mock
│   └── server.test.mjs          # rotas HTTP, validação e regressões
└── scripts/
    ├── qa-report.mjs            # relatório executivo (PASS/FAIL para 302 APIs)
    └── qa-100x.mjs              # double-check 100x: contrato, segurança, UX/UI/A11y
```

---

## Comandos

```bash
npm start                  # produção (Node)
npm run dev                # --watch
npm run lint               # ESLint (zero erros é requisito)
npm test                   # suíte Node test (60+ cenários)
npm run qa                 # QA report — 302/302 mock-302 OK
npm run qa:100x            # double-check 100x: contrato, segurança, dados, UX/UI/A11y
npm run qa -- --real       # + amostra real (requer RAPIDAPI_KEY)
npm run smoke              # 25+ cenários end-to-end
npm run homolog            # pipeline completo: lint + test + qa + qa:100x + smoke + integration
npm run docker:build       # docker build .
npm run docker:run         # docker run apis-sport:latest
npm run docker:compose     # docker compose up --build
```

## Documentação

| Arquivo | Para quê |
|---|---|
| [HOMOLOGACAO.md](HOMOLOGACAO.md) | Roteiro UAT do cliente |
| [OPERATIONS.md](OPERATIONS.md) | Runbook operacional (deploy, troubleshooting, SLOs, K8s) |
| [CHANGELOG.md](CHANGELOG.md) | Release notes |
| [openapi.yaml](openapi.yaml) | Spec OpenAPI 3.1 dos endpoints |
| [data/bets-apis/CATALOG.md](data/bets-apis/CATALOG.md) | Catálogo legível das 302 APIs |

### Variáveis de ambiente

| Variável | Default | Função |
|---|---|---|
| `PORT` | `3000` | porta do servidor |
| `RAPIDAPI_KEY` | — | chave RapidAPI server-side usada pelo proxy real |
| `REAL_INVOKE_TOKEN` | — | token interno para liberar modo real em produção |
| `REQUIRE_REAL_AUTH` | `true` em produção | exige `X-Invoke-Token`/Bearer para chamadas reais com chave server-side |
| `ALLOW_CLIENT_RAPIDAPI_KEY` | `false` em produção | controla se o body pode trazer `rapidApiKey`; mantenha `false` em produção |
| `METRICS_TOKEN` | — | protege `/api/metrics*` quando configurado |
| `QA_REAL_SAMPLE` | `3` | tamanho da amostra real no QA |

---

## API HTTP

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/health` | status + tamanho do catálogo |
| GET | `/api/catalog` | lista 302 APIs · filtros: `q`, `subcategory`, `pricing`, `minPopularity`, `sort`, `limit` |
| GET | `/api/catalog/stats` | agregados por subcategoria e preço |
| GET | `/api/catalog/:id` | uma API específica |
| POST | `/api/invoke` | invoca 1 API · body: `{ apiId, endpoint?, mode?, query? }`; modo real pode exigir `X-Invoke-Token` |
| POST | `/api/invoke/batch` | invoca até 50 APIs em paralelo |

### Exemplo

```bash
# uma única chamada em mock
curl -s -X POST http://localhost:3000/api/invoke \
  -H "content-type: application/json" \
  -d '{"apiId":23,"mode":"mock","endpoint":"/v1/sports"}' | jq .

# batch de 3 APIs em modo real com chave server-side
curl -s -X POST http://localhost:3000/api/invoke/batch \
  -H "content-type: application/json" \
  -H "X-Invoke-Token: SEU_TOKEN_INTERNO" \
  -d '{
    "mode":"real",
    "items":[
      {"apiId":1,"endpoint":"/getMLBPlayerList"},
      {"apiId":23,"endpoint":"/v1/sports"},
      {"apiId":24,"endpoint":"/v1/sports"}
    ]
  }' | jq .
```

---

## Validação de QA

A definição de pronto é **`npm run qa`** terminar com `ALL CHECKS PASSED`:

```
▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔
  QA REPORT  /  APIS // SPORT  /  302 APIs de bets
▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔

  ✔ shape         302 APIs · 0 duplicatas · 0 shape errors
  ✔ distribution  subcategoria e preço batem com o dossiê
  ✔ mock-302      302/302 OK · média 0.01ms/chamada
  ◌ real-sample   skipped (RAPIDAPI_KEY ausente)

▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
  ALL CHECKS PASSED
  3 / 3 checks ✓
  mock end-to-end: 302 / 302  ·  média 0.01ms/chamada
```

Os 4 checks:

1. **shape** — toda API tem id único, hostname `*.p.rapidapi.com` e campos obrigatórios.
2. **distribution** — contagens por subcategoria e preço batem com o dossiê fonte.
3. **mock-302** — exercita o `invoker` em modo mock para **todas as 302 APIs** e exige `ok=true` em todas.
4. **real-sample** (opcional) — se `RAPIDAPI_KEY` estiver presente e `--real` passado, faz 3 chamadas reais às top APIs Freemium para validar o proxy de rede.

---

## Aesthetic

- **Display:** Fraunces (variable serif, eixos `opsz`/`wght`/`SOFT`)
- **Body:** Newsreader (editorial serif)
- **Mono:** JetBrains Mono
- **Paleta:** off-black quente (`#0a0908`) + volt-lime (`#c8ff3d`) para dinheiro, âmbar (`#ff9c2a`) para popularidade quente, cyan (`#6ee0ff`) para dados/odds, vermelho (`#ff3d5e`) para risco.
- **Detalhes:** noise grain SVG over `mix-blend-mode: soft-light`, linhas-guia tipo papel pautado ao fundo, animações stagger nos resultados, stripe-pattern animado quando o botão Buscar está em loading.

---

## Catálogo

Veja [`data/bets-apis/`](data/bets-apis):

- [`catalog.json`](data/bets-apis/catalog.json) + part2/part3 — JSONs com todas as 302 APIs
- [`CATALOG.md`](data/bets-apis/CATALOG.md) — versão legível organizada por subcategoria
- [`templates/`](data/bets-apis/templates) — exemplos de chamada cURL / Node.js / Python
- [`README.md`](data/bets-apis/README.md) — índice e padrão de chamada RapidAPI

### Resumo do catálogo

| Subcategoria | APIs |
|---|---|
| Odds | 83 |
| Casas de Apostas / Odds | 55 |
| Predição | 46 |
| Odds / Predição | 44 |
| Dados de Apostas | 44 |
| Casas de Apostas | 22 |
| Casas / Odds / Predição | 6 |
| Casas / Predição | 2 |
| **Total** | **302** |

| Preço | APIs |
|---|---|
| Freemium | 244 (80.8%) |
| Gratuito | 43 (14.2%) |
| Pago | 15 (5.0%) |
