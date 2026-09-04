'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.js'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const emergency = fs.readFileSync(path.join(__dirname, '..', 'public', 'emergency.html'), 'utf8');
const protectedRoute = fs.readFileSync(path.join(__dirname, '..', 'public', 'protected-route.html'), 'utf8');
const layers = fs.readFileSync(path.join(__dirname, '..', 'core', 'vobix-layers.js'), 'utf8');

test('Capa 104 registra consentimiento informado y versionado', () => {
  assert.match(layers, /id:'104', name:'Vobix Consentimiento de Seguridad'/);
  assert.match(schema, /consent_version VARCHAR\(30\)/);
  assert.match(schema, /limitations_accepted_at TIMESTAMPTZ/);
  assert.match(server, /SAFETY_CONSENT_VERSION/);
});

test('alerta silenciosa continúa desactivada por defecto', () => {
  assert.match(schema, /enabled BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(server, /const enabled = req\.body\?\.enabled === true/);
  assert.match(server, /limitationsAccepted = req\.body\?\.limitationsAccepted === true/);
});

test('las dos funciones exigen autorización y comprensión de límites', () => {
  assert.match(emergency, /id="consent"/);
  assert.match(emergency, /id="limitations"/);
  assert.match(emergency, /limitationsAccepted:true/);
  assert.match(protectedRoute, /id="limitations"/);
  assert.match(protectedRoute, /limitationsAccepted:true/);
});

test('el texto no elimina derechos ni promete sustituir emergencias públicas', () => {
  assert.match(emergency, /no limita mis derechos legales/i);
  assert.match(emergency, /no garantiza un rescate ni sustituye al 112/i);
  assert.match(protectedRoute, /no limita mis derechos legales/i);
  assert.match(layers, /no sustituye al 112 ni elimina responsabilidades legales/);
});
