'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('el compositor móvil reserva un campo horizontal legible', () => {
  const html = read('public/chat.html');
  assert.match(html, /@media\(max-width:720px\)[\s\S]*?#viewOnceToggle\s*\{[\s\S]*?display:\s*none/);
  assert.match(html, /@media\(max-width:720px\)[\s\S]*?#messageInput\s*\{[\s\S]*?width:\s*100%[\s\S]*?min-width:\s*0/);
  assert.match(html, /\.vobixMessageField\s*\{[\s\S]*?flex:\s*1[\s\S]*?min-width:\s*0/);
  assert.match(html, /@media\(max-width:720px\)[\s\S]*?\.vobixComposerTool\s*\{[\s\S]*?min-width:\s*36px/);
});

test('Samsung puede enviar antes de que el teclado cancele el click', () => {
  const html = read('public/chat.html');
  assert.match(html, /sendButton[\s\S]*?addEventListener\(\s*'pointerdown'[\s\S]*?sendCurrentMessage\(\)/);
  assert.match(html, /event\.pointerType === 'mouse' && event\.button !== 0/);
  assert.match(html, /event\.detail === 0[\s\S]*?sendCurrentMessage\(\)/);
});

test('el encabezado móvil conserva solo llamadas y opciones', () => {
  const html = read('public/chat.html');
  assert.match(html, /id="audioCallButton"/);
  assert.match(html, /id="videoCallButton"[\s\S]*?📹/);
  assert.match(html, /#sendPhotoButton\s*\{\s*display:\s*none/);
  assert.match(html, /function bindImmediateCallButton\(button, type\)[\s\S]*?startCall\(type\)/);
});

test('la Capa 134 queda registrada sin retirar las capas de entrega', () => {
  const layers = read('core/vobix-layers.js');
  assert.match(layers, /id:'109'.*Persistencia de Mensajes de Acero/);
  assert.match(layers, /id:'113'.*Mensajería en Tiempo Real Idempotente/);
  assert.match(layers, /id:'134'.*Mensajería Móvil Utilizable y Envío Inmediato/);
});
