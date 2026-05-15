// tests/logger.test.mjs
// Garante que o logger não vaza credenciais/tokens sensíveis.

import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.LOG_FORMAT = 'json';
process.env.LOG_LEVEL = 'info';

const { log } = await import('../src/logger.js');

test('logger redige rapidApiKey, Authorization, cookies e tokens aninhados', () => {
  const original = console.log;
  const lines = [];
  console.log = (line) => lines.push(String(line));
  try {
    log.info({
      msg: 'redaction-test',
      rapidApiKey: 'rapid-secret',
      authorization: 'Bearer invoke-secret',
      cookie: 'sid=session-secret',
      nested: {
        'x-rapidapi-key': 'nested-rapid-secret',
        'x-invoke-token': 'nested-invoke-secret',
        'x-metrics-token': 'nested-metrics-secret',
      },
    });
  } finally {
    console.log = original;
  }

  assert.equal(lines.length, 1);
  const payload = JSON.parse(lines[0]);
  assert.equal(payload.rapidApiKey, '[REDACTED]');
  assert.equal(payload.authorization, '[REDACTED]');
  assert.equal(payload.cookie, '[REDACTED]');
  assert.equal(payload.nested['x-rapidapi-key'], '[REDACTED]');
  assert.equal(payload.nested['x-invoke-token'], '[REDACTED]');
  assert.equal(payload.nested['x-metrics-token'], '[REDACTED]');
  assert.equal(lines[0].includes('rapid-secret'), false);
  assert.equal(lines[0].includes('invoke-secret'), false);
  assert.equal(lines[0].includes('metrics-secret'), false);
  assert.equal(lines[0].includes('session-secret'), false);
});
