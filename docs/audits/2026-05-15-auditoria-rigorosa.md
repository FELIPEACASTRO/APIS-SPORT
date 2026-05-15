# Dossiê de auditoria rigorosa — APIS // SPORT

**Data:** 2026-05-15
**Escopo auditado:** repositório versionado em `/workspace/APIS-SPORT`, excluindo `.git` e `node_modules` por serem metadados/dependências geradas.
**Observação sobre `.claude`:** não existe diretório `.claude` neste checkout; portanto, não há arquivos `.claude` para auditar.
**Método:** leitura arquivo a arquivo dos artefatos versionados, execução de suíte automatizada, buscas estáticas por padrões de risco, validação programática do catálogo e double-check estático 10x sobre UX/UI/acessibilidade.

---

## 1. Resumo executivo

A solução está funcional, tem boa disciplina de testes automatizados e contém decisões arquiteturais documentadas. O principal valor está no catálogo consolidado de 302 APIs, no modo mock determinístico, em probes operacionais e em uma SPA sem build step. Entretanto, uma leitura sob múltiplas visões profissionais aponta riscos importantes para produção real:

1. **Risco de custo e abuso do proxy RapidAPI:** se `RAPIDAPI_KEY` estiver configurada no servidor, qualquer cliente que acesse o endpoint `/api/invoke` pode consumir a chave do backend, pois não há autenticação/autorização de usuários.
2. **Configuração de timeout não aplicada:** `UPSTREAM_TIMEOUT_MS` existe na configuração, mas o invoker usa `DEFAULT_TIMEOUT_MS = 10_000` hardcoded.
3. **Catálogo validado nos testes, mas não rigorosamente validado no boot:** existe função `validateApiShape`, mas o carregamento em runtime não a executa.
4. **Rate limit in-memory não é suficiente para multi-instância e pode crescer por IPs variados até a limpeza periódica.**
5. **OpenAPI e produto real ainda não descrevem todo o comportamento operacional:** `/api/log-error` não está documentado; endpoints RapidAPI reais só suportam `GET`, apesar de muitos provedores exigirem métodos, paths e parâmetros específicos.
6. **Frontend tem uso extensivo de `innerHTML`; a maioria usa escape, mas há pontos que dependem da confiabilidade atual do catálogo e podem virar XSS se a fonte de dados mudar.**
7. **Pipeline CI é bom, mas incompleto para regressão de integração:** há script `npm run integration`, mas ele não é executado no workflow de CI.
8. **Dados do catálogo têm lacunas de qualidade:** provedores ausentes/`unknown`, 85 entradas com telemetria totalmente zerada, 18 entradas com popularidade positiva e sucesso zero, 8 latências acima de 30s, nomes duplicados intencionais mas potencialmente confusos.
9. **Governança de dependências ficou parcialmente bloqueada no ambiente:** `npm audit` e `npm outdated` não conseguiram consultar o registry por `403 Forbidden`, então a auditoria de CVEs/latest deve ser repetida em ambiente com acesso liberado.
10. **UX/UI têm boa base visual e responsiva, mas ainda carecem de validação objetiva:** há focus state, media queries, dialogs e aria em vários pontos; porém falta teste real de usabilidade, contraste automatizado, axe/Lighthouse, documentação de design tokens e validação de nomes acessíveis em componentes renderizados por template.

---

## 2. Evidências automatizadas coletadas

### 2.1 Inventário

- Arquivos versionados auditáveis identificados com:
  - `find . -path './node_modules' -prune -o -path './.git' -prune -o -type f -print | sed 's#^./##' | sort`
- Diretório `.claude` verificado com:
  - `find . -maxdepth 2 -type d -name '.claude' -print`
- Resultado: **nenhum diretório `.claude` encontrado**.

### 2.2 Testes e checks executados

- `npm run lint`
- `npm test`
- `npm run qa`
- `npm run smoke`
- `npm run integration`
- `git diff --check`
- `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`
- `npm audit --audit-level=moderate` (**bloqueado por 403 no registry**)
- `npm outdated --long` (**bloqueado por 403 no registry**)
- Double-check UX/UI estático via contagem de botões, inputs, `aria-*`, dialogs, templates, media queries, `:focus-visible`, `prefers-reduced-motion`, `innerHTML`, `textContent`, listeners e `localStorage`
- Varredura de acessibilidade por padrões: `aria-*`, `role=`, `tabindex`, `<dialog>`, `<button>`, `<input>`, `focus-visible`, `prefers-reduced-motion`, `@media`, `innerHTML` e `textContent`

### 2.3 Validação programática do catálogo

Resumo calculado via `loadCatalog()`:

| Métrica | Resultado |
|---|---:|
| Total de APIs | 302 |
| Hosts duplicados | 0 |
| Nomes duplicados | `8xbet` ×4, `Football Odds` ×2, `Sport Odds` ×2 |
| Provedor ausente/unknown | 4 entradas |
| Telemetria totalmente zerada | 85 entradas |
| Popularidade positiva com sucesso zero | 18 entradas |
| Latência acima de 30s | 8 entradas |

Distribuição por subcategoria:

| Subcategoria | Quantidade |
|---|---:|
| Odds | 83 |
| Casas de Apostas / Odds | 55 |
| Casas de Apostas / Odds / Predicao | 6 |
| Odds / Predicao | 44 |
| Dados de Apostas | 44 |
| Predicao | 46 |
| Casas de Apostas | 22 |
| Casas de Apostas / Predicao | 2 |

Distribuição por preço:

| Pricing | Quantidade |
|---|---:|
| Freemium | 244 |
| Gratuito | 43 |
| Pago | 15 |

---

## 3. Visões profissionais aplicadas

### 3.1 Arquiteto de software

**Pontos fortes**

- Separação clara entre entrypoint Express, catálogo, invoker, mock, métricas, middleware e shutdown.
- ADRs documentam decisões relevantes: zero runtime deps extras, mock como feature, vanilla modules, rate limit in-memory, cache de catálogo e modos real/mock.
- O modo mock reduz dependência externa e melhora QA.

**Gaps**

| ID | Severidade | Achado | Evidência | Impacto | Recomendação |
|---|---|---|---|---|---|
| ARQ-01 | Alta | Proxy real não tem modelo de autenticação/autorização de usuários. | `/api/invoke` e `/api/invoke/batch` aceitam chamadas sem auth. | Se `RAPIDAPI_KEY` estiver no servidor, terceiros podem consumir cota/custo. | Adicionar auth obrigatória para modo real, quotas por usuário e segregação de ambientes. |
| ARQ-02 | Alta | O invoker só suporta `GET`. | `fetch` real usa `method: 'GET'`. | Muitas APIs RapidAPI exigem POST, paths com parâmetros, headers extras ou payload. | Evoluir schema para método, path template, query/body/headers permitidos por API. |
| ARQ-03 | Média | Catálogo é cache global sem invalidação configurável. | `loadCatalog()` carrega uma vez em memória. | Atualizações de catálogo exigem restart. | Adicionar endpoint/estratégia de reload controlado ou versionamento explícito do catálogo. |
| ARQ-04 | Média | SPA e API vivem no mesmo processo sem separação de responsabilidades. | Express serve API e `public`. | Deploys de UI e API ficam acoplados. | Para escala, separar CDN/static hosting e API gateway. |

### 3.2 Especialista backend Node.js / Express

| ID | Severidade | Achado | Evidência | Impacto | Recomendação |
|---|---|---|---|---|---|
| BE-01 | Alta | `UPSTREAM_TIMEOUT_MS` é configurável, mas não é usado pelo invoker. | `src/config.js` define `UPSTREAM_TIMEOUT_MS`; `src/invoker.js` usa `DEFAULT_TIMEOUT_MS = 10_000`. | Operação acredita configurar timeout, mas runtime ignora. | Importar `config` no invoker ou injetar timeout via parâmetro. |
| BE-02 | Média | `getApiById()` pode lançar antes do `try` de `invokeApi` cobrir tudo. | `const api = getApiById(req.apiId)` ocorre antes do `try`. | Em chamada interna com ID inválido, erro pode escapar para Express 500. Hoje validação limita, mas não garante existência. | Envolver resolução da API no `try` ou validar existência no middleware. |
| BE-03 | Média | Endpoint do upstream é pouco restrito. | `normalizeEndpoint()` só adiciona `/` e aceita string até 1000 chars. | Chamada real pode atingir qualquer path do host RapidAPI escolhido, consumindo cota de forma imprevisível. | Whitelist de endpoints por API, ou catálogo com endpoints permitidos. |
| BE-04 | Média | Payload de erro do cliente `/api/log-error` não tem validação ou limite semântico além do JSON global 64kb. | Rota lê `message`, `stack`, `source` e loga. | Poluição de logs, custo de ingestão e ruído operacional. | Aplicar schema, truncamento e rate-limit específico por rota. |
| BE-05 | Baixa | `requestId` preserva qualquer string até 64 caracteres. | Header `X-Request-ID` é aceito por comprimento, sem regex. | IDs com caracteres estranhos podem prejudicar logs/correlação. | Restringir a `[A-Za-z0-9._:-]` ou gerar UUID se inválido. |

### 3.3 Segurança / AppSec

| ID | Severidade | Achado | Evidência | Impacto | Recomendação |
|---|---|---|---|---|---|
| SEC-01 | Crítica | Ausência de autenticação para uso do proxy real. | `/api/invoke` aceita `mode=real` com chave do servidor. | Vazamento indireto de valor: qualquer usuário usa cota paga. | Exigir auth, RBAC, API keys próprias por cliente e quotas. |
| SEC-02 | Alta | CORS default `*`; se combinado com credenciais, fica política insegura/inválida. | `CORS_ORIGIN` default `*`; middleware também pode setar `Access-Control-Allow-Credentials`. | Pode abrir superfície cross-origin e configuração confusa em produção. | Falhar boot se `CORS_ORIGIN='*'` e `CORS_CREDENTIALS=true`; exigir origins explícitos em produção. |
| SEC-03 | Alta | Chave RapidAPI pode trafegar no body vindo do browser. | Schema aceita `rapidApiKey` em body. | Exposição da chave do usuário a browser, proxy, logs de camada externa e extensões. | Preferir secrets server-side, storage seguro e nunca pedir chave no cliente para produção. |
| SEC-04 | Média | CSP permite `style-src 'unsafe-inline'`. | Header de segurança admite inline styles. | Reduz proteção contra injeção CSS/HTML. | Migrar estilos inline para classes/CSS variables sanitizadas e remover `unsafe-inline`. |
| SEC-05 | Média | Uso de `innerHTML` em múltiplos pontos. | Templates da UI e SVGs são montados por string. | Se o catálogo/upstream passar dados não escapados, há risco de XSS. | Padronizar builders DOM ou sanitização centralizada para todo HTML/SVG dinâmico. |
| SEC-06 | Média | Tooltip do scatter usa `p.name` sem escape dentro de SVG. | `public/js/dashboard.js` monta `<title>#... ${p.name} ...</title>`. | Catálogo futuro com caracteres HTML pode injetar marcação. | Aplicar `escape(p.name)` também em SVG titles. |
| SEC-07 | Média | `/api/metrics` é público. | Métricas são expostas sem auth. | Pode revelar tráfego, taxa de erro e comportamento operacional. | Restringir por rede, auth ou flag em produção. |

### 3.4 SRE / Operações

| ID | Severidade | Achado | Evidência | Impacto | Recomendação |
|---|---|---|---|---|---|
| SRE-01 | Alta | Rate limiter é in-memory e por IP local. | ADR e middleware indicam single-instance; sem Redis. | Em multi-instância, limite é multiplicado pelo número de réplicas. | Redis/Valkey ou API Gateway rate limiting centralizado. |
| SRE-02 | Média | Probes e métricas são isentos de rate limit. | Lista `PROBE_PATHS` inclui `/api/metrics`. | Bom para K8s, mas métricas públicas podem ser abusadas. | Separar health público de metrics restrito. |
| SRE-03 | Média | Não há circuit breaker para upstream RapidAPI. | Invoker faz fetch direto com timeout. | Falhas/latência do upstream podem degradar workers e UX. | Adicionar circuit breaker, bulkhead, cache curto e retries idempotentes com backoff. |
| SRE-04 | Média | Não há persistência de métricas. | Métricas são em memória. | Perda de histórico em restart. | Integrar Prometheus real scraping e dashboards/alerts. |
| SRE-05 | Baixa | Health rico chama `loadCatalog()` a cada request, embora cacheado. | `/api/health` lê catálogo via cache. | Baixo impacto hoje; se houver reload futuro, health pode virar mais pesado. | Manter health leve e separar readiness detalhada. |

### 3.5 QA / Testes

**Pontos fortes**

- Existem testes de catálogo, invoker e servidor.
- Smoke test cobre API, SPA, headers, fallback e regressões de JSON malformado/body grande.
- Integration test sobe servidor real e valida múltiplas features.

**Gaps**

| ID | Severidade | Achado | Evidência | Impacto | Recomendação |
|---|---|---|---|---|---|
| QA-01 | Alta | CI não executa `npm run integration`. | Workflow roda lint, unit, QA e smoke. | Regressões cobertas só pelo integration podem passar em PR. | Adicionar step `npm run integration` no CI. |
| QA-02 | Média | Testes reais dependem de `RAPIDAPI_KEY` e ficam skipped. | Integration reporta 1 skipped sem chave. | Baixa confiança no modo real em CI. | Usar ambiente noturno/manual com chave de sandbox e orçamento controlado. |
| QA-03 | Média | Não há testes de acessibilidade automatizados. | Sem axe/playwright/lighthouse. | Riscos de a11y passam despercebidos. | Adicionar checks a11y ou Playwright + axe. |
| QA-04 | Média | Não há teste E2E de browser real. | SPA é testada por HTTP e smoke textual. | Interações, modais e teclado podem quebrar sem detecção. | Adicionar Playwright/Cypress para fluxos críticos. |
| QA-05 | Baixa | Não há snapshots/contratos OpenAPI automatizados. | OpenAPI existe, mas não é validado no CI. | Drift entre API real e spec. | Validar `openapi.yaml` e comparar endpoints implementados. |

### 3.6 Dados / Catálogo

| ID | Severidade | Achado | Evidência | Impacto | Recomendação |
|---|---|---|---|---|---|
| DATA-01 | Alta | `validateApiShape()` existe, mas não é chamado em `loadCatalog()`. | Função declarada no fim de `src/catalog.js`; carregamento só parseia JSON e agrega. | Catálogo malformado pode subir em produção se testes não rodarem. | Validar cada entrada no boot e falhar rápido com erro detalhado. |
| DATA-02 | Média | 85 APIs têm telemetria totalmente zerada. | Validação programática via `loadCatalog()`. | Rankings e dashboards podem induzir interpretação errada. | Separar “sem telemetria” de “métrica zero real” em campos distintos. |
| DATA-03 | Média | 4 entradas têm provedor ausente ou `unknown`. | IDs 91, 185, 197, 275. | Prejudica filtro, governança e confiança editorial. | Normalizar provider ou adicionar `provider_status`. |
| DATA-04 | Média | 8 APIs têm latência > 30s, acima do timeout real atual de 10s. | IDs 175, 181, 190, 193, 194, 196, 232, 241. | Modo real deve falhar por timeout para APIs que o catálogo ainda lista. | Sinalizar incompatibilidade com timeout e ajustar estratégia por API. |
| DATA-05 | Baixa | Nomes duplicados podem confundir usuários. | `8xbet` ×4, `Football Odds` ×2, `Sport Odds` ×2. | Seleção equivocada. | Mostrar host/provedor com mais destaque para duplicados. |
| DATA-06 | Baixa | `generated_at` é gerado no boot, não vem do dossiê-fonte. | `meta.generated_at: new Date().toISOString()`. | Pode parecer data de geração real do catálogo. | Incluir `source_generated_at` estático/versionado. |

### 3.7 Frontend / UX / Acessibilidade

| ID | Severidade | Achado | Evidência | Impacto | Recomendação |
|---|---|---|---|---|---|
| FE-01 | Alta | Entrada `rapidApiKey` no browser é sensível. | UI tem campo password para chave em modo real. | Chave pode ser exposta por extensões, logs de rede locais, histórico de automação. | Para produção, remover chave do browser e usar credenciais server-side por usuário. |
| FE-02 | Média | Uso extensivo de `innerHTML`. | Views e dashboard montam HTML/SVG por template string. | Risco futuro se fonte de dados deixar de ser confiável. | Preferir criação DOM, `textContent` e helpers de escape obrigatórios. |
| FE-03 | Média | `confirmDialog` aceita body HTML e injeta via `innerHTML`. | Body atual é controlado, mas API da função é genérica. | Uso futuro com input do usuário pode criar XSS. | Trocar para body text ou aceitar apenas fragments construídos por DOM. |
| FE-04 | Média | Sem testes automatizados de teclado/modal. | Documentado em homologação manual. | Regressões de atalhos e foco podem passar. | Playwright para atalhos, foco e dialogs. |
| FE-05 | Baixa | Dashboard usa escala linear para latência e capa em 10s. | Comentário reconhece alternativa de log scale. | Outliers ficam comprimidos e análise pode ser distorcida. | Usar escala logarítmica ou filtros interativos. |

### 3.8 DevSecOps / Supply chain

| ID | Severidade | Achado | Evidência | Impacto | Recomendação |
|---|---|---|---|---|---|
| DEVOPS-01 | Alta | Auditoria de CVEs não pôde ser concluída no ambiente atual. | `npm audit` retornou 403. | Vulnerabilidades podem estar desconhecidas. | Rodar audit em CI com registry liberado; considerar Dependabot/Renovate. |
| DEVOPS-02 | Média | `npm outdated` bloqueado por 403. | Registry negou consulta de `express`. | Sem visão de atualização de dependências. | Liberar registry ou usar mirror corporativo. |
| DEVOPS-03 | Média | Dockerfile usa `node:22-alpine` por tag móvel. | Base image sem digest pinning. | Build não reprodutível e supply chain mutável. | Pin por digest e automatizar atualização controlada. |
| DEVOPS-04 | Média | CI não roda `npm audit`/SCA. | Workflow não tem step de SCA. | CVEs podem entrar sem bloqueio. | Adicionar SCA com política de severidade. |
| DEVOPS-05 | Baixa | `docker-compose.yml` incentiva chave em comentário inline. | Comentário sugere colar `RAPIDAPI_KEY`. | Risco operacional de commit acidental em variações locais. | Usar `.env`/secrets e documentação clara. |

### 3.9 Produto / Negócio

| ID | Severidade | Achado | Impacto | Recomendação |
|---|---|---|---|---|
| PROD-01 | Alta | Produto promete invocação de 302 APIs, mas modo real genérico não conhece endpoints específicos. | Expectativa do usuário pode não bater com sucesso real. | Evoluir catálogo para incluir endpoints testados por API. |
| PROD-02 | Alta | Sem controle de custos por usuário/time. | Risco financeiro com RapidAPI. | Quotas, billing interno, limites por usuário e alertas. |
| PROD-03 | Média | “Freemium/Gratuito/Pago” não é garantia de custo real atual. | Usuário pode tomar decisão baseada em dados desatualizados. | Atualização periódica e timestamp de coleta por API. |
| PROD-04 | Média | Sem SLA/SLO documentado por modo mock/real. | Operação não sabe meta de disponibilidade/latência. | Definir SLOs e error budget. |

### 3.10 UX Research / Experiência do usuário

**Sinais positivos encontrados no double-check**

- Fluxo principal é reconhecível: descobrir APIs, filtrar, selecionar, executar e ler resultados.
- Há onboarding, command palette, atalhos e feedback por toasts, o que reduz atrito para usuários avançados.
- Estados vazios e contadores ajudam a orientar o usuário durante seleção e resultados.
- A configuração separa modo mock e real, reduzindo risco de uso acidental do RapidAPI quando o usuário entende o fluxo.

| ID | Severidade | Achado | Evidência | Impacto | Recomendação |
|---|---|---|---|---|---|
| UX-01 | Alta | O modo real pode gerar custo, mas a UX ainda depende de confirmação pontual e texto; não há orçamento, quota visível ou estimativa de consumo. | Fluxo de confirmação informa consumo de cota, mas não mostra saldo, custo estimado ou limite. | Usuário pode executar chamadas reais sem noção operacional/financeira. | Exibir quota, ambiente, owner da chave, custo estimado e limite antes da execução real. |
| UX-02 | Alta | A promessa de “302 APIs” não diferencia claramente “catalogada”, “mock OK”, “real testada” e “real não validada”. | Catálogo mostra 302 e mock cobre 302; modo real depende de endpoint genérico. | Usuário pode interpretar disponibilidade mock como disponibilidade real. | Introduzir badges/status: `mock`, `real validada`, `real pendente`, `real falhou`, `sem endpoint homologado`. |
| UX-03 | Média | Usuários iniciantes podem não entender `endpoint` e parâmetros necessários para cada RapidAPI. | Campo endpoint é genérico e exige conhecimento externo. | Aumento de erros 4xx/5xx e frustração. | Para cada API, fornecer endpoints sugeridos, exemplos e validação contextual. |
| UX-04 | Média | Resultados técnicos são ricos, mas falta explicação acionável para erros. | Cards mostram HTTP/status/erro, mas sem playbook por causa. | Usuário não sabe diferenciar chave inválida, quota excedida, endpoint errado ou timeout. | Mapear erros comuns para mensagens de recuperação. |
| UX-05 | Média | Filtros têm contadores, mas não há facetas com quantidades por estado após filtros. | Filtros são selects estáticos. | Usuário explora menos eficientemente catálogo grande. | Facetas dinâmicas com contagem, busca salva e presets explicáveis. |
| UX-06 | Baixa | Persistência via `localStorage` é conveniente, mas não há painel claro de dados salvos localmente. | Histórico/seleção/preferências persistem. | Usuário pode não entender o que fica salvo no navegador. | Adicionar “Privacidade local” e botão de limpeza total. |
| UX-07 | Baixa | Onboarding e atalhos existem, mas não há telemetria ética/opt-in para saber onde usuários travam. | Sem analytics de funil. | Priorização de UX fica baseada em opinião. | Instrumentar eventos anônimos/opt-in ou usar testes moderados. |

### 3.11 UI Design / Interface visual

**Sinais positivos encontrados no double-check**

- O CSS usa design tokens por variáveis (`--bg`, `--ink`, `--volt`, `--cyan`, `--amber`, etc.).
- Há responsividade com 11 `@media`, suporte a `prefers-reduced-motion`, estado `:focus-visible` e estrutura visual consistente.
- O HTML contém 5 dialogs, 4 templates, 29 `aria-label`, tablist/tabs e landmarks principais.

**Métricas estáticas do double-check UI/A11y**

| Métrica estática | Valor |
|---|---:|
| Botões no HTML | 34 |
| Inputs no HTML | 8 |
| `aria-label` no HTML | 29 |
| `aria-selected` no HTML | 6 |
| Dialogs | 5 |
| Templates | 4 |
| Media queries no CSS | 11 |
| Regras `:focus-visible` | 1 |
| Regras `prefers-reduced-motion` | 1 |
| Variáveis CSS detectadas | 56 |
| Atribuições `.innerHTML =` em JS | 19 |
| Atribuições `.textContent =` em JS | 30 |
| `addEventListener(...)` em JS | 50 |
| Referências a `localStorage` | 8 |

| ID | Severidade | Achado | Evidência | Impacto | Recomendação |
|---|---|---|---|---|---|
| UI-01 | Alta | Não há validação automatizada de contraste. | Paleta escura/neon depende de tokens visuais; sem axe/Lighthouse/contrast checker no CI. | Baixa visão, daltonismo ou telas ruins podem ter legibilidade insuficiente. | Adicionar teste de contraste WCAG AA/AAA para tokens e componentes principais. |
| UI-02 | Alta | Nome acessível de componentes dinâmicos depende de preenchimento runtime. | Script estático apontou botão de template `catalog-item__main` sem texto inicial antes do render. | Ferramentas automatizadas podem acusar falha; se render falhar, controle fica sem nome. | Garantir `aria-label`/`aria-labelledby` robusto no template ou após render com teste a11y. |
| UI-03 | Média | Existem só uma regra global `:focus-visible` e pouco detalhe por componente complexo. | CSS tem `:focus-visible`, mas componentes como cards, drawer, palette e tabs merecem revisão visual individual. | Foco pode ser pouco perceptível ou inconsistente em componentes densos. | Criar matriz de foco por componente e testes visuais de teclado. |
| UI-04 | Média | UI depende fortemente de cor para estados (`volt`, `cyan`, `amber`, `risk`). | Badges, barras, dots e status usam cor como sinal dominante. | Usuários daltônicos podem perder significado. | Complementar cor com texto, ícones, padrões e labels persistentes. |
| UI-05 | Média | Charts SVG são visualmente ricos, mas podem ser pouco acessíveis a leitores de tela. | SVGs têm `role=img`/`aria-label`, mas dados detalhados ficam visualmente codificados. | Usuário assistivo não obtém tabela equivalente. | Adicionar tabela/resumo textual para cada gráfico. |
| UI-06 | Média | Densidade visual alta em catálogo/resultados pode prejudicar scanning. | Cards concentram nome, descrição, tags, host, popularidade, latência e sucesso. | Usuário pode demorar para comparar APIs. | Criar modo compacto/detalhado e ordenação/facetas por objetivo. |
| UI-07 | Média | Responsividade existe, mas não há evidência de teste em dispositivos reais. | CSS tem media queries, mas sem Playwright visual/mobile snapshots. | Quebras visuais podem passar sem detecção. | Adicionar snapshots mobile/tablet/desktop e checklist visual. |
| UI-08 | Baixa | Tokens existem, mas não há documentação de design system. | Variáveis CSS estão no stylesheet, sem catálogo visual. | Evolução visual pode ficar inconsistente. | Documentar tokens, escala tipográfica, espaçamento, estados e componentes. |
| UI-09 | Baixa | Animações respeitam reduced motion, mas microinterações ainda precisam auditoria perceptual. | Há `prefers-reduced-motion`; charts e barras têm animações. | Pode haver distração/cansaço visual. | Revisar duração, intensidade e opção explícita de reduzir animações. |

---

## 4. Achados já corrigidos nesta auditoria

| ID | Correção | Arquivo |
|---|---|---|
| FIX-01 | `package-lock.json` foi realinhado para versão `3.2.0` e licença `MIT`, acompanhando `package.json`. | `package-lock.json` |
| FIX-02 | `.env.example` usava `LOG_LEVEL=normal`, valor inválido para `config.LOG_LEVEL`; foi ajustado para `LOG_LEVEL=info`. | `.env.example` |
| FIX-03 | `UPSTREAM_TIMEOUT_MS` passou a ser respeitado pelo invoker real. | `src/invoker.js` |
| FIX-04 | Catálogo passou por validação de shape, ids e hosts no boot/cache inicial. | `src/catalog.js` |
| FIX-05 | Modo real ganhou gate de autorização por `REAL_INVOKE_TOKEN`/`X-Invoke-Token`/Bearer e bloqueio configurável de `rapidApiKey` enviada pelo cliente. | `server.js`, `src/config.js` |
| FIX-06 | Métricas ganharam proteção opcional por `METRICS_TOKEN`. | `server.js`, `src/config.js` |
| FIX-07 | Configuração insegura `CORS_ORIGIN=*` com `CORS_CREDENTIALS=true` passou a falhar no boot. | `src/config.js` |
| FIX-08 | `/api/log-error` passou a validar payload vazio e truncar campos antes do log. | `server.js` |
| FIX-09 | `X-Request-ID` do cliente passou a aceitar apenas caracteres seguros. | `src/middleware/request-id.js` |
| FIX-10 | Tooltip SVG do scatter passou a escapar nome da API e o template do card recebeu nome acessível inicial. | `public/js/dashboard.js`, `public/index.html` |
| FIX-11 | CI passou a executar `npm run integration` e uma etapa SCA `npm audit` não bloqueante. | `.github/workflows/ci.yml` |
| FIX-12 | Foi adicionada suíte `npm run qa:100x` com 60 checks de contrato, segurança, dados, UX/UI/A11y, documentação e probes dinâmicos. | `scripts/qa-100x.mjs`, `package.json`, `.github/workflows/ci.yml` |
| FIX-13 | Documentação operacional foi atualizada para remover recomendação de chave no browser e incluir `REAL_INVOKE_TOKEN`, `METRICS_TOKEN` e `ALLOW_CLIENT_RAPIDAPI_KEY=false`. | `README.md`, `OPERATIONS.md` |
| FIX-14 | `confirmDialog` deixou de usar `innerHTML` para conteúdo textual, reduzindo superfície de XSS futuro. | `public/js/app.js` |

---

## 5. Priorização recomendada

### P0 — Antes de expor modo real publicamente

1. Implementar autenticação/autorização para `/api/invoke` e `/api/invoke/batch`.
2. Bloquear uso público da chave server-side sem quota por usuário.
3. Exibir quota/custo/ambiente/status de risco antes de qualquer chamada real.
4. Diferenciar visualmente API apenas catalogada, mock validada e real validada.
5. Corrigir `UPSTREAM_TIMEOUT_MS` para ser respeitado.
6. Restringir CORS em produção e falhar configuração insegura.
7. Validar catálogo no boot com `validateApiShape()`.

### P1 — Antes de escalar produção

1. Rate limit centralizado em Redis/Valkey/API Gateway.
2. Metrics endpoint protegido por rede/auth.
3. CI com `npm run integration`, validação OpenAPI, axe/Lighthouse, contraste e SCA.
4. Circuit breaker e observabilidade do upstream RapidAPI.
5. Modelo de endpoints reais por API, com método, path, query/body e exemplos testados.
6. Testes visuais mobile/tablet/desktop e matriz de foco por componente.

### P2 — Qualidade contínua

1. Playwright/E2E e a11y automatizado.
2. Dashboard com escala mais fiel para outliers e tabelas textuais equivalentes.
3. Normalização editorial do catálogo.
4. Documentação de design tokens, estados UI e critérios de uso de cor.
5. Revalidação periódica das 302 APIs com relatório de freshness.
6. Pinning de imagens Docker por digest.

---

## 6. Matriz de risco consolidada

| Área | Risco dominante | Severidade | Probabilidade | Prioridade |
|---|---|---:|---:|---:|
| Segurança | Abuso da chave RapidAPI do servidor | Crítica | Alta | P0 |
| Backend | Timeout configurável ignorado | Alta | Alta | P0 |
| Dados | Catálogo não validado no boot | Alta | Média | P0 |
| Operações | Rate limit não distribuído | Alta | Média | P1 |
| QA | CI sem integration test | Alta | Média | P1 |
| Frontend | `innerHTML` + dados futuros não confiáveis | Média | Média | P1 |
| UX | Modo real sem quota/custo/status suficientemente claros | Alta | Alta | P0 |
| UI/A11y | Sem validação automatizada de contraste/acessibilidade | Alta | Média | P1 |
| Supply chain | Audit/outdated bloqueados | Alta | Desconhecida | P1 |
| Produto | Invocação real genérica demais | Alta | Alta | P0 |

---

## 7. Checklist de remediação sugerido

- [ ] Adicionar autenticação e autorização.
- [ ] Adicionar quotas por usuário/projeto.
- [ ] Respeitar `config.UPSTREAM_TIMEOUT_MS` no invoker.
- [ ] Validar todos os itens do catálogo no boot.
- [ ] Adicionar whitelist/schema de endpoints por API.
- [ ] Restringir CORS por ambiente.
- [ ] Proteger `/api/metrics`.
- [ ] Adicionar `npm run integration` ao CI.
- [ ] Adicionar validação OpenAPI no CI.
- [ ] Adicionar SCA (`npm audit`/Dependabot/Renovate) em ambiente com registry liberado.
- [ ] Substituir usos arriscados de `innerHTML` ou garantir escape obrigatório.
- [ ] Escapar `p.name` no SVG scatter.
- [ ] Adicionar Playwright/E2E e a11y.
- [ ] Adicionar axe/Lighthouse e validação automatizada de contraste.
- [ ] Documentar design tokens e critérios UI por componente.
- [ ] Exibir quota/custo/ambiente antes de chamadas reais.
- [ ] Criar status de validação real por API no catálogo.
- [ ] Pin Docker base image por digest.
- [ ] Criar relatório periódico de freshness das APIs RapidAPI.

---

## 8. Double-check 10x — achados adicionais de rigor

A segunda rodada de auditoria não alterou a conclusão de que a suíte automatizada passa, mas aumentou a severidade percebida de alguns riscos por olhar a solução como produto operável, interface de decisão e ferramenta que pode consumir dinheiro real via RapidAPI. O double-check adicionou três lentes que não estavam suficientemente profundas na primeira versão: **UX research**, **UI design** e **acessibilidade prática**.

### 8.1 Achados reforçados pelo double-check

| Tema | Reforço do double-check | Consequência prática |
|---|---|---|
| Modo real | A UI permite configurar chave e executar chamadas reais, mas sem quota/saldo/orçamento visível. | Risco de custo e surpresa operacional aumenta. |
| Catálogo | O mesmo número “302” aparece como força de produto, mas mistura APIs apenas catalogadas com APIs efetivamente úteis em modo real. | Risco de expectativa incorreta para stakeholders. |
| A11y | Há bons fundamentos (`aria`, dialogs, focus, reduced motion), mas falta axe/Playwright e validação de contraste. | Não dá para declarar conformidade WCAG. |
| UI | Visual premium/neon pode ser forte para branding, porém precisa medição de contraste e alternativa não dependente de cor. | Risco de legibilidade em cenários reais. |
| Segurança/UX | O usuário pode inserir chave RapidAPI no browser. | Mesmo com password input, a superfície de exposição aumenta. |

### 8.2 Critérios objetivos adicionados ao aceite

- Lighthouse/axe sem violações críticas ou sérias.
- Contraste mínimo WCAG AA nos estados normal, hover, focus, disabled, success, warning e error.
- Playwright cobrindo: busca, filtros, seleção, execução mock, modal de confirmação real, drawer, command palette, teclado e mobile.
- Tabela textual alternativa para cada gráfico do dashboard.
- Status explícito por API: `catalogada`, `mock validado`, `real validado`, `real pendente`, `real falhou`.
- Quota/custo/ambiente visível antes de qualquer chamada real.

---

## 9. Conclusão

A solução é uma boa base para catálogo, demonstração, QA mock e operação inicial controlada. Para produção real, os riscos mais importantes não são de sintaxe ou falha imediata — a suíte passa — mas de **governança de chave/custo**, **segurança de exposição do proxy**, **fidelidade do modo real**, **qualidade contínua do catálogo** e **controles operacionais distribuídos**.

A recomendação é tratar o modo mock como pronto para uso interno/demonstração e tratar o modo real como **beta controlado** até que os itens P0 sejam resolvidos.
