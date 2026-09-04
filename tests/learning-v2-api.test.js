'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.js'), 'utf8');

test('la API v2 entrega un catálogo ligero y niveles bajo demanda', () => {
  assert.match(server, /\/api\/learn\/v2\/catalog/);
  assert.match(server, /\/api\/learn\/v2\/courses\/:courseKey\/levels\/:levelNumber/);
  assert.match(server, /vobixLearn\.catalogSummary\(\)/);
  assert.match(server, /vobixLearn\.buildLevel/);
});

test('los requisitos declaran dos pruebas escritas y dos habladas en inglés', () => {
  assert.match(server, /writtenAssessments:2/);
  assert.match(server, /spokenAssessments:2/);
  assert.match(server, /assessmentLanguage:'en'/);
});

test('cada alumno tiene perfil, racha, experiencia y cola privada de repaso', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS learning_profiles/);
  assert.match(schema, /PRIMARY KEY \(user_id, course_key\)/);
  assert.match(schema, /streak_days INTEGER NOT NULL DEFAULT 0/);
  assert.match(schema, /review_queue JSONB NOT NULL/);
});

test('los cuatro tipos de práctica se guardan sin conservar audio crudo', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS learning_activity_attempts/);
  assert.match(schema, /'written-1','spoken-1','written-2','spoken-2'/);
  assert.doesNotMatch(schema, /learning_activity_attempts[\s\S]{0,900}(audio_blob|audio_data|recording_url)/);
});
