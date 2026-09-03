'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'chat.html'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'routes', 'chat.js'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'database', 'schema.js'), 'utf8');

test('un mensaje se confirma por HTTP y no por socket sin acuse', () => {
  const send = html.match(/async function sendCurrentMessage\(\)[\s\S]*?\n    if \(\n      elements\.sendButton/);
  assert.ok(send, 'no se encontró sendCurrentMessage');
  assert.match(send[0], /api\(\s*['"]\/api\/chat\/messages['"]/);
  assert.doesNotMatch(send[0], /socket\.emit\(\s*['"]chat:message['"]/);
});

test('reintento manual también exige confirmación HTTP', () => {
  const retry = html.match(/async function retryFailedMessage[\s\S]*?\n    \}/);
  assert.ok(retry, 'no se encontró retryFailedMessage');
  assert.match(retry[0], /api\(['"]\/api\/chat\/messages['"]/);
  assert.doesNotMatch(retry[0], /socket\.emit/);
});

test('servidor aplica idempotencia por remitente y dispositivo', () => {
  assert.match(schema, /client_message_id VARCHAR\(100\)/);
  assert.match(schema, /UNIQUE INDEX IF NOT EXISTS messages_sender_client_id_unique/);
  assert.match(routes, /ON CONFLICT \(sender_user_id, client_message_id\)/);
  assert.match(routes, /clientMessageId:\s*row\.client_message_id/);
  assert.match(routes, /\(xmax = 0\) AS inserted/);
  assert.match(routes, /if \(inserted\) \{\s*await notifyPrivateConversation/);
});

test('cola se restaura tras recargar y reconcilia confirmaciones perdidas', () => {
  assert.match(html, /function reconcileAndRenderQueuedMessages/);
  assert.match(html, /deliveredClientIds\.has/);
  assert.match(html, /status:\s*['"]queued['"]/);
  assert.match(html, /reconcileAndRenderQueuedMessages\(id, messages\)/);
});

test('fallo temporal reintenta con espera exponencial limitada', () => {
  assert.match(html, /function scheduleOutboxRetry/);
  assert.match(html, /Math\.min\(60000, 2000 \* \(2 \*\*/);
  assert.match(html, /scheduleOutboxRetry\(payload\.attempts\)/);
  assert.match(html, /vobix:network-quality-change/);
});

test('cola protege almacenamiento sin borrar silenciosamente mensajes antiguos', () => {
  assert.match(html, /const MAX_OUTBOX_MESSAGES = 100/);
  assert.match(html, /const MAX_OUTBOX_BYTES = 1500000/);
  assert.match(html, /messages\.length > MAX_OUTBOX_MESSAGES/);
  assert.match(html, /new Blob\(\[serialized\]\)\.size > MAX_OUTBOX_BYTES/);
  assert.match(html, /outbox\.length >= MAX_OUTBOX_MESSAGES/);
  assert.doesNotMatch(html, /messages\.slice\(-100\)/);
});

test('cola ignora registros locales incompletos o manipulados', () => {
  assert.match(html, /function validOutboxItem/);
  assert.match(html, /stored\.filter\(validOutboxItem\)/);
});
