'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const htmlPath = process.env.VOBIX_SENIOR_HTML || path.join(__dirname, '..', 'public', 'chat.html');
const html = fs.readFileSync(htmlPath, 'utf8');

test('los scripts embebidos compilan', () => {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1])
    .filter(source => source.trim());
  assert.ok(scripts.length > 0);
  scripts.forEach(source => new Function(source));
});

test('los controles Senior son únicos y completos', () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  [
    'seniorHome', 'seniorFamilyButton', 'seniorCallButton', 'seniorVideoButton',
    'seniorMessagesButton', 'seniorHelpButton', 'seniorReturnButton',
    'openSeniorSettingsButton', 'openSeniorTutorialButton', 'openSeniorAssistantButton'
  ].forEach(id => assert.ok(ids.includes(id), `Falta ${id}`));
});

test('la recuperación no contiene un borrado global', () => {
  assert.equal(/localStorage\.clear\s*\(/.test(html), false);
  assert.match(html, /SENIOR_STORAGE_KEYS\.forEach/);
  assert.match(html, /localStorage\.removeItem\(key\)/);
  assert.match(html, /Sus chats y su cuenta no se modificaron/);
});

test('dictado y ayudante no envían mensajes automáticamente', () => {
  const start = html.indexOf('function startSeniorDictation');
  const end = html.indexOf('function seniorVoiceGuideEnabled', start);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(html.slice(start, end), /sendButton[^\n]*click/);
  assert.match(html, /textContent = lastSeniorAssistantAnswer/);
});

test('las acciones sensibles requieren confirmación', () => {
  assert.match(html, /¿Quieres llamar ahora al 112\?/);
  assert.match(html, /¿Quieres compartir este documento/);
  assert.match(html, /Esta acción no se puede deshacer/);
});
