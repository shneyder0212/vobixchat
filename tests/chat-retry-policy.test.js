'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'chat.html'),
  'utf8'
);

test('clasifica como temporales red, timeout, sesión y saturación', () => {
  assert.match(html, /function isRetryableChatError\(error\)/);
  assert.match(html, /if \(!status\) return true/);
  assert.match(html, /error\?\.code === ['"]VOBIX_TIMEOUT['"]/);
  assert.match(html, /\[401, 408, 425, 429\]\.includes\(status\)/);
  assert.match(html, /status >= 500 && status <= 599/);
});

test('un mensaje nuevo solo entra en cola por un fallo temporal', () => {
  assert.match(html, /isRetryableChatError\(error\) && queueOutgoingMessage\(payload\)/);
});

test('la cola retira rechazos definitivos y continúa con los demás', () => {
  assert.match(html, /if \(!isRetryableChatError\(error\)\)/);
  assert.match(html, /remaining\.shift\(\)/);
  assert.match(html, /rejectedCount \+= 1/);
  assert.match(html, /updateMessageStatus\(\{ clientMessageId: payload\.clientMessageId \}, ['"]failed['"]\)/);
});
