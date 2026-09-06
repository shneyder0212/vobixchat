'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const chat = fs.readFileSync(path.join(__dirname, '..', 'public', 'chat.html'), 'utf8');

test('el menú conecta los modos prioritarios con controles reales', () => {
  assert.match(chat, /id="openSeniorModeButton"/);
  assert.match(chat, /id="toggleAntiFraudButton"/);
  assert.match(chat, /vobix_antifraud_enabled/);
  assert.match(chat, /id="openFamilyModeButton"/);
  assert.match(chat, /family-recovery\.html/);
  assert.match(chat, /id="openChildModeButton"/);
  assert.match(chat, /child-protection\.html/);
  assert.match(chat, /id="openSafeRouteButton"/);
  assert.match(chat, /protected-route\.html/);
  assert.match(chat, /id="openBusinessButton"/);
  assert.match(chat, /centro-config\.html\?service=business/);
});

test('cada chat abierto termina en el mensaje más reciente', () => {
  const selection = chat.slice(
    chat.indexOf('async function selectConversation'),
    chat.indexOf('LIMPIAR MENSAJES')
  );
  assert.doesNotMatch(selection, /restoreConversationReadPosition/);
  assert.match(selection, /elements\.messages\.scrollTop = elements\.messages\.scrollHeight/);
  assert.match(selection, /requestAnimationFrame\(\(\) => requestAnimationFrame/);
});

test('Anti-Estafas apagado deja de intervenir en enlaces y mensajes', () => {
  assert.match(chat, /antiFraudEnabled\(\) && assessment\.suspicious/);
  assert.match(chat, /const fraudAssessment = antiFraudEnabled\(\)/);
});
