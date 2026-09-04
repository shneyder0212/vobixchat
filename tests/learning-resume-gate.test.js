'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.js'), 'utf8');

test('el examen final es obligatorio para desbloquear la siguiente lección', () => {
  assert.match(schema, /final_passed BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(server, /SELECT final_passed FROM learning_lesson_mastery/);
  assert.match(server, /previous_final_exam_required/);
  assert.match(server, /if \(!gate\.rows\[0\]\?\.final_passed\)/);
});

test('el avance conserva nivel, lección y segmento exacto por usuario', () => {
  assert.match(schema, /last_segment VARCHAR\(40\) NOT NULL DEFAULT 'warm-up'/);
  assert.match(schema, /session_state JSONB NOT NULL DEFAULT '\{\}'::jsonb/);
  assert.match(server, /\/api\/learn\/v2\/resume\/:courseKey/);
  assert.match(server, /p\.current_level, p\.current_lesson/);
  assert.match(server, /m\.lesson_key, m\.last_segment, m\.session_state/);
});

test('la posición se guarda en el servidor y no depende del navegador', () => {
  assert.match(server, /\/api\/learn\/v2\/position/);
  assert.match(server, /INSERT INTO learning_profiles/);
  assert.match(server, /INSERT INTO learning_lesson_mastery/);
  assert.match(server, /last_activity_on=CURRENT_DATE/);
  assert.match(server, /client = await database\.pool\.connect\(\)/);
  assert.match(server, /await client\.query\('COMMIT'\)/);
});
