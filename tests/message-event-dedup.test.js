'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'chat.html'),
  'utf8'
);

test('normaliza mensajes envueltos antes de procesar eventos compatibles', () => {
  assert.match(html, /function normalizeIncomingMessage\(payload\)/);
  assert.match(html, /const message = normalizeIncomingMessage\(payload\)/);
  assert.match(html, /payload\.conversationId/);
});

test('deduplica mensajes por conversación e identificador estable', () => {
  assert.match(html, /recentIncomingMessages: new Map\(\)/);
  assert.match(html, /function incomingMessageEventKey\(message\)/);
  assert.match(html, /function isDuplicateIncomingMessage\(message\)/);
  assert.match(html, /if \(isDuplicateIncomingMessage\(message\)\)/);
});

test('la memoria de deduplicación tiene caducidad y límite', () => {
  assert.match(html, /10 \* 60 \* 1000/);
  assert.match(html, /recentIncomingMessages\.size > 500/);
  assert.match(html, /recentIncomingMessages\.delete\(oldestKey\)/);
});

test('un mensaje no se pinta cuando no hay conversación activa', () => {
  assert.match(html, /if \(!activeId && incomingId\)/);
  assert.match(html, /loadConversations\(\);\s*return;/);
});
