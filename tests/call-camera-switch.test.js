'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('el cambio elige otra cámara física y tiene alternativas por orientación', () => {
  const html = read('public/chat.html');
  assert.match(html, /navigator\.mediaDevices\.enumerateDevices/);
  assert.match(html, /deviceId: \{ exact: target\.deviceId \}/);
  assert.match(html, /facingMode: \{ exact: nextFacingMode \}/);
  assert.match(html, /facingMode: \{ ideal: nextFacingMode \}/);
  assert.match(html, /oldVideoTrack\.stop\(\)/);
});

test('la pista nueva se envía a la llamada individual y a todos los participantes', () => {
  const html = read('public/chat.html');
  assert.match(html, /function activeCallConnections\(\)/);
  assert.match(html, /app\.peerConnection/);
  assert.match(html, /app\.groupPeerConnections/);
  assert.match(html, /Promise\.all\(senders\.map\(sender => sender\.replaceTrack\(track\)\)\)/);
});

test('si falla el cambio se restaura la cámara anterior y el botón responde', () => {
  const html = read('public/chat.html');
  assert.match(html, /restorePreviousCamera\(previousDeviceId, previousFacingMode\)/);
  assert.match(html, /Cambiando cámara…/);
  assert.match(html, /La cámara anterior fue restaurada/);
  assert.match(html, /removeAttribute\('aria-busy'\)/);
});

test('la Capa 179 registra el cambio de cámara', () => {
  assert.match(
    read('core/vobix-layers.js'),
    /id:'179'.*Cambio de Cámara Real y Recuperable.*status:'en_validacion'/
  );
});
