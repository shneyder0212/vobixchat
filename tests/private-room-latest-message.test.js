'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'chat.html'), 'utf8');

test('tocar un usuario abre su sala 1x1 preparada para escribir', () => {
  assert.match(html, /selectConversation\([\s\S]{0,100}conversation,[\s\S]{0,80}peer,[\s\S]{0,80}\{ focusComposer: true \}/);
  assert.match(html, /options\.focusComposer && elements\.messageInput/);
  assert.match(html, /elements\.messageInput\.focus\(\{ preventScroll: true \}\)/);
});

test('el final del chat se conserva mientras terminan de cargar fotos y audios', () => {
  assert.match(html, /lastMessage\?\.scrollIntoView\?\.\(\{ block: 'end'/);
  assert.match(html, /latestMessagesResizeObserver = new ResizeObserver\(moveToLatest\)/);
  assert.match(html, /latestMessagesResizeObserver\.observe\(elements\.messages\)/);
  assert.match(html, /elements\.messages\.scrollTop = elements\.messages\.scrollHeight/);
});

test('la Capa 181 registra la apertura inmediata al último mensaje', () => {
  const layers = fs.readFileSync(path.join(root, 'core', 'vobix-layers.js'), 'utf8');
  assert.match(layers, /id:'181'.*Sala 1x1 Abierta en el Último Mensaje/);
});
