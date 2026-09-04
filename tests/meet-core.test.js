'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const meet = require('../core/vobix-meet');
const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.js'), 'utf8');

test('Meet genera códigos temporales aleatorios y guarda únicamente su hash', () => {
  const first = meet.createMeetingCode();
  const second = meet.createMeetingCode();
  assert.notEqual(first, second);
  assert.ok(first.length >= 8);
  assert.equal(meet.hashMeetingCode(first).length, 64);
  assert.match(schema, /access_code_hash TEXT NOT NULL UNIQUE/);
});

test('Meet limita duración, participantes y longitud del título', () => {
  const options = meet.normalizeMeetingOptions({title:' x '.repeat(200), maxParticipants:999, durationMinutes:999});
  assert.equal(options.title.length <= 120, true);
  assert.equal(options.maxParticipants, 100);
  assert.equal(options.durationMinutes, 240);
});

test('las salas tienen propietario, espera y participantes con roles controlados', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS meet_rooms/);
  assert.match(schema, /owner_id UUID NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS meet_participants/);
  assert.match(schema, /CHECK \(role IN \('owner', 'moderator', 'participant'\)\)/);
  assert.match(schema, /CHECK \(state IN \('invited', 'waiting', 'admitted', 'left', 'removed'\)\)/);
});
