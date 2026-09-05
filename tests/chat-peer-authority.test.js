'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const chat = fs.readFileSync(path.join(__dirname, '..', 'public', 'chat.html'), 'utf8');

test('la cabecera construye el contacto desde los campos autorizados por el servidor', () => {
  const start = chat.indexOf('function getConversationPeer');
  const end = chat.indexOf('ID DE CONVERSACIÓN', start);
  const peer = chat.slice(start, end);
  assert.match(peer, /conversation\.otherUserId \|\| conversation\.other_user_id/);
  assert.match(peer, /conversation\.otherUsername \|\| conversation\.other_username/);
  assert.match(peer, /explicitOtherId !== myId/);
});

test('un nombre obsoleto de la URL no sustituye al participante real', () => {
  const start = chat.indexOf('const authoritativePeer = getConversationPeer(requestedConversation)');
  const end = chat.indexOf('} else {\n            ensureActiveConversation()', start);
  const launch = chat.slice(start, end);
  assert.match(launch, /String\(userId\(authoritativePeer\) \|\| ''\) === requestedUserId/);
  assert.match(launch, /selectConversation\(requestedConversation, authoritativePeer \|\| requestedPeer\)/);
});

test('una conversación ya abierta vuelve a tomar el nombre real del servidor', () => {
  assert.match(chat, /const refreshedActiveConversation = activeId/);
  assert.match(chat, /app\.peer = refreshedPeer/);
  assert.match(chat, /topbarUserName\.textContent = userName\(refreshedPeer\)/);
  assert.match(chat, /\[getConversationPeer\(conversation\), peer\]/);
});
