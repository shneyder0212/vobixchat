'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'chat.html'), 'utf8');

test('la sala activa recupera mensajes desde Push y al volver a VobixChat', () => {
  assert.match(html, /async function refreshActiveMessageRoom/);
  assert.match(html, /await loadMessages\(id\)/);
  assert.match(html, /window\.addEventListener\('focus', recoverMessagesWhenAppReturns\)/);
  assert.match(html, /signal\.conversationId \|\| signal\.conversation_id/);
  assert.match(html, /refreshActiveMessageRoom\(id\)/);
});

test('los emojis requieren un toque iniciado en su botón y se cierran fuera', () => {
  assert.match(html, /let emojiPointerArmed = false/);
  assert.match(html, /emojiButton\?\.addEventListener\('pointerdown'/);
  assert.match(html, /event\.detail !== 0 && !emojiPointerArmed/);
  assert.match(html, /event\.target\.closest\?\.\('#emojiButton, #emojiTray'\)/);
  assert.match(html, /emojiTray\?\.classList\.remove\('open'\)/);
});

test('la Capa 182 documenta el alcance sin cambiar llamadas', () => {
  const layers = fs.readFileSync(path.join(root, 'core', 'vobix-layers.js'), 'utf8');
  assert.match(layers, /id:'182'.*Mensajes en Sala y Emojis Bajo Toque Real/);
  assert.match(layers, /sin modificar la lógica de llamadas/);
});
