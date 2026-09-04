'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const center = fs.readFileSync(path.join(__dirname, '..', 'public', 'centro-config.html'), 'utf8');
const menu = fs.readFileSync(path.join(__dirname, '..', 'public', 'vobix-menu.html'), 'utf8');
const { CAPABILITIES } = require('../core/vobix-premium');

test('el centro Premium sincroniza la configuración con la cuenta', () => {
  assert.doesNotMatch(center, /vobix_center_config_/);
  assert.match(center, /\/api\/premium\/services\/'\+encodeURIComponent\(id\)\+'\/setup/);
  assert.match(center, /method:'PUT'/);
  assert.match(center, /displayName:/);
  assert.match(center, /setupState:/);
  assert.match(center, /onboardingStep:/);
});

test('el autoservicio ofrece ayuda y advierte contra secretos', () => {
  assert.match(center, /\/help/);
  assert.match(center, /method:'POST'/);
  assert.match(center, /sensitive_data_rejected/);
  assert.match(center, /No escribas contraseñas, PIN, códigos ni datos bancarios/);
});

test('todos los servicios mostrados para configurar existen en el catálogo', () => {
  const configurable = new Set(CAPABILITIES.filter(item => item.id !== 'chat').map(item => item.id));
  const ids = [...center.matchAll(/\{id:'([^']+)'/g)].map(match => match[1]);
  const linkedIds = [...menu.matchAll(/centro-config\.html\?service=([^"&]+)/g)].map(match => match[1]);
  assert.ok(ids.length >= 9);
  ids.forEach(id => assert.ok(configurable.has(id), `capacidad desconocida: ${id}`));
  linkedIds.forEach(id => assert.ok(ids.includes(id), `enlace sin configuración: ${id}`));
});

test('el menú usa la oferta comercial honesta de Vobix', () => {
  assert.match(menu, /Vobix Plus/);
  assert.match(menu, /Vobix Meet Pro/);
  assert.match(menu, /Vobix Política/);
  assert.match(menu, /DISEÑO REGULATORIO/);
  assert.doesNotMatch(menu, /service=verify(?:["&])/);
  assert.doesNotMatch(menu, /service=campaigns/);
});
