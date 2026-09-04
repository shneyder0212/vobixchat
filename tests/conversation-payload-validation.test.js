'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'chat.html'),
  'utf8'
);

test('acepta únicamente colecciones reconocidas de conversaciones', () => {
  assert.match(html, /function isValidConversationsPayload\(data\)/);
  assert.match(html, /Array\.isArray\(data\?\.conversations\)/);
  assert.match(html, /Array\.isArray\(data\?\.results\)/);
  assert.match(html, /Array\.isArray\(data\?\.data\)/);
});

test('una respuesta incompleta conserva la bandeja o recupera la caché', () => {
  const validationAt = html.indexOf('if (!isValidConversationsPayload(data))');
  const renderAt = html.indexOf('renderConversations(\n          conversations', validationAt);
  assert.ok(validationAt > -1);
  assert.ok(renderAt > validationAt);
  assert.match(html, /const cachedConversations = readConversationCache\(\)/);
  assert.match(html, /Se conserva el historial disponible/);
});
