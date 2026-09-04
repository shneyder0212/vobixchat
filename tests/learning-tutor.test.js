'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const tutor = require('../core/learning-tutor');
const learn = require('../core/vobix-learn');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('el tutor local adapta su guía al nivel del alumno', () => {
  const course = learn.getCourse('italian');
  const beginner = tutor.localTutorReply({course,lesson:learn.buildLesson('italian',1,1),question:'Help'});
  const expert = tutor.localTutorReply({course,lesson:learn.buildLesson('italian',20,1),question:'Help'});
  assert.notEqual(beginner, expert);
  assert.match(beginner, /A0/);
  assert.match(expert, /C2\.2/);
});

test('el tutor IA no entrega respuestas de exámenes ni solicita datos privados', () => {
  const prompt = tutor.tutorSystemPrompt(learn.getCourse('french'), learn.buildLesson('french',3,2));
  assert.match(prompt, /never provide direct answers/i);
  assert.match(prompt, /Never request passwords/i);
  assert.match(prompt, /Student level: A1\.2/);
});

test('la API del tutor limita abuso y mantiene respaldo local', () => {
  assert.match(server, /\/api\/learn\/v2\/tutor/);
  assert.match(server, /learningTutorRate/);
  assert.match(server, /tutor_rate_limited/);
  assert.match(server, /source:'local-tutor'/);
  assert.match(server, /AbortSignal\.timeout\(9000\)/);
});
