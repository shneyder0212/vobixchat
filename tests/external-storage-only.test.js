'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('los adjuntos nuevos usan Render solo como espacio temporal', () => {
  const chat = read('routes/chat.js');
  assert.match(chat, /const os = require\('os'\)/);
  assert.match(chat, /path\.join\(\s*os\.tmpdir\(\),\s*'vobixchat',\s*'chat'/);
  assert.doesNotMatch(chat, /const chatUploadDirectory[\s\S]{0,160}process\.cwd\(\)/);
});

test('una subida falla cerrada cuando R2 no está disponible', () => {
  const chat = read('routes/chat.js');
  assert.match(chat, /if \(!r2Storage\.isConfigured\(\)\)/);
  assert.match(chat, /code:'external_media_storage_required'/);
  assert.match(chat, /if \(!permanentStorage\.stored\)/);
});

test('la copia temporal se elimina después de confirmar R2 y PostgreSQL', () => {
  const chat = read('routes/chat.js');
  assert.match(chat, /const permanentStorage = await r2Storage\.putChatFile/);
  assert.match(chat, /messagePersisted = Boolean\(result\.rows\[0\]\)/);
  assert.match(chat, /confirmados R2 y PostgreSQL[\s\S]{0,180}removeUploadedFile\(req\.file\)/);
  assert.match(chat, /if \(!messagePersisted && permanentObjectKey\)/);
});

test('la capa 163 documenta los destinos persistentes sin declarar disco de Render', () => {
  const layers = read('core/vobix-layers.js');
  assert.match(layers, /id:'163'.*PostgreSQL.*Cloudflare R2.*Render procesa únicamente temporales/);
});
