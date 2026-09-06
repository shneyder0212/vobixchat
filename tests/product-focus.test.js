'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('el centro visible se concentra en las tres prioridades elegidas', () => {
  const menu = read('public/vobix-menu.html');
  assert.match(menu, /Senior, Familia y Niños/);
  assert.match(menu, /Motor Anti-Estafas/);
  assert.match(menu, /Vobix Business/);
  assert.doesNotMatch(menu, /href="\/learn\.html"/);
  assert.doesNotMatch(menu, /service=meet/);
  assert.doesNotMatch(menu, /service=politics/);
  assert.doesNotMatch(menu, /Social \/ Parejas/);
});

test('la configuración comercial visible ofrece solo Business', () => {
  const center = read('public/centro-config.html');
  assert.match(center, /id:'business'/);
  assert.doesNotMatch(center, /id:'meet'/);
  assert.doesNotMatch(center, /id:'politics'/);
});

test('las funciones aparcadas conservan su código y las llamadas normales siguen conectadas', () => {
  assert.match(read('server.js'), /app\.post\('\/api\/meet\/join'/);
  assert.match(read('public/chat.html'), /id="audioCallButton"/);
  assert.match(read('public/chat.html'), /id="videoCallButton"/);
  assert.match(read('public/learn.html'), /Vobix Te Enseña/);
  assert.match(read('core/vobix-layers.js'), /id:'160'.*status:'aparcada'/);
});
