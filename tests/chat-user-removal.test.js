'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const chat = fs.readFileSync(path.join(root, 'public', 'chat.html'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'routes', 'chat.js'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'database', 'schema.js'), 'utf8');
const layers = fs.readFileSync(path.join(root, 'core', 'vobix-layers.js'), 'utf8');

test('el menú ofrece las tres eliminaciones solicitadas', () => {
  assert.match(chat, /id="deleteChatButton"[\s\S]*?Eliminar chat/);
  assert.match(chat, /id="removeUserButton"[\s\S]*?Eliminar usuario sin bloquear/);
  assert.match(chat, /id="removeAndBlockUserButton"[\s\S]*?Eliminar usuario y bloquear/);
});

test('vaciar el chat conserva la copia del otro participante', () => {
  assert.match(schema, /ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ/);
  assert.match(routes, /UPDATE conversation_participants[\s\S]*?SET cleared_at=NOW\(\)[\s\S]*?user_id=\$2/);
  assert.doesNotMatch(routes, /router\.delete\('\/conversations\/:conversationId\/messages'[\s\S]{0,800}?UPDATE messages SET deleted=TRUE/);
});

test('quitar y bloquear se ejecuta en una sola transacción', () => {
  assert.match(routes, /shouldBlock[\s\S]*?BEGIN[\s\S]*?DELETE FROM contacts[\s\S]*?DELETE FROM friendships[\s\S]*?INSERT INTO user_blocks[\s\S]*?COMMIT/);
  assert.match(chat, /\?block=true/);
});

test('cerrar sesión revoca primero la sesión del servidor', () => {
  assert.match(chat, /await fetch\('\/api\/auth\/logout'/);
  assert.match(chat, /VobixPush\?\.unregister/);
});

test('la Capa 154 queda registrada', () => {
  assert.match(layers, /id:'154'.*Eliminación Personal y Bloqueo/);
});
