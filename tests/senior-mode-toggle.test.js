'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const chat = fs.readFileSync(path.join(__dirname, '..', 'public', 'chat.html'), 'utf8');
const layers = fs.readFileSync(path.join(__dirname, '..', 'core', 'vobix-layers.js'), 'utf8');

test('el menú ofrece activar y desactivar Modo Senior según su estado', () => {
  assert.match(chat, /id="openSeniorModeButton"[^>]*aria-pressed="false"/);
  assert.match(chat, /id="seniorModeOptionText"[^>]*>Activar Modo Senior<\/span>/);
  assert.match(chat, /textContent = active[\s\S]{0,120}'Desactivar Modo Senior'[\s\S]{0,80}'Activar Modo Senior'/);
});

test('el interruptor cambia con una pulsación y sin confirmación', () => {
  assert.match(chat, /openSeniorModeButton\?\.addEventListener\('click',[\s\S]{0,260}applySeniorMode\(!active\)/);
  assert.doesNotMatch(chat, /¿Activar gratis Vobix Senior/);
  assert.doesNotMatch(chat, /Mantén pulsado 3 segundos/);
  assert.doesNotMatch(chat, /seniorExitTimer/);
});

test('la Capa 144 queda registrada', () => {
  assert.match(layers, /id:'144'.*Interruptor Directo de Modo Senior/);
});
