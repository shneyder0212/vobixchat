'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'chat.html'),
  'utf8'
);

test('acepta únicamente colecciones reconocidas de mensajes', () => {
  assert.match(html, /function isValidMessagesPayload\(data\)/);
  assert.match(html, /Array\.isArray\(data\?\.messages\)/);
  assert.match(html, /Array\.isArray\(data\?\.results\)/);
  assert.match(html, /Array\.isArray\(data\?\.data\)/);
});

test('una respuesta incompleta se descarta antes de limpiar el historial', () => {
  const validationAt = html.indexOf('if (!isValidMessagesPayload(data))');
  const clearAt = html.indexOf('clearMessages();', validationAt);
  assert.ok(validationAt > -1);
  assert.ok(clearAt > validationAt);
  assert.match(html, /Se conserva la conversación visible/);
});
