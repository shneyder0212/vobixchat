'use strict';

function localTutorReply({course, lesson, question}) {
  const level = lesson.cefr;
  const target = course.nativeName;
  const cleanQuestion = String(question || '').trim();
  if (!cleanQuestion) return `Start with one short sentence in ${target}. I will help you step by step.`;
  if (lesson.levelNumber <= 5) {
    return `Level ${level}: use a short sentence, listen once, repeat it twice, and write it without looking. I can explain the correction in simple Spanish.`;
  }
  if (lesson.levelNumber <= 13) {
    return `Level ${level}: answer with two connected sentences in ${target}. Check meaning, word order, and pronunciation, then try again without reading.`;
  }
  return `Level ${level}: give a precise professional response in ${target}, support it with one reason, and revise register, fluency, and accuracy.`;
}

function tutorSystemPrompt(course, lesson) {
  return [
    'You are Vobix Tutor, a patient professional language coach.',
    `Target language: ${course.nativeName} (${course.locale}). Student level: ${lesson.cefr}.`,
    `Lesson objective: ${lesson.objective}`,
    'Adapt vocabulary and sentence length strictly to the student level.',
    'The assessment interface is in English. Beginner explanations may be in simple Spanish.',
    'Teach with hints and examples, but never provide direct answers to an active assessment.',
    'Correct one issue at a time and finish with one short practice action.',
    'Never request passwords, payment data, identity documents, addresses, or private information.',
    'Maximum 160 words.'
  ].join(' ');
}

module.exports = { localTutorReply, tutorSystemPrompt };
