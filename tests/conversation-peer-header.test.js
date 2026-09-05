'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const chat = fs.readFileSync(path.join(__dirname, '..', 'public', 'chat.html'), 'utf8');

test('la cabecera descarta al usuario local y muestra al otro participante', () => {
  assert.match(chat, /const namedCandidates = \[[\s\S]*conversation\.otherUser[\s\S]*conversation\.peer/);
  assert.match(chat, /candidateId !== myId/);
  assert.match(chat, /elements\.myAvatar\.textContent = userInitial\(app\.peer\)/);
  assert.match(chat, /elements\.topbarUserName[\s\S]{0,220}userName\([\s\S]{0,80}app\.peer/);
});
