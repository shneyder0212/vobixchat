'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const attestation = require('../core/vobix-origin-attestation');
const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.js'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const route = fs.readFileSync(path.join(__dirname, '..', 'routes', 'chat.js'), 'utf8');
const chat = fs.readFileSync(path.join(__dirname, '..', 'public', 'chat.html'), 'utf8');
const layers = fs.readFileSync(path.join(__dirname, '..', 'core', 'vobix-layers.js'), 'utf8');

const payload = { messageId:'m1',sha256:'a'.repeat(64),userId:'u1',sessionId:'s1',userVerified:true,deviceRecognized:true,locationShared:false,capturedAt:'2026-09-04T10:00:00.000Z' };
const secret = 'vobix-test-secret-that-is-longer-than-32-characters';

test('Capa 105 firma un contenido canónico y detecta manipulación', () => {
  const signature = attestation.sign(payload, secret);
  assert.match(signature, /^[a-f0-9]{64}$/);
  assert.equal(attestation.verify(payload, signature, secret), true);
  assert.equal(attestation.verify({...payload, locationShared:true}, signature, secret), false);
  assert.equal(attestation.sign(payload, 'short'), null);
});

test('la sesión reconocida nace de una autenticación válida', () => {
  assert.match(schema, /sessions[\s\S]*recognized_at TIMESTAMPTZ/);
  assert.match(server, /recognized_at\)\s*VALUES[\s\S]*NOW\(\)\)/);
  assert.match(server, /recognizedAt: row\.recognized_at/);
});

test('solo cámara y grabadora Vobix reciben atestación de captura', () => {
  assert.match(route, /\['vobix-camera', 'vobix-recorder'\]\.includes\(originSource\)/);
  assert.match(route, /req\.vobixUser\?\.verified === true/);
  assert.match(route, /req\.vobixSession\?\.recognizedAt/);
  assert.match(route, /ORIGIN_ATTESTATION_SECRET/);
});

test('la ubicación permanece sin compartir por defecto', () => {
  assert.match(schema, /origin_location_shared BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(route, /locationShared:false/);
  assert.match(chat, /Ubicación no compartida/);
});

test('la interfaz muestra identidad, dispositivo, integridad y ubicación', () => {
  assert.match(layers, /id:'105', name:'Vobix Atestación de Origen'/);
  assert.match(chat, /Usuario.*verificado/);
  assert.match(chat, /Dispositivo.*reconocido/);
  assert.match(chat, /firma válida/);
  assert.match(chat, /Archivo modificado/);
});
