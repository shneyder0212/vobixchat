'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('el menú tiene un asa exclusiva para moverlo verticalmente', () => {
  const html = read('public/chat.html');
  assert.match(html, /id="chatOptionsDragHandle"/);
  assert.match(html, /class="chatOptionsDragHandle"/);
  assert.match(html, /cursor:\s*ns-resize/);
});

test('el menú se arrastra con puntero, se limita a pantalla y recuerda la posición', () => {
  const html = read('public/chat.html');
  assert.match(html, /function makeOptionsMenuVerticallyDraggable\(\)/);
  assert.match(html, /handle\.addEventListener\('pointerdown'/);
  assert.match(html, /handle\.addEventListener\('pointermove'/);
  assert.match(html, /function clampOptionsMenuTop\(top\)/);
  assert.match(html, /localStorage\.setItem\([\s\S]*?OPTIONS_MENU_TOP_KEY/);
});

test('el menú también se puede mover con teclado y conserva sus opciones', () => {
  const html = read('public/chat.html');
  assert.match(html, /\['ArrowUp', 'ArrowDown'\]\.includes\(event\.key\)/);
  assert.match(html, /id="openPeopleButton"/);
  assert.match(html, /id="openProfileButton"/);
});

test('la Capa 135 queda registrada', () => {
  const layers = read('core/vobix-layers.js');
  assert.match(layers, /id:'135'.*Menú Burbuja Desplazable/);
});
