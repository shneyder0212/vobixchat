'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'chat.html'),
  'utf8'
);

test('la caché limita cantidad y tamaño', () => {
  assert.match(html, /\.slice\(0, 100\)/);
  assert.match(html, /new Blob\(\[serialized\]\)\.size > 500000/);
});

test('la caché nueva registra versión y fecha', () => {
  assert.match(html, /version: 1/);
  assert.match(html, /savedAt: Date\.now\(\)/);
  assert.match(html, /conversations: safeConversations/);
});

test('la caché caduca después de siete días', () => {
  assert.match(html, /7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(html, /if \(cacheExpired\)/);
  assert.match(html, /localStorage\.removeItem\(cacheKey\)/);
});

test('mantiene compatibilidad con la caché anterior y descarta registros inválidos', () => {
  assert.match(html, /const legacyConversations = Array\.isArray\(value\) \? value : null/);
  assert.match(html, /typeof item === ['"]object['"] && conversationId\(item\)/);
});

test('la caché queda aislada por usuario y no usa datos globales heredados', () => {
  assert.match(html, /function conversationCacheKey\(\)/);
  assert.match(html, /const owner = userId\(app\.me\)/);
  assert.match(html, /`vobixchat_conversation_cache_\$\{owner\}`/);
  assert.match(html, /if \(!cacheKey\) return \[\]/);
  assert.match(html, /removeLegacyConversationCache\(\)/);
});
