'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('el control de subtítulos nace oculto y hidden prevalece sobre su estilo', () => {
  const html = read('public/chat.html');
  assert.match(html, /id="captionsToggleButton"[^>]*hidden/);
  assert.match(html, /\.captionsToggle\[hidden\][\s\S]{0,80}display: none !important/);
});

test('los teléfonos intercambian solo el código de idioma durante la llamada', () => {
  const html = read('public/chat.html');
  assert.match(html, /function callLanguage[\s\S]{0,240}match\(\/\^\(\[a-z\]/);
  assert.match(html, /'call:offer'[\s\S]{0,500}language:[\s\n]*callLanguage\(\)/);
  assert.match(html, /answer: pc\.localDescription,[\s\n]*language: callLanguage\(\)/);
  assert.doesNotMatch(html, /caption[^\n]{0,80}\bip\b/i);
});

test('el cliente muestra CC solamente cuando existe diferencia de idioma', () => {
  const html = read('public/chat.html');
  assert.match(html, /function setCaptionsAvailability/);
  assert.match(html, /language !== local/);
  assert.match(html, /captionsToggleButton\.hidden = !app\.captionsAvailable/);
  assert.match(html, /if \(!app\.captionsAvailable\) return/);
  assert.match(html, /call:captions-availability/);
});

test('el servidor normaliza idiomas y rechaza subtítulos para el mismo idioma', () => {
  const server = read('server.js');
  assert.match(server, /function normalizeCallLanguage/);
  assert.match(server, /function callHasDifferentLanguages/);
  assert.match(server, /new Set\(activeLanguages\)\.size > 1/);
  assert.match(server, /code:'captions_same_language'/);
  assert.match(server, /emitCallCaptionsAvailability\(call\)/);
});

test('la Capa 175 registra la regla sin eliminar el consentimiento', () => {
  const layers = read('core/vobix-layers.js');
  assert.match(layers, /id:'175'.*Subtítulos Solo Entre Idiomas Diferentes.*status:'en_validacion'/);
  assert.match(read('server.js'), /call\.captionConsents/);
});
