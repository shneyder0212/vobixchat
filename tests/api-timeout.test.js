'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'chat.html'),
  'utf8'
);

test('las solicitudes del chat tienen un tiempo máximo', () => {
  assert.match(html, /const requestController = new AbortController\(\)/);
  assert.match(html, /bodyIsFormData \? 120000 : 20000/);
  assert.match(html, /requestController\.abort\(\)/);
});

test('un tiempo personalizado queda limitado a un rango seguro', () => {
  assert.match(html, /Math\.max\(1000, Math\.min\(Number\(requestedTimeoutMs\), 180000\)\)/);
});

test('la cancelación de una subida se transmite a la petición interna', () => {
  assert.match(html, /signal: externalSignal/);
  assert.match(html, /externalSignal\?\.addEventListener\?\.\(['"]abort['"], abortFromCaller/);
  assert.match(html, /externalSignal\?\.removeEventListener\?\.\(['"]abort['"], abortFromCaller\)/);
});

test('el usuario recibe un error específico cuando vence el tiempo', () => {
  assert.match(html, /requestTimedOut/);
  assert.match(html, /timeoutError\.code = ['"]VOBIX_TIMEOUT['"]/);
  assert.match(html, /La conexión tardó demasiado/);
});
