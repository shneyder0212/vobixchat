'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const route = fs.readFileSync(path.join(__dirname, '..', 'routes', 'chat.js'), 'utf8');
const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.js'), 'utf8');
const chat = fs.readFileSync(path.join(__dirname, '..', 'public', 'chat.html'), 'utf8');
const layers = fs.readFileSync(path.join(__dirname, '..', 'core', 'vobix-layers.js'), 'utf8');

test('Capa 102 registra una huella criptográfica junto al mensaje', () => {
  assert.match(layers, /id:'102', name:'Vobix Sello Original'/);
  assert.match(schema, /origin_sha256 CHAR\(64\)/);
  assert.match(schema, /origin_source VARCHAR\(30\)/);
  assert.match(schema, /origin_sealed_at TIMESTAMPTZ/);
  assert.match(route, /const originSha256 = await sha256File\(req\.file\.path\)/);
  assert.match(route, /origin_sha256,[\s\S]*origin_source,[\s\S]*origin_sealed_at/);
});

test('la verificación recalcula SHA-256 desde los bytes almacenados', () => {
  assert.match(route, /function currentStoredFileSha256/);
  assert.match(route, /r2Storage\.getChatFile/);
  assert.match(route, /crypto\.timingSafeEqual/);
  assert.match(route, /status: intact \? 'intact' : 'modified'/);
});

test('solo participantes de la conversación pueden verificar el sello', () => {
  assert.match(route, /messages\/:messageId\/origin-seal/);
  assert.match(route, /validatePrivateRoom\(message\.conversation_id, userId\)/);
  assert.match(route, /El archivo ya no está disponible/);
});

test('la interfaz distingue contenido creado en Vobix de archivos importados', () => {
  assert.match(chat, /Creado y sellado en Vobix/);
  assert.match(chat, /Sellado al entrar en Vobix/);
  assert.match(chat, /originSource', 'vobix-camera'/);
  assert.match(chat, /originSource', 'vobix-recorder'/);
  assert.match(chat, /Original intacto/);
  assert.match(chat, /Archivo modificado/);
});
