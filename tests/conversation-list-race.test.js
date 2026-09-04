'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'chat.html'),
  'utf8'
);

test('la bandeja descarta cargas anteriores que terminan tarde', () => {
  assert.match(html, /conversationsLoadSequence: 0/);
  assert.match(html, /const loadSequence = \+\+app\.conversationsLoadSequence/);
  assert.match(html, /loadSequence !== app\.conversationsLoadSequence/);
});

test('actualizar conserva la lista visible para evitar parpadeos', () => {
  assert.match(html, /!container\.querySelector\(['"]\.vxConversation['"]\)/);
  assert.match(html, /container\.setAttribute\(['"]aria-busy['"], ['"]true['"]\)/);
  assert.match(html, /container\.removeAttribute\(['"]aria-busy['"]\)/);
});
