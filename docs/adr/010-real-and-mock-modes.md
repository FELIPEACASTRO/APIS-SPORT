# ADR 010 — Modos `mock` e `real` coexistindo no `/api/invoke`

**Status:** Accepted
**Data:** 2026-05-14

## Contexto

A solução precisa servir 3 cenários:
1. **Demo/onboarding**: usuário sem chave RapidAPI
2. **QA automatizado**: pipeline de CI sem chave
3. **Produção**: usuário com chave validada

## Decisão

`/api/invoke` aceita `body.mode`:
- `"mock"`: invoker retorna resposta sintética (sem rede)
- `"real"`: invoker faz `fetch` para `https://{host}/{endpoint}` com headers RapidAPI

Lógica de decisão em `src/invoker.js#decideMode`:
```js
if (req.mode === 'real') return 'real';
if (req.mode === 'mock') return 'mock';
return req.rapidApiKey ? 'real' : 'mock';  // auto
```

Sem mode + sem chave → cai em mock. Sem mode + com chave → vai real.

## Consequências

**Positivas:**
- Cliente decide explicitamente em cada call
- Fallback gracioso (sem chave → mock)
- QA sempre disponível (modo mock)
- Marcador `data._mock: true` em mock indica origem

**Negativas:**
- Cliente que esquece de passar `mode: "real"` consome cota se a chave estiver no servidor
- Mitigação: o `BUILD_INFO.server_has_rapidapi_key` indica explicitamente

## Status codes

- Mock OK: `200`
- Real OK (upstream 200): `200`
- Real Upstream 401/403/429: propaga o mesmo (não mascara como 502)
- Real sem chave: `502` (gateway error local)
- Real network/timeout: `502`
- Validation: `400`
- Rate-limit local: `429`
