'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const chat = fs.readFileSync(path.join(root, 'public', 'chat.html'), 'utf8');
const layers = fs.readFileSync(path.join(root, 'core', 'vobix-layers.js'), 'utf8');

test('datos y almacenamiento ofrece las tres redes solicitadas', () => {
  assert.match(chat, /id="dataNetworkMode"/);
  assert.match(chat, /value="wifi-and-data">Wi‑Fi y datos móviles/);
  assert.match(chat, /value="wifi-only">Solo Wi‑Fi/);
  assert.match(chat, /value="mobile-only">Solo datos móviles/);
  assert.match(chat, /localStorage\.setItem\('vobix_data_network_mode'/);
});

test('el ahorro de datos está desactivado por defecto y sigue siendo opcional', () => {
  assert.match(chat, /readBooleanPreference\('vobix_data_saver', false\)/);
  assert.match(chat, /bindPrivacySwitch\(elements\.dataSaverSwitch, 'dataSaver', 'vobix_data_saver'\)/);
  assert.match(chat, /Ahorro de datos desactivado/);
});

test('archivos, voz y llamadas respetan la red elegida', () => {
  assert.match(chat, /function selectedNetworkDecision\(\)/);
  assert.match(chat, /uploadChatAttachment[\s\S]{0,300}requireSelectedNetwork\('enviar archivos'\)/);
  assert.match(chat, /startVoiceRecording[\s\S]{0,350}requireSelectedNetwork\('enviar notas de voz'\)/);
  assert.match(chat, /async function startCall[\s\S]{0,350}requireSelectedNetwork\('realizar llamadas'\)/);
});

test('la Capa 151 registra el control personal de red', () => {
  assert.match(layers, /id:'151'.*Control Personal de Red y Datos/);
});
