'use strict';

const LESSONS_PER_LEVEL = 20;
const LEVEL_COUNT = 20;
const PASSING_SCORE = 80;

const COURSES = Object.freeze([
  {key:'english-us', language:'Inglés americano', nativeName:'American English', icon:'🇺🇸', locale:'en-US', greeting:'Hello'},
  {key:'english-uk', language:'Inglés británico', nativeName:'British English', icon:'🇬🇧', locale:'en-GB', greeting:'Hello'},
  {key:'spanish', language:'Español', nativeName:'Español', icon:'🇪🇸', locale:'es-ES', greeting:'Hola'},
  {key:'italian', language:'Italiano', nativeName:'Italiano', icon:'🇮🇹', locale:'it-IT', greeting:'Ciao'},
  {key:'french', language:'Francés', nativeName:'Français', icon:'🇫🇷', locale:'fr-FR', greeting:'Bonjour'},
  {key:'german', language:'Alemán', nativeName:'Deutsch', icon:'🇩🇪', locale:'de-DE', greeting:'Hallo'},
  {key:'portuguese', language:'Portugués', nativeName:'Português', icon:'🇵🇹', locale:'pt-PT', greeting:'Olá'},
  {key:'dutch', language:'Neerlandés', nativeName:'Nederlands', icon:'🇳🇱', locale:'nl-NL', greeting:'Hallo'},
  {key:'japanese', language:'Japonés', nativeName:'日本語', icon:'🇯🇵', locale:'ja-JP', greeting:'こんにちは'},
  {key:'mandarin', language:'Chino mandarín', nativeName:'普通话', icon:'🇨🇳', locale:'zh-CN', greeting:'你好'}
].map(Object.freeze));

const LEVELS = Object.freeze([
  ['A0','Primer contacto','Recognise and use essential words.'],
  ['A1.1','Saludos e identidad','Introduce yourself in short exchanges.'],
  ['A1.2','Familia y entorno','Describe people and familiar places.'],
  ['A1.3','Rutinas','Talk about everyday actions and time.'],
  ['A1.4','Necesidades básicas','Handle food, shopping and simple requests.'],
  ['A2.1','Moverte por la ciudad','Ask for directions and use transport.'],
  ['A2.2','Planes y experiencias','Discuss plans and recent experiences.'],
  ['A2.3','Conversación social','Maintain a short natural conversation.'],
  ['A2.4','Viajes','Solve common travel situations.'],
  ['B1.1','Trabajo y estudio','Communicate independently at work or school.'],
  ['B1.2','Salud y gestiones','Explain problems and request assistance.'],
  ['B1.3','Historias y opiniones','Narrate events and support an opinion.'],
  ['B1.4','Tecnología y medios','Discuss digital life and current media.'],
  ['B2.1','Fluidez práctica','Interact spontaneously with clear detail.'],
  ['B2.2','Negociación','Compare options and negotiate outcomes.'],
  ['B2.3','Presentaciones','Deliver structured presentations.'],
  ['C1.1','Comunicación avanzada','Use nuanced language in complex contexts.'],
  ['C1.2','Liderazgo profesional','Lead meetings and write formal material.'],
  ['C2.1','Argumentación experta','Debate precisely and respond persuasively.'],
  ['C2.2','Dominio profesional','Operate confidently in expert environments.']
].map((item,index)=>Object.freeze({number:index+1,cefr:item[0],name:item[1],outcome:item[2]})));

const THEMES = Object.freeze([
  'Essential vocabulary','Sounds and pronunciation','Grammar foundations','High-frequency verbs','Useful sentences',
  'Questions and answers','Numbers, dates and time','People and descriptions','Places and directions','Daily actions',
  'Food, shopping and services','Listening laboratory','Guided reading','Guided writing','Speaking workshop',
  'Grammar and verb challenge','Real-life problem solving','Interactive dialogue','Error review and memory','Level mission'
]);

const ASSESSMENT_TYPES = Object.freeze([
  Object.freeze({id:'written-1', mode:'written', title:'Written practice 1'}),
  Object.freeze({id:'spoken-1', mode:'spoken', title:'Spoken practice 1'}),
  Object.freeze({id:'written-2', mode:'written', title:'Written practice 2'}),
  Object.freeze({id:'spoken-2', mode:'spoken', title:'Spoken practice 2'})
]);

function lessonKey(levelNumber, lessonNumber) {
  return `n${String(levelNumber).padStart(2,'0')}-l${String(lessonNumber).padStart(2,'0')}`;
}

function getCourse(courseKey) {
  return COURSES.find(course => course.key === String(courseKey || '').trim()) || null;
}

function getLevelDefinition(levelNumber) {
  const number = Number.parseInt(levelNumber, 10);
  return LEVELS[number - 1] || null;
}

function buildLesson(courseKey, levelNumber, lessonNumber) {
  const course = getCourse(courseKey);
  const level = getLevelDefinition(levelNumber);
  const number = Number.parseInt(lessonNumber, 10);
  if (!course || !level || number < 1 || number > LESSONS_PER_LEVEL) return null;
  const theme = THEMES[number - 1];
  const beginner = level.number <= 5;
  const estimatedMinutes = beginner ? 25 : level.number < 14 ? 28 : 30;
  return {
    key:lessonKey(level.number, number),
    number,
    levelNumber:level.number,
    cefr:level.cefr,
    title:`${theme} · ${level.name}`,
    objective:level.outcome,
    instructionsLanguage:beginner ? 'es' : 'en',
    assessmentLanguage:'en',
    speechLocale:course.locale,
    estimatedMinutes,
    segments:[
      {id:'warm-up', title:'Quick warm-up', minutes:3, activity:'recall'},
      {id:'vocabulary', title:'Vocabulary in context', minutes:5, activity:'vocabulary'},
      {id:'grammar', title:'Grammar made simple', minutes:5, activity:'grammar'},
      {id:'verbs', title:'Verb laboratory', minutes:4, activity:'verbs'},
      {id:'listening', title:'Listen and understand', minutes:4, activity:'listen'},
      {id:'speaking', title:'Speak with confidence', minutes:4, activity:'speak'},
      {id:'writing', title:'Write it yourself', minutes:3, activity:'write'},
      {id:'review', title:'Smart review', minutes:2, activity:'review'}
    ],
    activities:['recall','vocabulary','grammar','verbs','listen','speak','write','review'],
    motivation:{xp:20 + level.number, streakEligible:true, mistakeReview:true, celebration:true},
    assessments:ASSESSMENT_TYPES.map(item=>({...item})),
    passingScore:PASSING_SCORE
  };
}

function buildLevel(courseKey, levelNumber) {
  const course = getCourse(courseKey);
  const level = getLevelDefinition(levelNumber);
  if (!course || !level) return null;
  return {
    ...level,
    courseKey:course.key,
    lessons:Array.from({length:LESSONS_PER_LEVEL},(_,index)=>buildLesson(course.key, level.number, index+1))
  };
}

function catalogSummary() {
  return COURSES.map(course=>({
    ...course,
    levelCount:LEVEL_COUNT,
    lessonsPerLevel:LESSONS_PER_LEVEL,
    totalLessons:LEVEL_COUNT * LESSONS_PER_LEVEL,
    assessmentsPerLesson:ASSESSMENT_TYPES.length,
    pathway:'beginner-to-professional'
  }));
}

module.exports = {
  ASSESSMENT_TYPES,
  COURSES,
  LESSONS_PER_LEVEL,
  LEVELS,
  LEVEL_COUNT,
  PASSING_SCORE,
  THEMES,
  buildLesson,
  buildLevel,
  catalogSummary,
  getCourse,
  getLevelDefinition,
  lessonKey
};
