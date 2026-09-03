'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const serverPath = path.join(__dirname, '..', 'server.js');
const server = fs.readFileSync(serverPath, 'utf8');

test('health público conserva la comprobación de base de datos', () => {
  assert.match(server, /app\.get\(\s*['"]\/api\/health['"]/);
  assert.match(server, /database:\s*['"]connected['"]/);
  assert.match(server, /database:\s*['"]disconnected['"]/);
});

test('health identifica versión, commit y entorno sin secretos', () => {
  assert.match(server, /packageMetadata\.version/);
  assert.match(server, /process\.env\.RENDER_GIT_COMMIT/);
  assert.match(server, /\.slice\(0, 12\)/);
  assert.match(server, /process\.env\.RENDER/);
  assert.doesNotMatch(server, /release:\s*\{[^}]*API_KEY/s);
});

test('health impide respuestas antiguas almacenadas en caché', () => {
  assert.match(server, /['"]Cache-Control['"]\s*,\s*['"]no-store, max-age=0['"]/);
  assert.match(server, /uptimeSeconds:\s*Math\.floor\(process\.uptime\(\)\)/);
});

test('sonda de red es pública, mínima y no consulta la base de datos', () => {
  const probe = server.match(/app\.get\(['"]\/api\/network-probe['"][\s\S]*?\n\}\);/);
  assert.ok(probe, 'falta /api/network-probe');
  assert.match(probe[0], /status\(204\)\.end\(\)/);
  assert.match(probe[0], /no-store, max-age=0/);
  assert.doesNotMatch(probe[0], /database\.query|requireAuth/);
});
