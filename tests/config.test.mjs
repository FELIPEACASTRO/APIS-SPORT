// tests/config.test.mjs
// Valida hardening de configuração antes do boot do servidor.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function importConfig(env) {
  return spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import('./src/config.js').then(() => console.log('OK')).catch((err) => { console.error(err.message); process.exit(1); })",
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      encoding: 'utf8',
    },
  );
}

test('config rejeita CORS_CREDENTIALS=true com CORS_ORIGIN=*', () => {
  const r = importConfig({ NODE_ENV: 'test', CORS_ORIGIN: '*', CORS_CREDENTIALS: 'true' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /CORS_CREDENTIALS=true/);
});

test('config exige REAL_INVOKE_TOKEN em production com RAPIDAPI_KEY server-side', () => {
  const r = importConfig({
    NODE_ENV: 'production',
    RAPIDAPI_KEY: 'server-key',
    REQUIRE_REAL_AUTH: 'true',
    REAL_INVOKE_TOKEN: '',
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /REAL_INVOKE_TOKEN/);
});

test('config aceita production com RAPIDAPI_KEY quando REAL_INVOKE_TOKEN existe', () => {
  const r = importConfig({
    NODE_ENV: 'production',
    RAPIDAPI_KEY: 'server-key',
    REQUIRE_REAL_AUTH: 'true',
    REAL_INVOKE_TOKEN: 'invoke-token',
    CORS_ORIGIN: 'https://example.com',
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /OK/);
});
