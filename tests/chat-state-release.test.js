'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'chat.html'),
  'utf8'
);

test('la cola libera su bloqueo mediante finally', () => {
  assert.match(html, /async function flushQueuedMessages\(\)[\s\S]*?finally \{\s*app\.outboxFlushing = false/);
});

test('el envío libera botón y estado mediante finally', () => {
  assert.match(html, /const finishMessageSend = \(\) =>/);
  assert.match(html, /finally \{\s*finishMessageSend\(\)/);
  assert.match(html, /elements\.sendButton\.removeAttribute\(['"]aria-busy['"]\)/);
});
