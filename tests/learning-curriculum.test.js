'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const learn = require('../core/vobix-learn');

test('cada idioma ofrece 20 niveles y 400 lecciones desde principiante a profesional', () => {
  assert.ok(learn.COURSES.length >= 10);
  assert.equal(learn.LEVEL_COUNT, 20);
  assert.equal(learn.LESSONS_PER_LEVEL, 20);
  for (const course of learn.catalogSummary()) {
    assert.equal(course.totalLessons, 400);
    assert.equal(course.pathway, 'beginner-to-professional');
  }
});

test('incluye las seis rutas solicitadas y variantes separadas de inglés', () => {
  const keys = new Set(learn.COURSES.map(course=>course.key));
  for (const key of ['spanish','english-us','english-uk','italian','french','german']) {
    assert.equal(keys.has(key), true);
  }
  assert.notEqual(learn.getCourse('english-us').locale, learn.getCourse('english-uk').locale);
});

test('cada lección exige dos prácticas escritas y dos habladas', () => {
  const lesson = learn.buildLesson('english-us', 1, 1);
  assert.equal(lesson.assessments.length, 4);
  assert.equal(lesson.assessments.filter(item=>item.mode==='written').length, 2);
  assert.equal(lesson.assessments.filter(item=>item.mode==='spoken').length, 2);
  assert.equal(lesson.passingScore, 80);
  assert.equal(lesson.finalExam.questionCount, 20);
  assert.equal(lesson.finalExam.language, 'en');
  assert.equal(lesson.finalExam.requiredToUnlockNext, true);
});

test('la estructura completa y el examen final se aplican a todos los idiomas', () => {
  for (const course of learn.COURSES) {
    for (const levelNumber of [1, 10, 20]) {
      const level = learn.buildLevel(course.key, levelNumber);
      assert.equal(level.lessons.length, 20);
      for (const lesson of level.lessons) {
        assert.equal(lesson.assessments.length, 4);
        assert.equal(lesson.finalExam.requiredToUnlockNext, true);
        assert.equal(lesson.finalExam.language, 'en');
        assert.ok(lesson.estimatedMinutes >= 25 && lesson.estimatedMinutes <= 30);
      }
    }
  }
});

test('cada lección dura entre 25 y 30 minutos y enseña contenido completo', () => {
  for (const level of [1,10,20]) {
    const lesson = learn.buildLesson('english-uk', level, 1);
    assert.ok(lesson.estimatedMinutes >= 25 && lesson.estimatedMinutes <= 30);
    for (const activity of ['vocabulary','grammar','verbs','listen','speak','write','review']) {
      assert.equal(lesson.segments.some(segment=>segment.activity===activity), true);
    }
    assert.equal(lesson.motivation.mistakeReview, true);
  }
});

test('los exámenes están en inglés y la ayuda inicial puede explicarse en español', () => {
  assert.equal(learn.buildLesson('french', 1, 1).assessmentLanguage, 'en');
  assert.equal(learn.buildLesson('german', 1, 1).instructionsLanguage, 'es');
  assert.equal(learn.buildLesson('german', 10, 1).instructionsLanguage, 'en');
});

test('los identificadores son deterministas y los límites se rechazan', () => {
  assert.equal(learn.lessonKey(1,1), 'n01-l01');
  assert.equal(learn.lessonKey(20,20), 'n20-l20');
  assert.equal(learn.buildLesson('english-us',21,1), null);
  assert.equal(learn.buildLesson('unknown',1,1), null);
});
