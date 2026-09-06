'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'chat.html'), 'utf8');

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
