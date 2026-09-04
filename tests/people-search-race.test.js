'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'chat.html'),
  'utf8'
);

test('cada búsqueda de personas recibe una secuencia', () => {
  assert.match(html, /peopleSearchSequence: 0/);
  assert.match(html, /const searchSequence = \+\+app\.peopleSearchSequence/);
});

test('los resultados pertenecen al texto que continúa escrito', () => {
  assert.match(html, /const searchIsCurrent = \(\) =>/);
  assert.match(html, /searchSequence === app\.peopleSearchSequence/);
  assert.match(html, /input\.value\.trim\(\) === query/);
});

test('respuestas y errores antiguos se descartan', () => {
  const guards = html.match(/if \(!searchIsCurrent\(\)\) return;/g) || [];
  assert.ok(guards.length >= 2);
});
