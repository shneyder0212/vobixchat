'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('cada fragmento reanudable conserva una huella SHA-256', () => {
  const chat = read('routes/chat.js');
  assert.match(chat, /received:\s*new Map\(\)/);
  assert.match(chat, /createHash\('sha256'\)\.update\(req\.body\)\.digest\('hex'\)/);
  assert.match(chat, /session\.received\.set\(index, chunkHash\)/);
});

test('un reintento idéntico se confirma y uno distinto se rechaza', () => {
  const chat = read('routes/chat.js');
  assert.match(chat, /acceptedHash !== chunkHash/);
  assert.match(chat, /code:\s*'chunk_content_conflict'/);
  assert.match(chat, /replayed:\s*true/);
});

test('el fragmento se escribe temporalmente y se publica con rename', () => {
  const chat = read('routes/chat.js');
  assert.match(chat, /writeFile\(temporaryPath, req\.body, \{ flag: 'wx' \}\)/);
  assert.match(chat, /rename\(temporaryPath, chunkPath\)/);
});

test('la capa 119 figura en el registro', () => {
  const layers = read('core/vobix-layers.js');
  assert.match(layers, /id:'119'/);
  assert.match(layers, /Fragmentos Reanudables Inmutables/);
});
