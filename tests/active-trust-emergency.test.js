'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const emergency = require('../core/vobix-emergency');
const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.js'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const chat = fs.readFileSync(path.join(__dirname, '..', 'public', 'chat.html'), 'utf8');
const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'emergency.html'), 'utf8');
const layers = fs.readFileSync(path.join(__dirname, '..', 'core', 'vobix-layers.js'), 'utf8');

test('Capa 100 está registrada como seguridad transversal y visible', () => {
  assert.match(layers, /id:'100', name:'Vobix Prueba de Vida y Confianza Activa'/);
  assert.match(chat, /Prueba de Vida y Alerta Silenciosa/);
  assert.match(page, /No sustituye al 112/);
});

test('la frase se normaliza y las frases comunes se rechazan', () => {
  assert.equal(emergency.normalizePhrase('  Luna, AZUL 47! '), 'luna azul 47');
  assert.equal(emergency.phraseIsSafe('luna azul 47'), true);
  assert.equal(emergency.phraseIsSafe('ayuda por favor'), false);
  const hash = emergency.phraseHash('Luna azul 47');
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(emergency.hashesMatch(hash, emergency.phraseHash('luna azul 47')), true);
});

test('la ubicación se limita a coordenadas y precisión válidas', () => {
  assert.deepEqual(emergency.safeLocation(40.4167751, -3.7037902, 12.7), {
    latitude:40.41678, longitude:-3.70379, accuracy:13
  });
  assert.equal(emergency.safeLocation(91, 0, 10), null);
  assert.equal(emergency.safeLocation(40, Infinity, 10), null);
});

test('solo un Guardián activo puede recibir una alerta configurada', () => {
  assert.match(server, /g\.protected_user_id=\$1 AND g\.status='active'/);
  assert.match(server, /s\.enabled=TRUE/);
  assert.match(server, /hashesMatch\(row\.phrase_hash, phraseHash\)/);
  assert.match(server, /recent\.length >= 3/);
});

test('la frase nunca se almacena en texto y la ubicación caduca', () => {
  assert.match(schema, /phrase_hash CHAR\(64\)/);
  assert.doesNotMatch(schema, /phrase_text|secret_phrase|phrase VARCHAR/);
  assert.match(server, /NOW\(\)\+INTERVAL '30 minutes'/);
  assert.match(server, /created_at>NOW\(\)-INTERVAL '2 minutes'/);
});

test('la detección solo se arma durante una llamada y con permiso local', () => {
  assert.match(chat, /if \(app\.callId\) startEmergencyRecognition\(\)/);
  assert.match(chat, /EMERGENCY_ENABLED_KEY\) !== 'true'/);
  assert.match(chat, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(chat, /\/api\/emergency\/trigger/);
});

test('la configuración exige consentimiento explícito y familiar elegido', () => {
  assert.match(page, /id="consent"/);
  assert.match(page, /Debes confirmar la autorización y comprender los límites del servicio/);
  assert.match(page, /role==='protected'&&item\.status==='active'/);
  assert.match(server, /req\.body\?\.consent === true/);
});
