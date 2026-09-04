'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'chat.html'),
  'utf8'
);

test('cada carga de mensajes recibe una secuencia creciente', () => {
  assert.match(html, /messagesLoadSequence: 0/);
  assert.match(html, /const loadSequence = \+\+app\.messagesLoadSequence/);
});

test('una respuesta lenta solo continúa si la conversación sigue activa', () => {
  assert.match(html, /const loadIsCurrent = \(\) =>/);
  assert.match(html, /loadSequence === app\.messagesLoadSequence/);
  assert.match(html, /conversationId\(app\.conversation\)/);
  assert.match(html, /if \(!loadIsCurrent\(\)\) return;/);
});

test('los errores obsoletos tampoco sustituyen el estado de la conversación nueva', () => {
  const staleGuards = html.match(/if \(!loadIsCurrent\(\)\) return;/g) || [];
  assert.ok(staleGuards.length >= 3);
});
