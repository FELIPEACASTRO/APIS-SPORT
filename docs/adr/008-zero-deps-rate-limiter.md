# ADR 008 — Rate limiter custom (em vez de `express-rate-limit`)

**Status:** Accepted
**Data:** 2026-05-14

## Contexto

`express-rate-limit` é o pacote padrão, mas tem ~10 deps transitivas e features que não usamos (Redis store, headers RFC draft, slow-down).

## Decisão

Implementar em `src/middleware/rate-limit.js`:
- Sliding window por IP (Map)
- 2 limiters: global e `/api/invoke*`
- Headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- `Retry-After` em 429
- Probes isentas via lista explícita
- GC oportunista a cada 60s
- Métricas `rate_limit_blocked_total` integradas

Total: ~70 linhas.

## Consequências

**Positivas:**
- 0 deps adicionais
- Customização sobre comportamento (isenção de probes)
- Métricas integradas

**Negativas:**
- Sem features ricas (slow-down, custom stores)
- Não escala horizontalmente (ver [ADR 004](004-rate-limit-in-memory.md))

## Quando trocar

Quando uma destas condições for verdade:
- Mais de 2 réplicas em produção
- Necessidade de slow-down progressivo
- Tracking de comportamento por usuário autenticado

Trocar por `rate-limiter-flexible` + Redis store.
