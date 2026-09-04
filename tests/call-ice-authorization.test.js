'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function iceHandler() {
  const server = read('server.js');
  return server.slice(server.indexOf("socket.on('call:ice'"), server.indexOf("socket.on('call:resume'"));
}

test('ICE exige identificador seguro y llamada existente', () => {
  const ice = iceHandler();
  assert.match(ice, /normalizeCallId\(payload\.callId\)/);
  assert.match(ice, /callId \? activeCalls\.get\(callId\) : null/);
});

test('solo participantes o invitados pueden enviar ICE', () => {
  const ice = iceHandler();
  assert.match(ice, /call\.participants\.has\(currentUserKey\) \|\| call\.invited\.has\(currentUserKey\)/);
  assert.match(ice, /call_access_denied/);
  assert.ok(ice.indexOf('if (!allowed') < ice.indexOf('call.pendingIce'));
});

test('candidatos excesivos se rechazan antes de guardar', () => {
  const ice = iceHandler();
  assert.match(ice, /Buffer\.byteLength\(JSON\.stringify\(candidate\), 'utf8'\)/);
  assert.match(ice, /candidateSize > 8192/);
  assert.match(ice, /ice_candidate_too_large/);
});

test('la capa 128 está registrada', () => {
  assert.match(read('core/vobix-layers.js'), /id:'128'.*Canal ICE Autorizado y Acotado/);
});