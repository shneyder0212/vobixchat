'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'chat.html'),
  'utf8'
);

test('el botón queda bloqueado y accesible mientras busca', () => {
  assert.match(html, /searchButton\.disabled = true/);
  assert.match(html, /searchButton\.setAttribute\(['"]aria-busy['"], ['"]true['"]\)/);
  assert.match(html, /searchButton\.textContent = ['"]Buscando…['"]/);
});

test('solo la búsqueda vigente puede restaurar el botón', () => {
  assert.match(html, /searchSequence === app\.peopleSearchSequence/);
  assert.match(html, /searchButton\.disabled = false/);
  assert.match(html, /searchButton\.removeAttribute\(['"]aria-busy['"]\)/);
  assert.match(html, /searchButton\.textContent = ['"]Buscar['"]/);
});
