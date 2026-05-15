# ADR 004 — Rate limiting in-memory por single-instance

**Status:** Accepted (com nota)
**Data:** 2026-05-14

## Contexto

Rate limiting protege contra abuso por IP. Implementações comuns:
- **In-memory single-process** (Map)
- **Redis-backed** (compartilhado entre réplicas)
- **Cloudflare / API Gateway upstream** (fora do app)

## Decisão

Para o release 3.x, usar **in-memory single-instance** com janela deslizante simples:
- `Map<ip, { count, resetAt }>`
- GC oportunista a cada 60s
- Limits: 120 req/min global, 30 req/min `/api/invoke*`
- Probes (`/api/live`, `/api/ready`, `/api/health`, `/api/version`, `/api/metrics`) **isentas** — caso contrário ataques causariam restart loops em K8s

## Consequências

**Positivas:**
- Zero deps
- Latência sub-ms
- Cobre 95% dos casos de proteção contra script kiddies

**Negativas:**
- Multi-instância: cada réplica tem seu próprio Map → limit efetivo = N × max
- Reinício zera buckets → cliente abusivo recupera "crédito"

## Mitigação para produção real

Quando escalar horizontalmente:
1. **Curto prazo:** colocar rate limiter no Cloudflare/CDN upstream
2. **Médio prazo:** trocar para `ioredis` + Lua script com TTL
3. **Longo prazo:** mover para API Gateway dedicado (Kong, Tyk, AWS API Gateway)

## Alternativas consideradas

- **`express-rate-limit`**: padrão da indústria; descartado por adicionar 2 deps (vs implementação trivial em ~60 linhas)
- **Sliding window log preciso**: mais memória, sem benefício prático
