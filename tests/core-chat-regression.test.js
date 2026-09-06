'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'chat.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');

test('notas de voz no mezclan el sello en una fila horizontal', () => {
  assert.match(html, /\.voiceMessage\s*\{[\s\S]{0,500}display:\s*grid/);
  assert.match(html, /\.voiceMessage > \.messageOriginSeal[\s\S]{0,220}grid-column:\s*1 \/ -1/);
  assert.match(html, /row\.className = mine \? 'messageRow mine' : 'messageRow theirs'/);
});

test('las fotos se abren en visor contenido y no navegan a la imagen cruda', () => {
  assert.match(html, /\.photoViewer\s*\{[\s\S]{0,350}contain:\s*layout paint size/);
  assert.match(html, /\.photoViewerStage\s*\{[\s\S]{0,250}overflow:\s*hidden/);
  assert.match(html, /const link = document\.createElement\('button'\);[\s\S]{0,180}chatMediaButton/);
  assert.match(html, /max-width:\s*calc\(100vw - 16px\)/);
  assert.match(html, /photoPointers/);
  assert.match(html, /pointermove/);
  assert.match(html, /setPhotoViewerZoom\(app\.photoZoom \* \(distance \/ photoGestureDistance\)\)/);
  assert.match(html, /photoPanX \+=/);
});

test('una notificación entrante reconcilia la sala y su historial persistido', () => {
  assert.match(html, /function scheduleIncomingHistoryRefresh/);
  assert.match(html, /function recoverIncomingConversation/);
  assert.match(html, /scheduleIncomingHistoryRefresh\(incomingId \|\| activeId\)/);
  assert.match(html, /await selectConversation\(conversation, getConversationPeer\(conversation\)\)/);
});

test('las ofertas de llamada se escuchan antes de terminar el handshake', () => {
  const creation = html.slice(html.indexOf('app.socket =\n          window.io'), html.indexOf('/* ===================================================\n         CONECTADO'));
  assert.match(creation, /attachCallSocketEvents\(\)/);
  assert.match(html, /showMediaPermissionOnboarding\(true\)/);
});

test('Push recupera mensajes y llamadas cuando Android suspende Socket.IO', () => {
  assert.match(serviceWorker, /type: 'VOBIX_PUSH_SIGNAL'/);
  assert.match(serviceWorker, /client\.postMessage/);
  assert.match(html, /signal\.type !== 'VOBIX_PUSH_SIGNAL'/);
  assert.match(html, /scheduleIncomingHistoryRefresh\(id\)/);
  assert.match(html, /recoverPendingIncomingCall\(\)/);
  assert.match(html, /signal\.pushType === 'message'[\s\S]{0,100}playIncomingMessageAlertOnce\(id\)/);
  assert.match(html, /function playIncomingMessageAlertOnce/);
});

test('Socket.IO usa inicio estable y reconexión ilimitada en móviles', () => {
  assert.match(html, /transports:\s*\[\s*'polling',\s*'websocket'/);
  assert.match(html, /tryAllTransports:\s*true/);
  assert.match(html, /reconnectionAttempts:\s*Infinity/);
  assert.match(html, /reconnectionDelayMax:\s*5000/);
  assert.match(html, /if \(!app\.socket\) await startSocket\(\)/);
  assert.match(html, /socketStartPromise/);
});

test('Chrome prepara sonido con cualquier interacción y conserva aviso del sistema visible', () => {
  assert.match(html, /document\.addEventListener\('pointerdown', unlockAudio/);
  assert.match(html, /document\.addEventListener\('touchstart', unlockAudio/);
  assert.doesNotMatch(serviceWorker, /if \(appVisible\) \{\s*return;\s*\}/);
  assert.match(serviceWorker, /await self\.registration\.showNotification\(title, options\)/);
});
