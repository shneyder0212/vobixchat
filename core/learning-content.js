'use strict';

const PACKS = Object.freeze({
  'english-us': {
    pronunciation:['Rhotic /r/ in car and work','Flapped /t/ in water','Short /æ/ in can'],
    vocabulary:[['hello','hello'],['please','please'],['thanks','thank you'],['family','family'],['work','work'],['food','food'],['city','city'],['today','today'],['learn','learn'],['help','help'],['friend','friend'],['home','home']],
    verbs:[['be','to exist or identify'],['have','to possess'],['go','to move'],['do','to perform'],['speak','to communicate orally']],
    grammar:['Subject pronouns and be','Present simple','Past simple','Future forms','Conditionals','Professional register','Nuance and idiomatic control'],
    model:['Hello, my name is Alex.','I am learning American English.','Could you help me, please?']
  },
  'english-uk': {
    pronunciation:['Non-rhotic /r/ in many accents','Clear /t/ in careful speech','Long /ɑː/ in bath'],
    vocabulary:[['hello','hello'],['please','please'],['cheers','thanks'],['family','family'],['work','work'],['flat','apartment'],['city centre','downtown'],['today','today'],['learn','learn'],['help','help'],['friend','friend'],['holiday','vacation']],
    verbs:[['be','to exist or identify'],['have','to possess'],['go','to move'],['do','to perform'],['speak','to communicate orally']],
    grammar:['Subject pronouns and be','Present simple','Past simple and present perfect','Future forms','Conditionals','Formal British register','Nuance and idiomatic control'],
    model:['Hello, my name is Alex.','I am learning British English.','Could you help me, please?']
  },
  spanish: {
    pronunciation:['Five stable vowel sounds','Rolled and tapped r','Silent h'],
    vocabulary:[['hola','hello'],['por favor','please'],['gracias','thank you'],['familia','family'],['trabajo','work'],['comida','food'],['ciudad','city'],['hoy','today'],['aprender','learn'],['ayuda','help'],['amigo','friend'],['casa','home']],
    verbs:[['ser','to be: identity'],['estar','to be: state'],['tener','to have'],['ir','to go'],['hablar','to speak']],
    grammar:['Gender, articles and ser','Present tense','Past tenses','Future and commands','Subjunctive foundations','Professional register','Nuance and idiomatic control'],
    model:['Hola, me llamo Alex.','Estoy aprendiendo español.','¿Puede ayudarme, por favor?']
  },
  italian: {
    pronunciation:['Pure Italian vowels','Double consonants matter','Pronounce every written vowel'],
    vocabulary:[['ciao','hello'],['per favore','please'],['grazie','thank you'],['famiglia','family'],['lavoro','work'],['cibo','food'],['città','city'],['oggi','today'],['imparare','learn'],['aiuto','help'],['amico','friend'],['casa','home']],
    verbs:[['essere','to be'],['avere','to have'],['andare','to go'],['fare','to do or make'],['parlare','to speak']],
    grammar:['Gender, articles and essere','Present tense','Past tenses','Future and commands','Conditional and subjunctive','Professional register','Nuance and idiomatic control'],
    model:['Ciao, mi chiamo Alex.','Sto imparando l’italiano.','Può aiutarmi, per favore?']
  },
  french: {
    pronunciation:['French nasal vowels','Many final consonants are silent','Liaison connects selected words'],
    vocabulary:[['bonjour','hello'],['s’il vous plaît','please'],['merci','thank you'],['famille','family'],['travail','work'],['nourriture','food'],['ville','city'],['aujourd’hui','today'],['apprendre','learn'],['aide','help'],['ami','friend'],['maison','home']],
    verbs:[['être','to be'],['avoir','to have'],['aller','to go'],['faire','to do or make'],['parler','to speak']],
    grammar:['Gender, articles and être','Present tense','Past tenses','Future and commands','Conditional and subjunctive','Professional register','Nuance and idiomatic control'],
    model:['Bonjour, je m’appelle Alex.','J’apprends le français.','Pouvez-vous m’aider, s’il vous plaît ?']
  },
  german: {
    pronunciation:['Consistent German vowels','Final consonant devoicing','Stress often falls on the root'],
    vocabulary:[['hallo','hello'],['bitte','please'],['danke','thank you'],['Familie','family'],['Arbeit','work'],['Essen','food'],['Stadt','city'],['heute','today'],['lernen','learn'],['Hilfe','help'],['Freund','friend'],['Haus','home']],
    verbs:[['sein','to be'],['haben','to have'],['gehen','to go'],['machen','to do or make'],['sprechen','to speak']],
    grammar:['Nouns, gender and sein','Present tense and word order','Cases and past forms','Future and subordinate clauses','Konjunktiv and passive','Professional register','Nuance and idiomatic control'],
    model:['Hallo, ich heiße Alex.','Ich lerne Deutsch.','Können Sie mir bitte helfen?']
  },
  portuguese: {
    pronunciation:['Open and closed vowels','Nasal vowel sounds','European unstressed vowels reduce'],
    vocabulary:[['olá','hello'],['por favor','please'],['obrigado','thank you'],['família','family'],['trabalho','work'],['comida','food'],['cidade','city'],['hoje','today'],['aprender','learn'],['ajuda','help'],['amigo','friend'],['casa','home']],
    verbs:[['ser','to be: identity'],['estar','to be: state'],['ter','to have'],['ir','to go'],['falar','to speak']],
    grammar:['Gender, articles and ser','Present tense','Past tenses','Future and commands','Personal infinitive and subjunctive','Professional register','Nuance and idiomatic control'],
    model:['Olá, chamo-me Alex.','Estou a aprender português.','Pode ajudar-me, por favor?']
  },
  dutch: {
    pronunciation:['Dutch g is produced in the throat','Distinguish long and short vowels','Final consonants devoice'],
    vocabulary:[['hallo','hello'],['alstublieft','please'],['dank u','thank you'],['familie','family'],['werk','work'],['eten','food'],['stad','city'],['vandaag','today'],['leren','learn'],['hulp','help'],['vriend','friend'],['huis','home']],
    verbs:[['zijn','to be'],['hebben','to have'],['gaan','to go'],['doen','to do'],['spreken','to speak']],
    grammar:['Articles, pronouns and zijn','Present tense','Past and perfect tenses','Future and separable verbs','Subordinate word order','Professional register','Nuance and idiomatic control'],
    model:['Hallo, ik heet Alex.','Ik leer Nederlands.','Kunt u mij alstublieft helpen?']
  },
  japanese: {
    pronunciation:['Five stable vowel sounds','Mora timing','Pitch can distinguish words'],
    vocabulary:[['こんにちは','hello'],['お願いします','please'],['ありがとう','thank you'],['家族','family'],['仕事','work'],['食べ物','food'],['町','town'],['今日','today'],['学ぶ','learn'],['助け','help'],['友達','friend'],['家','home']],
    verbs:[['です','to be: polite copula'],['ある・いる','to exist or have'],['行く','to go'],['する','to do'],['話す','to speak']],
    grammar:['Scripts, particles and です','Polite present forms','Past forms and counters','Plans and requests','Plain forms and clauses','Professional politeness','Nuance and natural control'],
    model:['こんにちは、アレックスです。','日本語を勉強しています。','手伝ってください。']
  },
  mandarin: {
    pronunciation:['Four lexical tones plus neutral tone','Pinyin initials and finals','Tone changes in connected speech'],
    vocabulary:[['你好','hello'],['请','please'],['谢谢','thank you'],['家人','family'],['工作','work'],['食物','food'],['城市','city'],['今天','today'],['学习','learn'],['帮助','help'],['朋友','friend'],['家','home']],
    verbs:[['是','to be'],['有','to have'],['去','to go'],['做','to do'],['说','to speak']],
    grammar:['Pinyin, tones and 是','Basic word order','Aspect and time expressions','Plans and complements','把 and 被 structures','Professional register','Nuance and natural control'],
    model:['你好，我叫Alex。','我在学习普通话。','请帮助我。']
  }
});

function grammarIndex(cefr) {
  if (cefr === 'A0') return 0;
  const band = String(cefr || '').charAt(0);
  return ({A:1,B:3,C:5})[band] ?? 0;
}

function rotate(items, offset, count) {
  return Array.from({length:Math.min(count,items.length)},(_,index)=>items[(offset+index)%items.length]);
}

function buildLessonMaterial(course, lesson) {
  const pack = PACKS[course.key];
  if (!pack || !lesson) return null;
  const offset = ((lesson.levelNumber - 1) * 20 + lesson.number - 1);
  const vocabulary = rotate(pack.vocabulary, offset, 8).map(([term,meaning])=>({term,meaning}));
  const verbs = rotate(pack.verbs, offset, 2).map(([verb,meaning])=>({verb,meaning}));
  const grammar = pack.grammar[Math.min(pack.grammar.length-1, grammarIndex(lesson.cefr))];
  return {
    courseKey:course.key,
    lessonKey:lesson.key,
    level:lesson.cefr,
    targetLocale:course.locale,
    durationMinutes:lesson.estimatedMinutes,
    vocabulary,
    grammar:{topic:grammar,explanationLanguage:lesson.instructionsLanguage},
    verbs,
    pronunciation:rotate(pack.pronunciation, offset, 2),
    modelSentences:rotate(pack.model, offset, 3),
    dialogue:{turns:4,mode:'listen-repeat-roleplay'},
    practice:{spoken:2,written:2,instantFeedback:true,mistakeReview:true},
    originalContent:true
  };
}

module.exports = { PACKS, buildLessonMaterial };
