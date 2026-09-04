'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/chat.html'), 'utf8');

test('solo una respuesta acepta la llamada y registra cuándo ocurrió', () => {
  assert.match(server, /call\.answeredBy = currentUserKey/);
  assert.match(server, /call\.acceptedAt = call\.acceptedAt \|\| Date\.now\(\)/);
});

test('al contestar avisa a todos los dispositivos de la misma cuenta', () => {
  assert.match(server, /io\.to\(userRoom\(userId\)\)\.emit\('call:accepted-device'/);
  assert.match(server, /answeredSocketId:socket\.id/);
});

test('los otros dispositivos paran timbre, panel y temporizador', () => {
  const handler = html.slice(html.indexOf('function handleCallAcceptedOnDevice'), html.indexOf('/* =====================================================\n       RECIBIR ICE'));
  assert.match(handler, /stopAllCallSignals\(\)/);
  assert.match(handler, /clearCallTimeout\(\)/);
  assert.match(handler, /hideIncomingCallPanel\(\)/);
  assert.match(html, /'call:accepted-device',[\s\S]{0,100}handleCallAcceptedOnDevice/);
});
