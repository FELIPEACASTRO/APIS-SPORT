# ADR 002 — "Modo mock" é feature de produto, não stub de teste

**Status:** Accepted
**Data:** 2026-05-14

## Contexto

A solução proxia 302 APIs do RapidAPI. Cada chamada real consome cota da chave do usuário. Para QA, demos, onboarding e desenvolvimento sem chave, faz sentido ter respostas geradas localmente.

## Decisão

Implementar `src/mock.js` como **camada de produto**: gera respostas plausíveis por subcategoria (Odds, Predicao, Casas, Dados) com shape coerente. Expor via `mode: "mock"` no `POST /api/invoke`.

**Importante:** `mock.js` **não é stub de teste**. Os testes (`tests/`, `scripts/smoke-test.mjs`, `scripts/integration-test.mjs`) sobem o servidor REAL e fazem HTTP REAL ponta-a-ponta. O mock só substitui o destino final (RapidAPI) quando o caller explicitamente pede.

## Consequências

**Positivas:**
- Onboarding em segundos, sem cadastro RapidAPI
- QA automatizado sem queimar cota
- Demos previsíveis
- Os shape mockados ajudam o cliente a entender o que esperar

**Negativas:**
- O caller pode confundir mock com real (mitigado por `data._mock: true` e badge na UI)
- Manutenção: ao adicionar novas subcategorias, atualizar `mockResponseFor`

## Alternativas consideradas

- **Sem mock**: força chave em todo uso, pior UX e QA
- **Mock como teste** (sinônimo de stub): proibitivo — descrito como feature explícita evita ambiguidade
