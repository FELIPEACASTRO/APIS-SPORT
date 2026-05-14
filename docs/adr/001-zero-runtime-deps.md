# ADR 001 — Zero dependências runtime além do Express

**Status:** Accepted
**Data:** 2026-05-14

## Contexto

A solução é um gateway HTTP + SPA estática. Em produção, cada dependência transitiva é uma superfície de ataque (CVE) e um custo de manutenção. Bibliotecas tipicamente usadas (`helmet`, `cors`, `morgan`, `express-rate-limit`, `pino`, `zod`, `dotenv`) somariam ~80–120 pacotes transitivos.

## Decisão

Manter `express` como única dependência runtime. Implementar manualmente:
- Security headers (helmet-equivalente)
- CORS
- Request logger
- Rate limiter (sliding window in-memory)
- Validation (schemas como funções puras)
- Logger estruturado (pretty/json)
- Parsing de `.env`

ESLint é a única dep de desenvolvimento.

## Consequências

**Positivas:**
- Superfície de ataque mínima (1 dep ↔ 65 dep transitivas via express)
- Build/install rápido (~5s)
- Sem versionamento conflitante
- Sem peer deps surpresa

**Negativas:**
- ~600 linhas de middleware "reinventadas"
- Manutenção exige conhecimento HTTP de mais baixo nível
- Features avançadas (Redis-backed rate limit, OpenTelemetry) exigiriam refator

## Alternativas consideradas

- **`helmet + cors + pino + express-rate-limit`**: stack padrão, mas vinha com 30+ deps adicionais
- **Fastify**: melhor performance, mas troca o framework central
- **Hono**: edge-friendly, mas não suportado em todo lugar
