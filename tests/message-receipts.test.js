'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'routes', 'chat.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public', 'chat.html'), 'utf8');

test('servidor escucha recibos actuales de entrega y lectura', () => {
  assert.match(server, /socket\.on\(['"]chat:delivered['"]/);
  assert.match(server, /socket\.on\(['"]chat:read['"]/);
  assert.match(server, /socketCanAccessConversation\(conversationId, userId\)/);
});

test('recibos se guardan de forma idempotente y solo para mensajes ajenos', () => {
  assert.match(server, /sender_user_id<>\$3/);
  assert.match(server, /INSERT INTO message_receipts/);
  assert.match(server, /ON CONFLICT\(message_id,user_id\) DO UPDATE/);
  assert.match(server, /io\.to\(`user:\$\{String\(senderUserId\)\}`\)/);
});

test('cliente confirma entrega y conserva lectura opcional', () => {
  assert.match(html, /socket\.emit\(['"]chat:delivered['"]/);
  assert.match(html, /socket\.emit\(['"]chat:read['"]/);
  assert.match(routes, /deliveredAt:\s*row\.delivered_at/);
  assert.match(routes, /readAt:\s*row\.read_at/);
});

test('confirmación HTTP enlaza el identificador local con el del servidor', () => {
  assert.match(html, /function bindConfirmedMessageId/);
  assert.match(html, /row\.dataset\.messageId = serverMessageId/);
  assert.match(html, /confirmedMessage = result\?\.message/);
});
