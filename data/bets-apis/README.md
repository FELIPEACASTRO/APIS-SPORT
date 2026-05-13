# Catálogo de APIs de Apostas Esportivas (RapidAPI)

Extração rigorosa do dossiê **APIs de Apostas Esportivas (Bets)** publicado em 11/05/2026 (rapidapi.com).

## Resumo

- **Total de APIs catalogadas:** 302
- **Fonte:** Dossiês PDF (RapidAPI - APIs de Apostas Esportivas (Bets) + RapidAPI - APIs de Esportes)
- **Plataforma:** RapidAPI Marketplace

### Distribuição por Subcategoria

| Subcategoria | APIs | % |
|---|---|---|
| Odds | 83 | 27.5% |
| Casas de Apostas / Odds | 55 | 18.2% |
| Predição | 46 | 15.2% |
| Odds / Predição | 44 | 14.6% |
| Dados de Apostas | 44 | 14.6% |
| Casas de Apostas | 22 | 7.3% |
| Casas de Apostas / Odds / Predição | 6 | 2.0% |
| Casas de Apostas / Predição | 2 | 0.7% |

### Distribuição por Modelo de Preço

| Modelo | APIs | % |
|---|---|---|
| Freemium | 244 | 80.8% |
| Gratuito | 43 | 14.2% |
| Pago | 15 | 5.0% |

## Estrutura dos arquivos

```
data/bets-apis/
├── README.md                       (este arquivo)
├── catalog.json                    (catálogo completo, 302 APIs, JSON canônico)
├── CATALOG.md                      (catálogo legível em Markdown, ordenado por popularidade)
├── by-subcategory/
│   ├── odds.json                   (83 APIs)
│   ├── casas-de-apostas-odds.json  (55 APIs)
│   ├── predicao.json               (46 APIs)
│   ├── odds-predicao.json          (44 APIs)
│   ├── dados-de-apostas.json       (44 APIs)
│   ├── casas-de-apostas.json       (22 APIs)
│   ├── casas-odds-predicao.json    (6 APIs)
│   └── casas-de-apostas-predicao.json (2 APIs)
└── templates/
    ├── call-pattern.md             (padrão de chamada RapidAPI)
    ├── curl-example.sh             (exemplo de cURL)
    ├── nodejs-example.js           (exemplo Node.js / axios)
    └── python-example.py           (exemplo Python / requests)
```

## Como ler uma "chamada" no catálogo

Cada API tem os seguintes campos de chamada:

```json
{
  "id": 1,
  "name": "Tank01 MLB Live In-Game Real Time Statistics",
  "subcategory": "Odds",
  "provider": "tank01",
  "pricing": "Freemium",
  "popularity": 9.9,
  "latency_ms": 275,
  "success_rate_pct": 100,
  "rapidapi_url": "https://rapidapi.com/tank01/api/tank01-mlb-live-in-game-real-time-statistics",
  "rapidapi_host": "tank01-mlb-live-in-game-real-time-statistics.p.rapidapi.com",
  "base_url": "https://tank01-mlb-live-in-game-real-time-statistics.p.rapidapi.com",
  "description": "ESTATÍSTICAS AO VIVO da MLB com odds e player props..."
}
```

## Padrão de chamada (RapidAPI)

Toda API no RapidAPI usa o mesmo padrão de autenticação:

```http
GET https://{rapidapi_host}/{endpoint}
Headers:
  X-RapidAPI-Key:  <SUA_CHAVE>
  X-RapidAPI-Host: {rapidapi_host}
```

A chave é obtida criando uma conta em https://rapidapi.com e assinando o plano (mesmo Freemium exige cadastro).
