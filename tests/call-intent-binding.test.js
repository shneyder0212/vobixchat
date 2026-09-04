'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const intent = require('../core/call-intent');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('identificadores de llamada tienen un formato acotado', () => {
  assert.equal(intent.normalizeCallId('call_123456'), 'call_123456');
  assert.equal(intent.normalizeCallId('x'), null);
  assert.equal(intent.normalizeCallId('../invalid'), null);
});

test('una identidad coincide solo con creador, conversación y tipo', () => {
  const call = { callerId:'u1', conversationId:'c1', type:'video' };
  assert.equal(intent.matchesCallIntent(call, { ...call }), true);
  assert.equal(intent.matchesCallIntent(call, { ...call, conversationId:'c2' }), false);
  assert.equal(intent.matchesCallIntent(call, { ...call, type:'audio' }), false);
});

test('servidor rechaza colisiones antes de crear o emitir', () => {
  const server = read('server.js');
  const offer = server.slice(server.indexOf("socket.on('call:offer'"), server.indexOf("socket.on('call:answer'"));
  assert.match(offer, /normalizeCallId/);
  assert.match(offer, /matchesCallIntent/);
  assert.match(offer, /call_id_conflict/);
  assert.ok(offer.indexOf('call_id_conflict') < offer.indexOf("emit('call:offer'"));
});

test('la capa 127 está registrada', () => {
  assert.match(read('core/vobix-layers.js'), /id:'127'.*Identidad de Llamada Vinculada/);
});