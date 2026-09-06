'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('registro y chat comparten la identidad visual oficial', () => {
  const registration = read('public/index.html');
  const chat = read('public/chat.html');
  assert.match(registration, /class="brandWordmark"[\s\S]*VOBIX<strong>CHAT<\/strong>/);
  assert.match(chat, /class="vobixBrandbar"[\s\S]*VOBIX[\s\S]*CHAT/);
  assert.match(chat, /CAPA 159 · INTERFAZ OFICIAL VOBIXCHAT/);
});

test('el boceto conserva videollamada, llamada y compositor conectado', () => {
  const chat = read('public/chat.html');
  const video = chat.indexOf('id="videoCallButton"');
  const audio = chat.indexOf('id="audioCallButton"');
  assert.ok(video > 0 && audio > video, 'videollamada y llamada deben permanecer en la cabecera');
  for (const id of ['emojiButton', 'messageInput', 'documentButton', 'cameraButton', 'voiceButton', 'sendButton']) {
    assert.equal((chat.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} debe conservarse conectado una vez`);
  }
  assert.match(chat, /html\.vobixKeyboardOpen \.vobixBrandbar[\s\S]*display:\s*none/);
});

test('el registro declara PIN local de prueba y no promete SMS', () => {
  const registration = read('public/index.html');
  const server = read('server.js');
  const pinBlock = server.slice(server.indexOf('// GENERAR PIN'), server.indexOf('// VERIFICAR PIN'));
  assert.match(registration, /PIN LOCAL DE PRUEBA/);
  assert.match(registration, /OBTENER PIN DE PRUEBA/);
  assert.doesNotMatch(registration, /PIN (?:POR|VIA|PER) SMS|PIN BY SMS/i);
  assert.match(pinBlock, /config\.TEST_PIN_MODE/);
  assert.match(pinBlock, /config\.TEST_PIN/);
  assert.doesNotMatch(pinBlock, /Infobip|INFOBIP|fetch\s*\(/);
});

test('la Capa 159 queda registrada sin retirar el teclado universal', () => {
  const layers = read('core/vobix-layers.js');
  assert.match(layers, /id:'157'.*Teclado Universal Adaptativo/);
  assert.match(layers, /id:'159'.*Interfaz Oficial y PIN de Prueba/);
});
