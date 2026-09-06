'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('el adaptador usa la menor altura visible informada por Android', () => {
  const keyboard = read('public/vobix-keyboard.js');
  assert.match(keyboard, /heightCandidates = \[viewport\?\.height, window\.innerHeight\]/);
  assert.match(keyboard, /Math\.min\(\.\.\.heightCandidates\)/);
  assert.match(keyboard, /vobixKeyboardFocus/);
  assert.match(keyboard, /setTimeout\(scheduleUpdate, 520\)/);
});

test('la barra de escritura no se encoge y queda pegada sobre el teclado', () => {
  const html = read('public/chat.html');
  const composer = html.slice(html.indexOf('.vobixComposer {'), html.indexOf('.vobixMessageField {'));
  assert.match(composer, /flex: 0 0 auto/);
  assert.match(html, /html\.vobixKeyboardFocus \.vobixApp/);
  assert.match(html, /html\.vobixKeyboardFocus \.vobixComposer/);
  assert.match(html, /heightCandidates = \[viewport\?\.height, window\.innerHeight\]/);
});

test('la Capa 178 registra el compositor encima del teclado nativo', () => {
  assert.match(
    read('core/vobix-layers.js'),
    /id:'178'.*Compositor Siempre Sobre el Teclado.*status:'en_validacion'/
  );
});
