# Auditoria de solução — arquitetura, integrações, microserviços, Node.js e UX

Data: 2026-05-15  
Escopo: APIS // SPORT v3.2.0, incluindo servidor Express, catálogo RapidAPI, invocação mock/real, operação, CI/QA e experiência web.

## 1. Resumo executivo

A solução está em um patamar sólido para homologação técnica: possui gateway Node/Express com separação clara entre catálogo, invocador, middlewares, métricas e frontend estático; tem catálogo validado em boot; inclui testes automatizados; e mantém modo mock como recurso de produto para operar sem dependência externa.

Durante a auditoria foram encontrados e corrigidos pontos de fricção que afetavam integração browser/API e consistência operacional:

- **CORS não liberava os headers de autenticação documentados** (`Authorization`, `X-Invoke-Token`, `X-Metrics-Token`), o que poderia bloquear chamadas reais protegidas e scraping autenticado de métricas a partir de clientes web sujeitos a preflight.
- **Gates do container estavam menos rigorosos que o CI**, pois o stage de teste Docker executava `npm test` e `npm run qa`, mas não o `qa:100x`.
- **Documentação/branding tinham metadados defasados**, com badge `3.0.0` e UI `v2`, enquanto o pacote está em `3.2.0`.
- **docker-compose induzia configuração incompleta de modo real**, pois comentava apenas `RAPIDAPI_KEY`, mas produção exige também `REAL_INVOKE_TOKEN` quando há chave server-side.

## 2. Matriz de achados

| ID | Área | Severidade | Status | Achado | Impacto | Evidência | Ação aplicada / recomendação |
|---|---|---:|---|---|---|---|---|
| AUD-001 | Integrações / Browser API | Alta | Corrigido | Preflight CORS não declarava os headers de autenticação aceitos pelo backend. | Chamadas reais com `X-Invoke-Token`/Bearer e métricas com `X-Metrics-Token` poderiam falhar no navegador antes de chegar ao Express. | Backend aceita tokens via header/Bearer e protege métricas/invoke; CORS precisava refletir esse contrato. | `Access-Control-Allow-Headers` agora inclui `Authorization`, `X-Invoke-Token` e `X-Metrics-Token`; testes e QA 100x cobrem regressão. |
| AUD-002 | Release engineering / Container | Média | Corrigido | Build Docker não executava `qa:100x`. | Imagem poderia ser promovida sem a bateria destrutiva que o pipeline de homologação já exige. | `Dockerfile` stage `test` tinha gate menor que `package.json`/CI. | Stage de teste Docker agora executa `npm test && npm run qa && npm run qa:100x`. |
| AUD-003 | Operação / Compose | Média | Corrigido | `docker-compose.yml` sugeria apenas `RAPIDAPI_KEY` para modo real. | Operador poderia ativar chave e ter falha de boot em produção por ausência de `REAL_INVOKE_TOKEN`, ou tentar padrão inseguro. | Config produção exige token quando existe chave server-side. | Compose agora documenta `REAL_INVOKE_TOKEN`, `METRICS_TOKEN` e fixa `ALLOW_CLIENT_RAPIDAPI_KEY=false`. |
| AUD-004 | UX / Confiança de versão | Baixa | Corrigido | README e UI exibiam versões defasadas. | Reduz confiança em homologação e dificulta suporte/triagem. | Package está em `3.2.0`; README badge e topo da UI não refletiam isso. | Badges e selo visual foram alinhados para `>=20` e `v3.2`. |
| AUD-005 | Microserviços / Escala horizontal | Média | Backlog | Rate limit é em memória. | Em múltiplas réplicas, limites por IP ficam inconsistentes e podem ser contornados por balanceamento. | ADR reconhece escolha zero-deps/in-memory. | Para produção multi-instância, introduzir backend distribuído opcional (Redis/Valkey) ou rate limit no edge/API gateway. |
| AUD-006 | Segurança / Exposição de health | Baixa | Backlog | `/api/health` informa presença de `RAPIDAPI_KEY`. | Informação não secreta, mas útil para enumeração operacional. | Endpoint expõe booleano `server_has_rapidapi_key`. | Manter em ambientes internos; em internet pública, mover detalhe para readiness interna ou proteger health rico. |
| AUD-007 | UX / Acessibilidade dinâmica | Baixa | Backlog | QA estático cobre boa parte da A11y, mas não executa leitor de tela/axe real no DOM renderizado. | Regressões dinâmicas podem passar se surgirem via renderização JS. | Há checks estáticos e testes HTTP, mas sem browser/a11y engine. | Adicionar Playwright + axe-core em pipeline futuro se dependências externas forem permitidas. |
| AUD-008 | Observabilidade / Métricas | Média | Backlog | Métricas são process-local. | Em múltiplas réplicas, Prometheus precisa agregar por instância; não há tracing distribuído. | `src/metrics.js` mantém contadores locais. | Padronizar labels de instância, dashboards e opcionalmente OpenTelemetry para correlação request/upstream. |

## 3. Arquitetura de solução e sistemas

### Pontos fortes

- **Separação de responsabilidades adequada**: `server.js` orquestra HTTP; `src/catalog.js` lê/indexa dados; `src/invoker.js` concentra invocação mock/real; middlewares isolam segurança, CORS, logging, rate limit, request-id e validação.
- **Boot fail-fast para dados críticos**: catálogo é carregado e validado no início; shape, ids e hosts duplicados interrompem o processo antes de servir tráfego ruim.
- **Modo mock como capacidade arquitetural**: reduz dependência de RapidAPI para QA, demo e testes automatizados.
- **OpenAPI e docs existem**: bom sinal para integração com consumidores e contratos.

### Riscos arquiteturais remanescentes

- **Estado local por processo**: rate limit e métricas não são distribuídos. Isso é aceitável para single-instance, mas precisa ser revisitado antes de escala horizontal.
- **Gateway acopla UI e API no mesmo processo**: simples e adequado ao produto atual, mas em alta escala pode exigir separar frontend estático/CDN do gateway de invocação.
- **Catálogo é arquivo local versionado**: robusto para catálogo editorial fechado; se o catálogo virar dinâmico, será necessário pipeline de ingestão/validação/publicação.

## 4. Integrações e microserviços

### Pontos fortes

- **Contratos defensivos no modo real**: chamadas com chave server-side exigem token em produção.
- **Timeout configurável para upstream** evita conexões penduradas.
- **Batch limitado e com concorrência controlada** reduz risco de avalanche no provedor externo.
- **Probes separados** (`live`, `ready`, `health`, `version`) favorecem operação em orquestradores.

### Achado corrigido relevante

O contrato de autenticação real/métricas aceitava `X-Invoke-Token`, `X-Metrics-Token` e Bearer, mas o CORS antigo só liberava `Content-Type`, `X-Request-ID` e `X-RapidAPI-Key`. Isso cria uma falha típica de integração: funciona em `curl`/backend-to-backend, mas falha no navegador por preflight. A correção alinha CORS ao contrato documentado.

## 5. Desenvolvimento Node.js

### Pontos fortes

- **Node ESM e zero-deps consciente**: reduz superfície de supply chain.
- **Express 5** com middlewares simples e testáveis.
- **Validação manual explícita** para payloads sensíveis, incluindo limite de body, endpoint relativo e query sanitizada.
- **AbortController no upstream** respeita timeout configurável.
- **Testes com `node:test`** evitam dependências adicionais e cobrem catálogo, config, invoker e servidor.

### Recomendações Node.js

1. Adicionar teste de regressão para CORS autenticado — aplicado nesta auditoria.
2. Considerar `structuredClone`/freeze profundo do catálogo em cache se futuras rotas começarem a mutar objetos retornados.
3. Se a solução crescer, avaliar schema validation com lib dedicada apenas se o trade-off de dependência valer a clareza e manutenção.

## 6. Navegabilidade e experiência do usuário

### Pontos fortes

- **Fluxo principal claro**: descobrir/selecionar → sessão → dashboard.
- **Acessibilidade básica presente**: skip link, tabs com roles, `aria-live`, dialogs rotulados, foco visível e reduced motion.
- **Comando rápido e atalhos** indicam preocupação com power users.
- **Modo mock reduz fricção** para demonstração sem credenciais.

### Recomendações UX

1. Mostrar no rodapé/topbar a versão real do pacote em tempo de build ou via `/api/version`, evitando drift manual futuro.
2. Incluir teste browser real em pipeline futuro para validar navegação por teclado, foco em dialogs e renders dinâmicos.
3. Exibir orientação contextual quando modo real estiver indisponível por falta de token/chave, diferenciando erro de autenticação, upstream e validação.

## 7. Segurança e conformidade operacional

### Pontos fortes

- CSP sem `unsafe-inline` em `script-src`.
- Headers de segurança básicos presentes.
- Bloqueio de URL absoluta em `endpoint`, reduzindo SSRF via host externo.
- Client-side RapidAPI key bloqueada por default em produção.
- Tokens para modo real e métricas.
- Logger redige campos sensíveis.

### Backlog recomendado

- Proteger ou reduzir `/api/health` rico quando exposto publicamente.
- Considerar allowlist de endpoints por API se o catálogo passar a incluir rotas conhecidas; hoje o endpoint relativo é flexível, o que é útil, mas amplia superfície de chamada no host RapidAPI.
- Documentar rotação de `REAL_INVOKE_TOKEN` e `METRICS_TOKEN` no runbook.

## 8. QA, CI/CD e release

### Pontos fortes

- Pipeline local `homolog` agrega lint, testes, QA, QA 100x, smoke e integração.
- CI executa integração e `qa:100x`.
- `npm audit` não bloqueante reduz falso negativo por registry, mantendo sinal de SCA.

### Correção aplicada

O Dockerfile agora executa `qa:100x` no stage de teste. Isso aproxima o gate de imagem do gate de homologação e evita promoção de container sem checks destrutivos.

## 9. Veredito

**Status da solução após ajustes desta auditoria: adequada para homologação técnica e demonstração controlada.**

Para produção em escala, os principais itens antes de abertura ampla são:

1. Definir estratégia distribuída para rate limit/métricas ou delegar ao edge/API gateway.
2. Decidir se `/api/health` rico será interno/protegido.
3. Adicionar testes browser/a11y reais se a UX for parte crítica do SLA.
4. Planejar observabilidade distribuída para chamadas upstream reais.
