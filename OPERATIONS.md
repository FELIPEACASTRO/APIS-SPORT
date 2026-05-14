# Operations Runbook — APIS // SPORT v3.0

Guia operacional para o time de plantão.

## Sumário

1. [Arquitetura resumida](#arquitetura-resumida)
2. [Subir / parar / reiniciar](#subir--parar--reiniciar)
3. [Configuração (env vars)](#configuração-env-vars)
4. [Probes & monitoração](#probes--monitoração)
5. [Métricas Prometheus](#métricas-prometheus)
6. [Logs](#logs)
7. [Rate limiting](#rate-limiting)
8. [Troubleshooting](#troubleshooting)
9. [Deploy](#deploy)
10. [Rollback](#rollback)
11. [SLOs](#slos)

---

## Arquitetura resumida

Single-process Node.js (Express 5), stateless. Catálogo em memória (302 APIs ~ 200 kB).

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser / Client                                                │
└───────────────┬─────────────────────────────────────────────────┘
                │ HTTPS
                ▼
┌──────────────────────────────────────────────────────────────────┐
│  Load Balancer / Reverse Proxy (Nginx, Cloudfront, etc.)        │
└───────────────┬──────────────────────────────────────────────────┘
                │ HTTP
                ▼
┌──────────────────────────────────────────────────────────────────┐
│  APIS // SPORT (Node 22, Express 5)                              │
│  ├─ middleware pipeline  (request-id, log, security, cors,       │
│  │                        rate-limit, validation, error-handler) │
│  ├─ catalog cache (302 APIs em memória)                          │
│  ├─ invoker (mock | proxy → RapidAPI)                            │
│  └─ probes (/live /ready /health /metrics)                       │
└───────────────┬──────────────────────────────────────────────────┘
                │ HTTPS (modo real)
                ▼
                RapidAPI (302 hosts *.p.rapidapi.com)
```

---

## Subir / parar / reiniciar

### Local (sem Docker)

```bash
npm ci
npm start        # foreground, logs no stdout
```

### Docker

```bash
docker compose up -d --build
docker compose logs -f app
docker compose down              # graceful stop
docker compose restart app
```

### K8s (esboço)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: apis-sport }
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: app
          image: apis-sport:3.0.0
          ports: [{ containerPort: 3000 }]
          env:
            - { name: NODE_ENV, value: production }
            - { name: LOG_FORMAT, value: json }
            - name: RAPIDAPI_KEY
              valueFrom: { secretKeyRef: { name: rapidapi, key: key } }
          readinessProbe:
            httpGet: { path: /api/ready, port: 3000 }
            initialDelaySeconds: 3
            periodSeconds: 5
          livenessProbe:
            httpGet: { path: /api/live, port: 3000 }
            initialDelaySeconds: 10
            periodSeconds: 10
          resources:
            requests: { cpu: 100m, memory: 96Mi }
            limits:   { cpu: 500m, memory: 256Mi }
```

---

## Configuração (env vars)

| Variável | Default | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta HTTP |
| `HOST` | `0.0.0.0` | Bind address |
| `NODE_ENV` | `production` | `production`/`development`/`test` |
| `LOG_LEVEL` | `info` | `debug`/`info`/`warn`/`error`/`silent` |
| `LOG_FORMAT` | `pretty` | `pretty` (terminal) ou `json` (estruturado p/ ELK) |
| `RAPIDAPI_KEY` | — | Chave global; cliente também pode enviar por request |
| `UPSTREAM_TIMEOUT_MS` | `10000` | Timeout p/ RapidAPI |
| `CORS_ORIGIN` | `*` | `*` ou lista CSV de origins |
| `CORS_CREDENTIALS` | `false` | — |
| `RATE_LIMIT_ENABLED` | `true` | Desliga em testes locais com `false` |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Janela do sliding window |
| `RATE_LIMIT_MAX_REQUESTS` | `120` | Geral por IP / janela |
| `RATE_LIMIT_INVOKE_MAX` | `30` | `/api/invoke*` por IP / janela |
| `TRUST_PROXY` | `false` | `true` quando atrás de LB que envia `X-Forwarded-For` |
| `SHUTDOWN_GRACE_MS` | `10000` | Espera antes de matar conexões em SIGTERM |

---

## Probes & monitoração

| Endpoint | Uso |
|---|---|
| `GET /api/live` | Liveness — sempre 200 enquanto o processo vive. |
| `GET /api/ready` | Readiness — 503 se catálogo não carregou ou shutdown iniciou. |
| `GET /api/health` | Rico: versão, uptime, memória, presença de key. |
| `GET /api/version` | Build info. |
| `GET /api/metrics` | Prometheus text format. |
| `GET /api/metrics/json` | Snapshot JSON. |

**Resposta de `/api/health`:**
```json
{
  "status": "OK",
  "version": "3.0.0",
  "catalog_total": 302,
  "catalog_generated_at": "2026-05-12T13:18:37.007Z",
  "server_has_rapidapi_key": true,
  "uptime_s": 86421,
  "memory": { "rss_mb": 64, "heap_used_mb": 22 },
  "timestamp": "2026-05-14T20:39:21.203Z"
}
```

---

## Métricas Prometheus

Endpoint: `GET /api/metrics`

Métricas expostas:

| Nome | Tipo | Labels |
|---|---|---|
| `app_uptime_seconds` | counter | — |
| `http_requests_total` | counter | `method`, `route`, `status` |
| `http_request_duration_ms` | histogram | `method`, `route` |
| `http_errors_total` | counter | `code` |
| `invoke_total` | counter | `mode` (mock/real), `ok` (true/false) |
| `rate_limit_blocked_total` | counter | `limiter` (global/invoke) |

**Scrape config exemplo:**
```yaml
scrape_configs:
  - job_name: apis-sport
    scrape_interval: 30s
    static_configs:
      - targets: ['apis-sport:3000']
    metrics_path: /api/metrics
```

---

## Logs

- **Formato:** `LOG_FORMAT=json` para produção (ELK/Datadog), `pretty` para dev.
- **Níveis:** controlados por `LOG_LEVEL`.
- **Request ID:** cada request loga `req_id` para rastreamento. Cliente pode enviar `X-Request-ID` para forçar.
- **Redaction automática:** `rapidApiKey`, `authorization`, `cookie` viram `[REDACTED]`.

**Exemplo JSON:**
```json
{"level":"info","time":"2026-05-14T20:39:21.203Z","msg":"http","req_id":"a1b2c3","method":"POST","path":"/api/invoke","status":200,"ms":42,"ip":"203.0.113.5","ua":"Mozilla/5.0"}
```

---

## Rate limiting

- **In-memory por IP** (single-instance). Para multi-instância, considerar Redis.
- **Limites independentes:** global e `/api/invoke*` (mais restritivo).
- Headers de resposta: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- Quando excedido: `429 Too Many Requests` com `Retry-After`.

---

## Troubleshooting

| Sintoma | Verificar |
|---|---|
| `503 NOT_READY` em `/api/ready` | Catálogo não carregou. Ver logs `catalog loaded` no boot. |
| `429` em rajada | Aumentar `RATE_LIMIT_MAX_REQUESTS` ou reduzir tráfego. |
| `502` em modo real | RapidAPI timeout / key inválida. Ver `result.error`. |
| Memória crescendo | Não esperado (catálogo é estático). Tirar heap dump: `kill -USR2 <pid>` em Node 22+. |
| Latência alta | Ver `http_request_duration_ms` histogram + `invoke_total`. |
| CSP bloqueando frontend | Ver `Content-Security-Policy` no `src/middleware/security.js`. |

### Debug rápido

```bash
# Health geral
curl -s http://localhost:3000/api/health | jq

# Métricas humanas
curl -s http://localhost:3000/api/metrics

# Snapshot JSON
curl -s http://localhost:3000/api/metrics/json | jq

# Top APIs por uso (em modo real, via logs JSON)
docker logs apis-sport | grep '"invoke"' | jq -r '.api_id' | sort | uniq -c | sort -rn | head
```

---

## Deploy

```bash
# CI passa → build da imagem com tag de versão
docker build -t apis-sport:3.0.0 -t apis-sport:latest .

# Push para registry (substitua pelo seu)
docker tag apis-sport:3.0.0 ghcr.io/felipeacastro/apis-sport:3.0.0
docker push ghcr.io/felipeacastro/apis-sport:3.0.0

# K8s rolling update
kubectl set image deployment/apis-sport app=ghcr.io/felipeacastro/apis-sport:3.0.0
kubectl rollout status deployment/apis-sport
```

---

## Rollback

```bash
kubectl rollout undo deployment/apis-sport
# ou para uma revisão específica
kubectl rollout history deployment/apis-sport
kubectl rollout undo deployment/apis-sport --to-revision=42
```

---

## SLOs

| Indicador | Alvo | Como medir |
|---|---|---|
| **Disponibilidade** | 99.5% mensal | uptime via `/api/live` |
| **Latência p95 (não-invoke)** | < 100ms | `http_request_duration_ms{route!~"/api/invoke.*"}` |
| **Latência p95 (invoke mock)** | < 50ms | `http_request_duration_ms{route="/api/invoke"}` em modo mock |
| **Latência p95 (invoke real)** | < 3s | depende do upstream RapidAPI |
| **Taxa de erro 5xx** | < 0.1% | `rate(http_errors_total{code=~"5.."}[5m])` |

---

## Contatos

- **Repo:** https://github.com/FELIPEACASTRO/APIS-SPORT
- **Issues:** https://github.com/FELIPEACASTRO/APIS-SPORT/issues
- **Plantão:** _(adicione seu canal)_
