'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'chat.html'), 'utf8');

test('conexión adaptativa combina señal del navegador y sonda Vobix', () => {
  assert.match(html, /navigator\.connection/);
  assert.match(html, /fetch\(['"]\/api\/network-probe['"]/);
  assert.match(html, /app\.networkProbe\.failures < 2/);
  assert.match(html, /source:\s*Number\.isFinite\(browserRtt\)/);
});

test('sonda tiene timeout y reduce actividad con la pantalla oculta', () => {
  assert.match(html, /controller\.abort\(\), 5000/);
  assert.match(html, /document\.hidden \? 120000 : 30000/);
  assert.match(html, /visibilitychange/);
});

test('los tres perfiles de datos siguen disponibles', () => {
  assert.match(html, /return ['"]saver['"]/);
  assert.match(html, /return ['"]balanced['"]/);
  assert.match(html, /return ['"]full['"]/);
  assert.match(html, /Modo audio por señal débil/);
});
