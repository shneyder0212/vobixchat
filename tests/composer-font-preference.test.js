'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const chat = fs.readFileSync(path.join(__dirname, '..', 'public', 'chat.html'), 'utf8');
const layers = fs.readFileSync(path.join(__dirname, '..', 'core', 'vobix-layers.js'), 'utf8');

test('la escritura comienza pequeña y ofrece tres tamaños', () => {
  assert.match(chat, /let storedFontSize = 'small'/);
  assert.match(chat, /CHAT_FONT_SIZE_STORAGE_KEY = 'vobixchat_font_size_v2'/);
  assert.match(chat, /localStorage\.getItem\(CHAT_FONT_SIZE_STORAGE_KEY\) \|\| 'small'/);
  for (const size of ['small', 'normal', 'large']) {
    assert.match(chat, new RegExp(`data-font-size="${size}"`));
  }
});

test('la preferencia también cambia las letras del compositor', () => {
  assert.match(chat, /body\.vobixFontSmall #messageInput \{ font-size: 15px; \}/);
  assert.match(chat, /body\.vobixFontNormal #messageInput \{ font-size: 16px; \}/);
  assert.match(chat, /body\.vobixFontLarge #messageInput \{ font-size: 18px; \}/);
  assert.match(chat, /@supports \(-webkit-touch-callout: none\)[\s\S]{0,120}font-size: 16px/);
});

test('la Capa 143 queda registrada', () => {
  assert.match(layers, /id:'143'.*Escritura Compacta Configurable/);
});
