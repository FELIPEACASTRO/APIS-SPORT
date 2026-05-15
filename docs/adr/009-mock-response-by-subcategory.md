# ADR 009 — Mock determinístico por subcategoria

**Status:** Accepted
**Data:** 2026-05-14

## Contexto

302 APIs em 8 subcategorias (Odds, Predicao, Casas, Dados, e combinações). Cada subcategoria tem shape de resposta distinto:
- **Odds:** lista de eventos com markets (h2h, spread, totals)
- **Predicao:** lista de previsões com probabilidades
- **Casas de Apostas:** lista de bookmakers
- **Dados de Apostas:** estatísticas de times

## Decisão

`src/mock.js#mockResponseFor(api, endpoint)`:
1. Inspeciona `api.subcategory`
2. Retorna shape coerente para aquela categoria
3. Inclui marcador `_mock: true`, `_source`, `_endpoint`, `_generated_at`
4. IDs derivados de `api.id` (determinístico)

## Consequências

**Positivas:**
- Cliente vê shape realista por subcategoria
- Reprodutível (mesma resposta para mesmo input)
- Marcador `_mock` previne confusão

**Negativas:**
- Não bate 100% com o shape real do RapidAPI (cada provedor é diferente)
- Para sample real, usar `--real` com chave

## Princípio

Mocks devem **ensinar o shape**, não substituir testes integrados. Quem quer ver dados reais usa `mode: "real"` + chave.
