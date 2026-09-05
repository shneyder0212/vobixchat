'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('recuerda y recupera una conversación activa por usuario', () => {
  const html = read('public/chat.html');
  assert.match(html, /ACTIVE_CONVERSATION_KEY_PREFIX/);
  assert.match(html, /function rememberActiveConversation\(conversation\)/);
  assert.match(html, /function preferredConversation\(conversations\)/);
  assert.match(html, /rememberActiveConversation\(conversation\)/);
});

test('la bandeja activa el último chat o el más reciente al cargar', () => {
  const html = read('public/chat.html');
  assert.match(html, /app\.conversations = conversations;[\s\S]{0,400}if \(!app\.conversation\) \{\s*ensureActiveConversation\(\)/);
  assert.match(html, /return \[\.\.\.available\]\.sort/);
  assert.match(html, /app\.conversations = cachedConversations;[\s\S]{0,180}ensureActiveConversation\(\)/);
});

test('todos los controles protegidos recuperan destinatario antes de actuar', () => {
  const html = read('public/chat.html');
  const uses = html.match(/if \(!ensureActiveConversation\(\)\) return;/g) || [];
  assert.ok(uses.length >= 5, `se esperaban al menos 5 controles protegidos y hay ${uses.length}`);
  assert.match(html, /elements\.documentButton\?\.addEventListener[\s\S]{0,180}ensureActiveConversation/);
  assert.match(html, /elements\.cameraButton\?\.addEventListener[\s\S]{0,180}ensureActiveConversation/);
  assert.match(html, /async function sendCurrentMessage\(\)[\s\S]{0,900}ensureActiveConversation/);
  assert.match(html, /async function startVoiceRecording\(\)[\s\S]{0,700}ensureActiveConversation/);
  assert.match(html, /async function startCall\([\s\S]{0,900}ensureActiveConversation/);
});

test('la Capa 136 queda registrada sin retirar las capas anteriores', () => {
  const layers = read('core/vobix-layers.js');
  assert.match(layers, /id:'134'/);
  assert.match(layers, /id:'135'/);
  assert.match(layers, /id:'136'.*Conversación Activa Recuperable/);
});
