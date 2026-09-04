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
  assert.match(html, /emitMessageReceipt\(['"]delivered['"]/);
  assert.match(html, /emitMessageReceipt\(['"]read['"]/);
  assert.match(routes, /deliveredAt:\s*row\.delivered_at/);
  assert.match(routes, /readAt:\s*row\.read_at/);
});

test('confirmación HTTP enlaza el identificador local con el del servidor', () => {
  assert.match(html, /function bindConfirmedMessageId/);
  assert.match(html, /row\.dataset\.messageId = serverMessageId/);
  assert.match(html, /confirmedMessage = result\?\.message/);
});

test('reconexión sincroniza recibos pendientes sin modificar el historial', () => {
  assert.match(html, /async function syncConversationReceipts/);
  assert.match(html, /messages\?limit=100/);
  assert.match(html, /syncConversationReceipts\(id\)/);
  assert.match(html, /receiptSyncing/);
});

test('volver a la aplicación sincroniza lectura del dispositivo activo', () => {
  assert.match(html, /visibilitychange/);
  assert.match(html, /!document\.hidden && app\.socket\?\.connected/);
  assert.match(html, /syncConversationReceipts\(conversationId\(app\.conversation\)\)/);
});

test('recibos manipulados o excesivos se descartan antes de consultar', () => {
  assert.match(server, /const receiptUuidPattern/);
  assert.match(server, /receiptRate\.count > 240/);
  assert.match(server, /now - receiptRate\.startedAt >= 60000/);
  assert.match(server, /!\['delivered', 'read'\]\.includes\(receiptType\)/);
  assert.match(server, /!receiptUuidPattern\.test\(conversationId\)/);
});

test('servidor confirma recibos mediante acuse sin exponer errores internos', () => {
  assert.match(server, /socket\.on\(['"]chat:delivered['"], async \(payload, callback\)/);
  assert.match(server, /callback\(\{ ok:true, saved \}\)/);
  assert.match(server, /callback\(\{ ok:false \}\)/);
});

test('cliente reintenta silenciosamente si falta el acuse del servidor', () => {
  assert.match(html, /function emitMessageReceipt/);
  assert.match(html, /socket\.timeout\(5000\)\.emit/);
  assert.match(html, /function scheduleReceiptRetry/);
  assert.match(html, /syncConversationReceipts\(conversationId\(app\.conversation\)\)/);
});
