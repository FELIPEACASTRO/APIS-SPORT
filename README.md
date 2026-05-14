# APIS&nbsp;//&nbsp;SPORT

> Terminal editorial para invocar as **302 APIs de apostas esportivas** do RapidAPI mapeadas no dossiê de 11/05/2026.

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
| **Real** | Chamada real ao RapidAPI | ✅ `X-RapidAPI-Key` |

Para usar modo real, ou cole sua chave na UI (campo `RapidAPI Key`) ou exporte `RAPIDAPI_KEY=...` antes de subir o servidor.

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
│   ├── catalog.test.mjs         # 10 testes — shape, distribuição, filtros
│   ├── invoker.test.mjs         # 6 testes — incluindo "TODAS as 302 APIs em mock"
│   └── server.test.mjs          # 10 testes — rotas HTTP do Express
└── scripts/
    └── qa-report.mjs            # relatório executivo (PASS/FAIL para 302 APIs)
```

---

## Comandos

```bash
npm start                        # produção
npm run dev                      # com --watch
npm test                         # node --test — 32 testes
npm run qa                       # QA report em terminal (3 checks · 302/302 mock)
npm run qa -- --real             # acrescenta amostra real (precisa RAPIDAPI_KEY)
npm run qa:json                  # mesmo QA em JSON (CI-friendly)
npm run smoke                    # smoke test end-to-end (19 cenários)
npm run smoke:json               # smoke em JSON
npm run homolog                  # pipeline COMPLETO de homologação: test + qa + smoke
```

Para **homologação do cliente** veja [HOMOLOGACAO.md](HOMOLOGACAO.md).
Para **release notes** veja [CHANGELOG.md](CHANGELOG.md).

### Variáveis de ambiente

| Variável | Default | Função |
|---|---|---|
| `PORT` | `3000` | porta do servidor |
| `RAPIDAPI_KEY` | — | chave RapidAPI usada pelo proxy real |
| `QA_REAL_SAMPLE` | `3` | tamanho da amostra real no QA |

---

## API HTTP

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/health` | status + tamanho do catálogo |
| GET | `/api/catalog` | lista 302 APIs · filtros: `q`, `subcategory`, `pricing`, `minPopularity`, `sort`, `limit` |
| GET | `/api/catalog/stats` | agregados por subcategoria e preço |
| GET | `/api/catalog/:id` | uma API específica |
| POST | `/api/invoke` | invoca 1 API · body: `{ apiId, endpoint?, mode?, query?, rapidApiKey? }` |
| POST | `/api/invoke/batch` | invoca até 50 APIs em paralelo |

### Exemplo

```bash
# uma única chamada em mock
curl -s -X POST http://localhost:3000/api/invoke \
  -H "content-type: application/json" \
  -d '{"apiId":23,"mode":"mock","endpoint":"/v1/sports"}' | jq .

# batch de 3 APIs em modo real
curl -s -X POST http://localhost:3000/api/invoke/batch \
  -H "content-type: application/json" \
  -d '{
    "mode":"real",
    "rapidApiKey":"SUA_CHAVE",
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
