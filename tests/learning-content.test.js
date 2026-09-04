'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const learn = require('../core/vobix-learn');
const content = require('../core/learning-content');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('todos los idiomas tienen preparación lingüística propia', () => {
  for (const course of learn.COURSES) {
    const pack = content.PACKS[course.key];
    assert.ok(pack, `falta preparación para ${course.key}`);
    assert.ok(pack.vocabulary.length >= 12);
    assert.ok(pack.verbs.length >= 5);
    assert.ok(pack.grammar.length >= 7);
    assert.ok(pack.pronunciation.length >= 3);
  }
});

test('inglés americano y británico no son cursos duplicados', () => {
  assert.notDeepEqual(content.PACKS['english-us'].vocabulary, content.PACKS['english-uk'].vocabulary);
  assert.notDeepEqual(content.PACKS['english-us'].pronunciation, content.PACKS['english-uk'].pronunciation);
  assert.match(content.PACKS['english-uk'].vocabulary.flat().join(' '), /flat/);
  assert.match(content.PACKS['english-us'].vocabulary.flat().join(' '), /city/);
});

test('cada material combina vocabulario, gramática, verbos, pronunciación y práctica', () => {
  for (const course of learn.COURSES) {
    const lesson = learn.buildLesson(course.key, 1, 1);
    const material = content.buildLessonMaterial(course, lesson);
    assert.equal(material.vocabulary.length, 8);
    assert.equal(material.verbs.length, 2);
    assert.ok(material.grammar.topic);
    assert.equal(material.practice.spoken, 2);
    assert.equal(material.practice.written, 2);
    assert.equal(material.originalContent, true);
  }
});

test('el servidor entrega contenido autenticado por curso, nivel y lección', () => {
  assert.match(server, /\/api\/learn\/v2\/courses\/:courseKey\/levels\/:levelNumber\/lessons\/:lessonNumber\/content/);
  assert.match(server, /buildLessonMaterial\(course, lesson\)/);
  assert.match(server, /learning_content_not_found/);
});
