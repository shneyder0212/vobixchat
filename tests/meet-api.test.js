'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('la API Meet exige autenticación y autorización Premium', () => {
  assert.match(server, /app\.get\('\/api\/meet\/rooms', requireAuth, requirePremiumCapability\('meet'\)/);
  assert.match(server, /app\.post\('\/api\/meet\/rooms', requireAuth, requirePremiumCapability\('meet'\)/);
});

test('la creación Meet usa transacción y registra al propietario', () => {
  assert.match(server, /await client\.query\('BEGIN'\)/);
  assert.match(server, /INSERT INTO meet_participants/);
  assert.match(server, /'owner', 'admitted'/);
  assert.match(server, /await client\.query\('COMMIT'\)/);
  assert.match(server, /await client\.query\('ROLLBACK'\)/);
});

test('el código Meet solo se almacena como hash y se devuelve una vez', () => {
  assert.match(server, /const accessCodeHash = hashMeetingCode\(accessCode\)/);
  assert.match(server, /access_code_hash/);
  assert.match(server, /status\(201\)\.json\(\{ ok:true, room:roomResult\.rows\[0\], accessCode \}\)/);
  assert.doesNotMatch(server, /INSERT INTO meet_rooms[\s\S]{0,500}access_code[^_]/);
});

test('la agenda Meet limita fechas inválidas o demasiado lejanas', () => {
  assert.match(server, /code:'invalid_schedule'/);
  assert.match(server, /code:'schedule_too_far'/);
});

test('el ingreso Meet limita intentos, bloquea la sala y respeta el cupo de 1000', () => {
  assert.match(server, /app\.post\('\/api\/meet\/join', requireAuth/);
  assert.match(server, /meetJoinRate/);
  assert.match(server, /meet_join_rate_limited/);
  assert.match(server, /FOR UPDATE/);
  assert.match(server, /meeting_full/);
});

test('la sala de espera admite automáticamente solo cuando corresponde', () => {
  assert.match(server, /room\.owner_id === userId \|\| !room\.waiting_room \? 'admitted' : 'waiting'/);
  assert.match(server, /ON CONFLICT \(room_id, user_id\) DO UPDATE/);
  assert.match(server, /WHEN meet_participants\.role = 'owner' THEN 'admitted'/);
});
