# ADR 005 — Catálogo carregado uma vez em memória, somente leitura

**Status:** Accepted
**Data:** 2026-05-14

## Contexto

302 APIs × ~700 bytes/API = ~210 kB de JSON. Não muda em runtime — é uma snapshot do dossiê RapidAPI de 11/05/2026.

## Decisão

`src/catalog.js` faz `fs.readFileSync` dos 3 JSONs no primeiro acesso, popula um cache module-level (`let cache = null`), indexa por id e por host, e retorna a mesma referência em chamadas subsequentes.

**Mutação proibida:** consumidores devem clonar antes de modificar.

## Consequências

**Positivas:**
- Acesso O(1) por id e host
- Tempo de boot < 50ms
- 0 IO em runtime
- Memória previsível (~250 kB heap)

**Negativas:**
- Atualização do catálogo exige redeploy
- Catálogo malformado mata o processo no boot (intencional — falha rápido)

## Atualização do catálogo

1. Re-extrair do dossiê
2. Substituir JSONs em `data/bets-apis/`
3. `npm run qa` valida shape (302/302)
4. Bump da versão
5. Redeploy
