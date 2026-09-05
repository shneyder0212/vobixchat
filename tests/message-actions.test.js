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

test('el menú de tres puntos ofrece todas las acciones solicitadas', () => {
  assert.match(chat, /className = 'messageMenuButton'/);
  assert.match(chat, /Reaccionar/);
  assert.match(chat, /Copiar/);
  assert.match(chat, /Pegar/);
  assert.match(chat, /Editar/);
  assert.match(chat, /Eliminar para mí/);
  assert.match(chat, /Eliminar para todos/);
});

test('editar y eliminar esperan confirmación HTTP del servidor', () => {
  assert.match(chat, /method: 'PUT'/);
  assert.match(chat, /requestMessageHideForMe[\s\S]*method: 'DELETE'/);
  assert.doesNotMatch(chat, /socket\.emit\('chat:message:(?:edit|delete)'/);
});

test('el borrado individual persiste sin afectar al otro participante', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS message_hidden_users/);
  assert.match(routes, /router\.delete\('\/messages\/:messageId\/me'/);
  assert.match(routes, /INSERT INTO message_hidden_users/);
  assert.match(routes, /NOT EXISTS \([\s\S]*FROM message_hidden_users/);
});

test('las reacciones se guardan, agregan y sincronizan', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS message_reactions/);
  assert.match(routes, /MESSAGE_REACTION_EMOJIS/);
  assert.match(routes, /ON CONFLICT\(message_id, user_id\) DO UPDATE SET emoji/);
  assert.match(routes, /emitMessageMutation\(req, message\.conversation_id, 'reaction'/);
  assert.match(chat, /await api\(`\/api\/chat\/messages\/\$\{encodeURIComponent\(id\)\}\/reaction`/);
});

test('la Capa 147 queda registrada', () => {
  assert.match(layers, /id:'147'.*Acciones Seguras de Mensajes/);
});
