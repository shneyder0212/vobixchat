'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'chat.html'), 'utf8');

test('estados visuales tienen significado textual accesible', () => {
  assert.match(html, /function setMessageStatusPresentation/);
  assert.match(html, /Pendiente de conexión/);
  assert.match(html, /No enviado/);
  assert.match(html, /Enviado al servidor/);
  assert.match(html, /Entregado al dispositivo/);
  assert.match(html, /Leído/);
});

test('estado usa etiqueta para lector de pantalla y conserva colores', () => {
  assert.match(html, /status\.setAttribute\(['"]role['"], ['"]img['"]\)/);
  assert.match(html, /status\.setAttribute\(['"]aria-label['"], presentation\.label\)/);
  assert.match(html, /classList\.toggle\(['"]read['"]/);
  assert.match(html, /classList\.toggle\(['"]failed['"]/);
});

test('creación y actualización usan una única presentación coherente', () => {
  const uses = html.match(/setMessageStatusPresentation\(/g) || [];
  assert.ok(uses.length >= 3);
});
