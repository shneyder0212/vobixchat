'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'chat.html'),
  'utf8'
);

test('la recuperación del chat está centralizada', () => {
  assert.match(html, /function recoverChatConnection\(\)/);
  assert.match(html, /window\.addEventListener\(['"]online['"], recoverChatConnection\)/);
});

test('volver desde segundo plano reactiva el chat', () => {
  assert.match(html, /window\.addEventListener\(['"]pageshow['"]/);
  assert.match(html, /setTimeout\(recoverChatConnection, 100\)/);
  assert.match(html, /visibilityState !== ['"]visible['"]/);
});

test('la recuperación repone cola, sala y recibos', () => {
  assert.match(html, /flushQueuedMessages\(\)/);
  assert.match(html, /joinConversationRoom\(activeId\)/);
  assert.match(html, /syncConversationReceipts\(activeId\)/);
});
