'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'chat.html'), 'utf8');
const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'chat.js'), 'utf8');

test('fotos y documentos se pintan solo con confirmación del servidor', () => {
  assert.match(html, /if \(data\?\.message\) \{[\s\S]{0,220}renderIncomingMessage\(data\.message\)/);
  assert.doesNotMatch(html, /emit\(\s*['"]chat:file['"]/);
});

test('la nota de voz usa el mensaje persistido y no una copia temporal', () => {
  assert.match(html, /if \(uploaded\?\.message\) \{[\s\S]{0,300}renderIncomingMessage\(uploaded\.message\)/);
  assert.equal((html.match(/renderLocalVoiceMessage/g) || []).length, 1);
  assert.doesNotMatch(html, /emit\(\s*['"]chat:voice['"]/);
});

test('el mensaje normalizado conserva tipo y protección de una sola vista', () => {
  assert.match(routes, /type:\s*row\.message_type \|\| 'text'/);
  assert.match(routes, /viewOnce:\s*Boolean\(row\.view_once\)/);
  assert.match(routes, /view_once:\s*Boolean\(row\.view_once\)/);
  assert.match(html, /message\.messageType \|\| message\.message_type/);
});

test('los documentos confirmados se reconocen también por su URL normalizada', () => {
  assert.match(html, /message\.fileUrl \|\| message\.file_url/);
});
