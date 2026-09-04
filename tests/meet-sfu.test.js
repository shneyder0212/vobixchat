'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('Meet emite permisos SFU solo a miembros admitidos y vigentes', () => {
  assert.match(server, /app\.post\('\/api\/meet\/sfu\/token', requireAuth/);
  assert.match(server, /p\.state='admitted'/);
  assert.match(server, /r\.expires_at > NOW\(\)/);
  assert.match(server, /code:'meet_admission_required'/);
});

test('los tokens Meet son temporales y no exponen el secreto LiveKit', () => {
  assert.match(server, /room = `vobix-meet-\$\{roomId\}`/);
  assert.match(server, /expiresIn:'10m'/);
  assert.match(server, /issuer:sfu\.apiKey/);
  assert.doesNotMatch(server, /res\.json\([^\n]*apiSecret/);
});

test('las salas de 1000 limitan la emisión a anfitriones y moderadores', () => {
  assert.match(server, /membership\.role === 'owner' \|\| membership\.role === 'moderator'/);
  assert.match(server, /canSubscribe:true/);
  assert.match(server, /roomAdmin:membership\.role === 'owner'/);
});
