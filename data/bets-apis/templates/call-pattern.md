# Padrão de Chamada — RapidAPI Marketplace

Todas as 302 APIs de bets seguem o mesmo padrão de invocação no RapidAPI.

## 1. Cadastro e autenticação

1. Crie uma conta em https://rapidapi.com
2. Assine o plano da API (mesmo o tier `Freemium` exige cadastro)
3. Copie sua `X-RapidAPI-Key` do painel

## 2. Estrutura da requisição

```http
GET https://{rapidapi_host}/{endpoint}
Headers:
  X-RapidAPI-Key:  <SUA_CHAVE>
  X-RapidAPI-Host: {rapidapi_host}
```

### Como extrair `{rapidapi_host}` a partir da URL pública

A URL pública da API segue o padrão:

```
https://rapidapi.com/{provider}/api/{api-slug}
                                     └────┬────┘
                                          │
                                          ▼
                       {api-slug}.p.rapidapi.com
```

Exemplos:

| URL pública | rapidapi_host (X-RapidAPI-Host) |
|---|---|
| `rapidapi.com/tank01/api/tank01-mlb-live-in-game-real-time-statistics` | `tank01-mlb-live-in-game-real-time-statistics.p.rapidapi.com` |
| `rapidapi.com/therundown/api/therundown` | `therundown.p.rapidapi.com` |
| `rapidapi.com/DataMenu/api/pinnacle-odds-api` | `pinnacle-odds-api.p.rapidapi.com` |
| `rapidapi.com/b365api-b365api-default/api/betsapi2` | `betsapi2.p.rapidapi.com` |

> Cada API tem seus próprios endpoints. A documentação específica está no botão **Endpoints** da página da API no RapidAPI.

## 3. Exemplo mínimo (cURL)

```bash
curl --request GET \
  --url "https://pinnacle-odds-api.p.rapidapi.com/v1/sports" \
  --header "X-RapidAPI-Key: SUA_CHAVE_AQUI" \
  --header "X-RapidAPI-Host: pinnacle-odds-api.p.rapidapi.com"
```

## 4. Códigos de resposta comuns

| Código | Significado | Ação |
|---|---|---|
| 200 | OK | Processar `response.json()` |
| 401 | Sem autenticação / chave inválida | Verifique `X-RapidAPI-Key` |
| 403 | Host header errado | Verifique `X-RapidAPI-Host` bate com o endpoint |
| 429 | Excedeu o limite do plano | Upgrade ou aguarde a janela de reset |
| 5xx | Erro do provedor | Retry com backoff, considere fallback |

## 5. Limites e custos

- Cada API tem seu próprio limite por plano (Basic/Pro/Ultra/Mega)
- O `Freemium` geralmente dá 100-500 requisições/mês grátis
- O contador é global da sua conta (uma chave para todas as APIs)
- A latência média citada no dossiê **não inclui** o overhead da rede do RapidAPI

## 6. Aviso sobre APIs descontinuadas

Algumas APIs no dossiê marcam como "DESCONTINUADA" e redirecionam para versões novas. Verifique sempre a página do RapidAPI antes de usar.

APIs descontinuadas conhecidas:
- `OddsNotifier API (Bet365 & Pinnacle)` (id 179) → migrou para `Odds-API.io` (id 186)
- `OddsNotifier API` (id 200) → mesma migração
