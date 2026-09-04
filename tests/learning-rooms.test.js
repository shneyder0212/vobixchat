'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.js'), 'utf8');

test('cada sala práctica pertenece a un usuario y curso', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS learning_practice_rooms/);
  assert.match(schema, /owner_id UUID NOT NULL REFERENCES users\(id\)/);
  assert.match(schema, /course_key VARCHAR\(60\) NOT NULL/);
});

test('las invitaciones son privadas, limitadas y requieren el mismo curso', () => {
  assert.match(server, /\/api\/learn\/v2\/rooms\/:roomId\/invite/);
  assert.match(server, /learning_profiles WHERE user_id=\$1 AND course_key=\$2/);
  assert.match(server, /learning_room_full/);
  assert.match(server, /FOR UPDATE/);
});

test('solo el dueño invita y cada invitado acepta o rechaza por sí mismo', () => {
  assert.match(server, /owner_id=\$2 AND status='active'/);
  assert.match(server, /learning_room_owner_required/);
  assert.match(server, /\/api\/learn\/v2\/rooms\/:roomId\/respond/);
  assert.match(server, /user_id=\$2 AND state='invited'/);
});

test('la sala mantiene grupos pequeños para practicar con calidad', () => {
  assert.match(schema, /max_participants BETWEEN 2 AND 12/);
  assert.match(server, /Math\.max\(2, Math\.min\(12/);
});
