// src/mock.js
// Gera respostas mock determinísticas — usadas quando a chave RapidAPI
// não está configurada OU quando o usuário escolhe modo MOCK na UI.
// Isso permite QA end-to-end sem queimar cota e sem dependência externa.

/**
 * Cria uma resposta mock plausível baseada no perfil da API.
 * @param {import('./catalog.js').BetApi} api
 * @param {string} endpoint
 */
export function mockResponseFor(api, endpoint = '/') {
  const sport = guessSport(api);
  const now = new Date().toISOString();

  if (api.subcategory.includes('Odds')) {
    return {
      _mock: true,
      _source: api.rapidapi_host,
      _endpoint: endpoint,
      _generated_at: now,
      sport,
      events: [
        {
          event_id: hashId(api.id, 1),
          home: 'Time A',
          away: 'Time B',
          start_time: futureIso(2),
          markets: {
            h2h: { home: 1.85, away: 2.05, draw: 3.4 },
            spread: { line: -1.5, home: 1.95, away: 1.95 },
            totals: { line: 2.5, over: 1.92, under: 1.88 },
          },
          bookmakers: ['pinnacle', 'bet365', 'betfair'],
        },
        {
          event_id: hashId(api.id, 2),
          home: 'Time C',
          away: 'Time D',
          start_time: futureIso(26),
          markets: {
            h2h: { home: 2.4, away: 1.65, draw: 3.2 },
          },
          bookmakers: ['pinnacle', 'bet365'],
        },
      ],
    };
  }

  if (api.subcategory.includes('Predicao')) {
    return {
      _mock: true,
      _source: api.rapidapi_host,
      _endpoint: endpoint,
      _generated_at: now,
      sport,
      predictions: [
        {
          match_id: hashId(api.id, 1),
          home: 'Time A',
          away: 'Time B',
          probabilities: { home: 0.48, draw: 0.27, away: 0.25 },
          predicted_outcome: 'HOME_WIN',
          confidence: 0.71,
          model: 'mock-poisson-v1',
        },
      ],
    };
  }

  if (api.subcategory.includes('Casas de Apostas')) {
    return {
      _mock: true,
      _source: api.rapidapi_host,
      _endpoint: endpoint,
      _generated_at: now,
      bookmakers: [
        { id: 'pinnacle', name: 'Pinnacle', country: 'CW', live: true },
        { id: 'bet365', name: 'Bet365', country: 'GI', live: true },
      ],
    };
  }

  // Dados de Apostas (default)
  return {
    _mock: true,
    _source: api.rapidapi_host,
    _endpoint: endpoint,
    _generated_at: now,
    sport,
    teams: [
      { id: hashId(api.id, 'a'), name: 'Time A', stats: { wins: 12, draws: 4, losses: 6 } },
      { id: hashId(api.id, 'b'), name: 'Time B', stats: { wins: 9, draws: 7, losses: 6 } },
    ],
  };
}

function guessSport(api) {
  const name = api.name.toLowerCase();
  if (/nba|basketball/.test(name)) return 'basketball';
  if (/nfl|american football/.test(name)) return 'american_football';
  if (/mlb|baseball/.test(name)) return 'baseball';
  if (/nhl|hockey/.test(name)) return 'ice_hockey';
  if (/tennis/.test(name)) return 'tennis';
  if (/cricket/.test(name)) return 'cricket';
  if (/rugby/.test(name)) return 'rugby';
  if (/horse/.test(name)) return 'horse_racing';
  if (/golf/.test(name)) return 'golf';
  if (/mma|ufc|boxing/.test(name)) return 'combat_sports';
  return 'soccer';
}

function hashId(...parts) {
  return 'mk_' + parts.join('_');
}

function futureIso(hoursAhead) {
  return new Date(Date.now() + hoursAhead * 3600_000).toISOString();
}
