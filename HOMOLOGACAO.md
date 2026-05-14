# Roteiro de Homologação — APIS // SPORT v2.1

> Documento que o cliente segue para validar a entrega e formalizar o aceite.

**Versão da entrega:** 2.1.0
**Data:** 12/05/2026
**Branch:** `claude/clever-torvalds-bed735`
**Escopo:** Plataforma web para consultar e invocar as 302 APIs de apostas esportivas mapeadas do RapidAPI.

---

## 1. Pré-requisitos

| Item | Mínimo | Como verificar |
|---|---|---|
| Node.js | 20.0+ | `node --version` |
| npm | 9+ | `npm --version` |
| Sistema | Windows / macOS / Linux | Qualquer um |
| Navegador | Chrome 110+, Firefox 110+, Edge 110+, Safari 16+ | — |
| Internet | Opcional (apenas para modo real) | `ping rapidapi.com` |

---

## 2. Instalação

```bash
git clone https://github.com/FELIPEACASTRO/APIS-SPORT.git
cd APIS-SPORT
git checkout claude/clever-torvalds-bed735
npm install
cp .env.example .env       # ajuste conforme necessário
```

**Critério de aceite:** `npm install` termina sem erros e cria o `node_modules/`.

---

## 3. Pipeline automatizado de homologação

Execute o comando único que cobre tudo:

```bash
npm run homolog
```

**O comando executa:**

1. `npm test` → bateria de **32 testes unitários** (`node --test`)
2. `npm run qa` → relatório executivo `302/302 OK`
3. `npm run smoke` → **19 cenários end-to-end** com servidor real
4. Exibe versão final + Node + timestamp

**Saída esperada (parcial):**

```
# tests 32 · pass 32 · fail 0

  ✔ shape           302 APIs · 0 duplicatas · 0 shape errors
  ✔ distribution    subcategoria e preço batem com o dossiê
  ✔ mock-302        302/302 OK · 0.01ms média/chamada
  ALL CHECKS PASSED

  ✔ GET /api/health responde 200 com catalog_total=302
  ✔ GET /api/version expõe build info
  ✔ GET /api/catalog retorna 302 itens
  ✔ GET /api/catalog?q=pinnacle filtra subset
  ✔ POST /api/invoke mock retorna ok=true
  ✔ POST /api/invoke real sem chave → 502
  ✔ POST /api/invoke/batch (10 chamadas mock) → 10/10 ok
  ✔ POST /api/invoke/batch > 50 itens → 413
  ✔ GET / serve o HTML da SPA (200, >20kB)
  ✔ GET /styles.css 200
  ✔ GET /js/app.js 200
  ✔ GET /rota/inexistente cai no SPA fallback (200)
  ✔ GET /api/inexistente NÃO cai no fallback (404)
  ✔ Security headers presentes em /api/health
  ✔ POST /api/invoke sem apiId → 400
  HOMOLOGAÇÃO: ACEITÁVEL
  19 / 19 cenários ✓
```

**Critério de aceite global:** o comando termina com **exit code 0** (sem `npm ERR!`).

---

## 4. Checklist funcional (UAT manual)

Inicie o servidor: `npm start` → abra http://localhost:3000

Marque cada item conforme valida no navegador:

### 4.1 Visual / Identidade

| # | Critério | Esperado | ☐ |
|---|---|---|---|
| 4.1.1 | A página carrega sem erros no console | DevTools › Console sem erros vermelhos | ☐ |
| 4.1.2 | Tipografia editorial (Fraunces + Newsreader + JetBrains Mono) | Título "APIS // SPORT" em serif moderna | ☐ |
| 4.1.3 | Fundo off-black com grain texture sutil | Ruído fino visível em zoom 200% | ☐ |
| 4.1.4 | Status no topo direito mostra "pronto" + ponto verde | — | ☐ |
| 4.1.5 | Contadores exibem 302 / 244 / 43 / 15 | Total / Freemium / Gratuito / Pago | ☐ |

### 4.2 Catálogo & Filtros

| # | Critério | Esperado | ☐ |
|---|---|---|---|
| 4.2.1 | Lista carrega 302 APIs | Meta: "Mostrando **302** de **302** APIs" | ☐ |
| 4.2.2 | Digitar "pinnacle" reduz a lista | "Mostrando 13 de 302" (ou similar) | ☐ |
| 4.2.3 | Filtro de subcategoria "Odds" filtra para 83 | — | ☐ |
| 4.2.4 | Filtro de preço "Freemium" reduz para 244 | — | ☐ |
| 4.2.5 | Chips de filtros ativos aparecem e são removíveis | Chips abaixo dos selects | ☐ |
| 4.2.6 | Botão "Selecionar tudo visível" marca todos | Tray atualiza contador | ☐ |
| 4.2.7 | Limpar filtros volta para 302 | — | ☐ |

### 4.3 Presets

| # | Critério | Esperado | ☐ |
|---|---|---|---|
| 4.3.1 | Clicar "Top 10 mais populares" filtra + seleciona 10 | Toast confirma | ☐ |
| 4.3.2 | Clicar "Pinnacle (5)" filtra para Pinnacle-relacionadas | — | ☐ |
| 4.3.3 | Clicar "Bet365 (8)" filtra para Bet365 | — | ☐ |
| 4.3.4 | Clicar "Limpar tudo" zera filtros e seleção | Toast "Tudo limpo" | ☐ |

### 4.4 Seleção & Execução (Mock)

| # | Critério | Esperado | ☐ |
|---|---|---|---|
| 4.4.1 | Clicar no checkbox seleciona a API | Borda esquerda volt-lime aparece | ☐ |
| 4.4.2 | Tray no rodapé mostra chip com `#ID Nome` | Contador atualiza | ☐ |
| 4.4.3 | Botão "Executar" habilita ao haver ≥1 selecionada | Volt-lime sólido | ☐ |
| 4.4.4 | Clicar "Executar" troca para tab "Sessão" | Mostra resultados | ☐ |
| 4.4.5 | Cada resultado mostra HTTP 200 + tag "mock" | Cards verdes | ☐ |
| 4.4.6 | Cards têm 3 abas: tree / json / raw | Funcionam ao clicar | ☐ |
| 4.4.7 | Botão "copiar" cola JSON no clipboard | Toast confirma | ☐ |
| 4.4.8 | Botão "Exportar JSON" baixa arquivo | `apis-sport-results-XXX.json` | ☐ |

### 4.5 Modo Real (somente se houver `RAPIDAPI_KEY`)

| # | Critério | Esperado | ☐ |
|---|---|---|---|
| 4.5.1 | Selecionar radio "Real" mostra campo de chave | Campo aparece | ☐ |
| 4.5.2 | Sem chave, clicar Executar mostra warning | Toast "Modo real requer chave" | ☐ |
| 4.5.3 | Com chave válida, chamada real retorna 200 | Resposta JSON do RapidAPI | ☐ |
| 4.5.4 | Card mostra tag "real" em volt-lime | — | ☐ |

### 4.6 Atalhos de teclado

| # | Atalho | Esperado | ☐ |
|---|---|---|---|
| 4.6.1 | `⌘K` / `Ctrl+K` | Command palette abre | ☐ |
| 4.6.2 | `/` (fora de campo) | Foca a busca do catálogo | ☐ |
| 4.6.3 | `⌘↵` / `Ctrl+Enter` | Executa as APIs selecionadas | ☐ |
| 4.6.4 | `1` / `2` (fora de campo) | Alterna entre Catálogo/Sessão | ☐ |
| 4.6.5 | `?` | Abre modal de atalhos | ☐ |
| 4.6.6 | `Esc` | Fecha qualquer overlay | ☐ |

### 4.7 Drawer (detalhes da API)

| # | Critério | Esperado | ☐ |
|---|---|---|---|
| 4.7.1 | Clicar no nome de uma API abre drawer lateral | Slide-in da direita | ☐ |
| 4.7.2 | Drawer mostra subcat, preço, provedor, pop, latência, sucesso, host, descrição | — | ☐ |
| 4.7.3 | Botão "Copiar host" funciona | Toast confirma | ☐ |
| 4.7.4 | Botão "Selecionar" adiciona à tray | — | ☐ |
| 4.7.5 | Link "Abrir no RapidAPI ↗" abre nova aba | URL correta | ☐ |
| 4.7.6 | `Esc` ou clicar fora fecha o drawer | — | ☐ |

### 4.8 Responsivo / mobile

| # | Critério | Esperado | ☐ |
|---|---|---|---|
| 4.8.1 | DevTools › Toolbar › iPhone SE: layout não quebra | Stack vertical | ☐ |
| 4.8.2 | Tabs continuam acessíveis | Centralizadas | ☐ |
| 4.8.3 | Tray no rodapé continua com botão Executar | Chips ocultos em mobile | ☐ |

### 4.9 Segurança & operação

| # | Critério | Como verificar | ☐ |
|---|---|---|---|
| 4.9.1 | Headers de segurança presentes | `curl -I http://localhost:3000/api/health` mostra `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` | ☐ |
| 4.9.2 | `X-Powered-By` ausente | Mesmo curl não exibe esse header | ☐ |
| 4.9.3 | Logs no terminal mostram cada request | `2026-05-12T… GET 200 12ms /api/health` | ☐ |
| 4.9.4 | Chave RapidAPI não aparece em logs | Mesmo após chamada real | ☐ |
| 4.9.5 | Servidor reinicia limpo (`Ctrl+C` + `npm start`) | Sem warnings | ☐ |

---

## 5. Caveats explicitamente aceitos

Os pontos abaixo **não são bugs** — são parte do escopo aprovado:

1. **35% das APIs do catálogo (~105) têm `popularity=0`, `latency=0`, `success=0`.** Isso reflete o dossiê fonte (11/05/2026): são listings que ainda não acumularam telemetria no RapidAPI. A UI sinaliza visualmente com badge "sem dados" para facilitar triagem.

2. **APIs duplicadas em nome** (8xbet ×4, "Football Odds" ×2, "Sport Odds" ×2) são listings independentes do RapidAPI com hosts diferentes; preservadas por fidelidade.

3. **3 APIs sem `provider`** (#91, #185, #275) refletem o dossiê fonte.

4. **`npm run qa` mock-302 valida o engine de invocação**, não o RapidAPI ao vivo. Para validar chamadas reais, exporte `RAPIDAPI_KEY` e rode `npm run qa -- --real` (consome cota da sua conta).

5. **8 APIs com latência > 30s no dossiê** (até 133s) são casos onde o crawler do RapidAPI capturou timeouts — esperamos comportamento similar em produção para essas específicas.

---

## 6. Aceite formal

| Critério global | Status |
|---|---|
| `npm run homolog` retorna exit code 0 | ☐ |
| Checklist 4.1 a 4.9 com ≥ 90% dos itens marcados | ☐ |
| Caveats da seção 5 aceitos | ☐ |
| Nenhum erro vermelho no DevTools › Console | ☐ |

### Assinaturas

| Papel | Nome | Data | Assinatura |
|---|---|---|---|
| **Cliente / Product Owner** | _____________ | _____ | _____________ |
| **Tech Lead** | _____________ | _____ | _____________ |
| **Responsável pela entrega** | _____________ | _____ | _____________ |

---

## 7. Suporte pós-homologação

- **Bugs encontrados:** abrir issue em `https://github.com/FELIPEACASTRO/APIS-SPORT/issues` com label `bug`
- **Sugestões de melhoria:** issue com label `enhancement`
- **Re-rodar a homologação a qualquer momento:** `npm run homolog`
- **Output JSON para CI/CD:** `npm run smoke:json` e `npm run qa:json`
