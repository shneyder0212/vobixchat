'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('el campo móvil agrupa texto y herramientas como una sola barra', () => {
  const html = read('public/chat.html');
  assert.match(
    html,
    /<div class="vobixMessageField">[\s\S]*id="emojiButton"[\s\S]*id="messageInput"[\s\S]*id="documentButton"[\s\S]*id="cameraButton"[\s\S]*<\/div>/
  );
  assert.match(html, /\.vobixMessageField \{[\s\S]*flex:\s*1;[\s\S]*min-width:\s*0;/);
  assert.match(html, /\.vobixMessageField #messageInput \{[\s\S]*background:\s*transparent;/);
});

test('Android e iPhone reciben una superficie compatible con su teclado', () => {
  const html = read('public/chat.html');
  assert.match(html, /interactive-widget=resizes-content/);
  assert.match(html, /function syncMobileVisualViewport\(\)/);
  assert.match(html, /window\.visualViewport\?\.addEventListener\('resize'/);
  assert.match(html, /--vobix-viewport-height/);
  assert.match(html, /font-size:\s*16px;/);
});

test('el compositor conserva sus cinco acciones esenciales', () => {
  const html = read('public/chat.html');
  for (const id of ['emojiButton', 'documentButton', 'cameraButton', 'voiceButton', 'sendButton']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} debe existir una vez`);
  }
});

test('la Capa 137 queda registrada después de la recuperación del chat', () => {
  const layers = read('core/vobix-layers.js');
  assert.match(layers, /id:'136'/);
  assert.match(layers, /id:'137'.*Compositor Móvil Adaptativo/);
});
