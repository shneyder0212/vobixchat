'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const preferences = require('../core/learning-preferences');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.js'), 'utf8');

test('cada alumno puede elegir tema accesible y voz del tutor', () => {
  const value = preferences.normalizeLearningPreferences({
    theme:'ocean-blue', darkMode:true, highContrast:true,
    tutorVoice:'male', accent:'en-GB', voiceSpeed:'slow'
  });
  assert.deepEqual(value, {
    theme:'ocean-blue', darkMode:true, highContrast:true,
    tutorVoice:'male', accent:'en-GB', voiceSpeed:'slow'
  });
});

test('preferencias manipuladas regresan a valores seguros', () => {
  assert.deepEqual(preferences.normalizeLearningPreferences({theme:'script', tutorVoice:'clone', accent:'x', voiceSpeed:'99'}), {
    theme:'vobix-green', darkMode:false, highContrast:false,
    tutorVoice:'female', accent:'auto', voiceSpeed:'normal'
  });
});

test('la configuración se guarda de forma privada por usuario', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS learning_preferences/);
  assert.match(schema, /user_id UUID PRIMARY KEY REFERENCES users/);
  assert.match(server, /\/api\/learn\/v2\/preferences/);
  assert.match(server, /WHERE user_id=\$1 LIMIT 1/);
});
