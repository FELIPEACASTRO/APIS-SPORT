#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Exemplo de chamada às APIs de bets do RapidAPI usando cURL.
#
# Substitua SUA_CHAVE_AQUI pela sua chave do RapidAPI.
# Cada bloco abaixo invoca uma API distinta — escolha conforme a necessidade.
# ---------------------------------------------------------------------------

RAPIDAPI_KEY="SUA_CHAVE_AQUI"

# ---------- 1) Pinnacle Odds API (id 23) ----------
HOST="pinnacle-odds-api.p.rapidapi.com"
curl --silent \
  --url "https://${HOST}/v1/sports" \
  --header "X-RapidAPI-Key: ${RAPIDAPI_KEY}" \
  --header "X-RapidAPI-Host: ${HOST}"

# ---------- 2) Bet365 API Inplay (id 14) ----------
HOST="bet365-api-inplay.p.rapidapi.com"
curl --silent \
  --url "https://${HOST}/bet365/inplay" \
  --header "X-RapidAPI-Key: ${RAPIDAPI_KEY}" \
  --header "X-RapidAPI-Host: ${HOST}"

# ---------- 3) OddsPapi — mais de 300 casas de apostas (id 4) ----------
HOST="odds-api1.p.rapidapi.com"
curl --silent \
  --url "https://${HOST}/get-sports" \
  --header "X-RapidAPI-Key: ${RAPIDAPI_KEY}" \
  --header "X-RapidAPI-Host: ${HOST}"

# ---------- 4) Live Sports Odds (theoddsapi) (id 20) ----------
HOST="live-sports-odds.p.rapidapi.com"
curl --silent \
  --url "https://${HOST}/v4/sports/upcoming/odds?regions=us&markets=h2h" \
  --header "X-RapidAPI-Key: ${RAPIDAPI_KEY}" \
  --header "X-RapidAPI-Host: ${HOST}"

# ---------- 5) Football Prediction (boggio) (id 7) ----------
HOST="football-prediction.p.rapidapi.com"
curl --silent \
  --url "https://${HOST}/api/v2/predictions?market=classic&iso_date=$(date +%F)" \
  --header "X-RapidAPI-Key: ${RAPIDAPI_KEY}" \
  --header "X-RapidAPI-Host: ${HOST}"
