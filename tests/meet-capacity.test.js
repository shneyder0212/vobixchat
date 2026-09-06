'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const database = fs.readFileSync(path.join(__dirname, '..', 'database', 'db.js'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('el servidor separa el cupo de sala de la capacidad empresarial verificada', () => {
  assert.match(server, /designedParticipants:INTERACTIVE_ROOM_MAX_PARTICIPANTS/);
  assert.match(server, /designedConcurrentConnections:DESIGNED_CONCURRENT_CONNECTIONS/);
  assert.match(server, /enterpriseContractConfirmed:capacity\.enterpriseContractConfirmed/);
  assert.match(server, /capacityVerified:capacity\.capacityVerified/);
  assert.match(server, /operational:capacity\.operational/);
});

test('Socket.IO evita compresión costosa y recupera desconexiones breves', () => {
  assert.match(server, /perMessageDeflate: false/);
  assert.match(server, /connectionStateRecovery/);
  assert.match(server, /maxDisconnectionDuration: 2 \* 60 \* 1000/);
});

test('HTTP usa tiempos seguros y reutiliza conexiones', () => {
  assert.match(server, /server\.keepAliveTimeout = 65000/);
  assert.match(server, /server\.headersTimeout = 70000/);
  assert.match(server, /server\.requestTimeout = 30000/);
});

test('PostgreSQL usa un pool acotado y configurable para las ráfagas', () => {
  assert.match(database, /DATABASE_POOL_MAX, 6, 2, 8/);
  assert.match(database, /DATABASE_POOL_MIN, 0, 0, 2/);
  assert.match(database, /maxUses: 7500/);
});
