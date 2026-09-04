'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const database = fs.readFileSync(path.join(__dirname, '..', 'database', 'db.js'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('el servidor declara diseño Meet para 1000 sin confundirlo con verificación real', () => {
  assert.match(server, /designedParticipants:1000/);
  assert.match(server, /LIVEKIT_MAX_CONNECTIONS/);
  assert.match(server, /VOBIX_MEET_CAPACITY_VERIFIED/);
  assert.match(server, /configuredConnections >= 1000 && capacityVerified/);
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
  assert.match(database, /DATABASE_POOL_MAX, 20, 5, 50/);
  assert.match(database, /DATABASE_POOL_MIN, 2, 0, 10/);
  assert.match(database, /maxUses: 7500/);
});
