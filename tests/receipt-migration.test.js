'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.js'), 'utf8');

test('migración de recibos es aditiva e idempotente', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS message_receipts/);
  assert.match(schema, /ADD COLUMN IF NOT EXISTS message_id UUID REFERENCES messages\(id\)/);
  assert.match(schema, /ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users\(id\)/);
  assert.match(schema, /ALTER TABLE message_receipts\s+ADD COLUMN IF NOT EXISTS delivered_at/);
  assert.match(schema, /ALTER TABLE message_receipts\s+ADD COLUMN IF NOT EXISTS read_at/);
  assert.match(schema, /ADD COLUMN IF NOT EXISTS created_at/);
});

test('migración garantiza unicidad e índice por usuario', () => {
  assert.match(schema, /CREATE UNIQUE INDEX IF NOT EXISTS message_receipts_message_user_unique/);
  assert.match(schema, /ON message_receipts\(message_id,user_id\)/);
  assert.match(schema, /CREATE INDEX IF NOT EXISTS message_receipts_user_idx/);
  assert.match(schema, /recibos de mensajes verificados/);
});
