'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'chat.html'),
  'utf8'
);

test('mantiene el bloqueo existente durante una petición activa', () => {
  assert.match(html, /if \(app\.messageSending\)/);
  assert.match(html, /app\.messageSending = true/);
  assert.match(html, /app\.messageSending = false/);
});

test('filtra la misma intención táctil repetida inmediatamente', () => {
  assert.match(html, /lastMessageSendIntent: null/);
  assert.match(html, /const sendIntentKey = `\$\{String\(conversationId\)\}:\$\{text\}`/);
  assert.match(html, /sendIntentNow - app\.lastMessageSendIntent\.at < 900/);
});

test('la protección se limita por conversación y contenido', () => {
  assert.match(html, /key: sendIntentKey/);
  assert.match(html, /at: sendIntentNow/);
});
