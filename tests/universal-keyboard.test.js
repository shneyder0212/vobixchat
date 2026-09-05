'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('registro, bandeja y conversación cargan el mismo adaptador de teclado', () => {
  for (const file of ['public/index.html', 'public/inbox.html', 'public/chat.html']) {
    assert.match(read(file), /<script src="\/vobix-keyboard\.js"><\/script>/);
  }
});

test('el adaptador combina APIs modernas y respaldos sin identificar marcas', () => {
  const keyboard = read('public/vobix-keyboard.js');
  assert.match(keyboard, /window\.visualViewport/);
  assert.match(keyboard, /navigator\.virtualKeyboard/);
  assert.match(keyboard, /geometrychange/);
  assert.match(keyboard, /focusin/);
  assert.match(keyboard, /orientationchange/);
  assert.doesNotMatch(keyboard, /Samsung|Xiaomi|Motorola|Huawei|iPhone/);
});

test('solo desplaza el control enfocado cuando queda fuera del área visible', () => {
  const keyboard = read('public/vobix-keyboard.js');
  assert.match(keyboard, /rect\.top < visibleTop \|\| rect\.bottom > visibleBottom/);
  assert.match(keyboard, /scrollIntoView\(\{ block: 'nearest'/);
});

test('publica dimensiones comunes para todas las pantallas y detecta teclado real', () => {
  const keyboard = read('public/vobix-keyboard.js');
  assert.match(keyboard, /--vobix-viewport-height/);
  assert.match(keyboard, /--vobix-inbox-height/);
  assert.match(keyboard, /--vobix-login-height/);
  assert.match(keyboard, /keyboardHeight >= 80/);
});

test('la Capa 157 registra el teclado universal adaptativo', () => {
  assert.match(read('core/vobix-layers.js'), /id:'157'.*Teclado Universal Adaptativo/);
});
