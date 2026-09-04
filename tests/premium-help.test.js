'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const help = require('../core/premium-help');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('todos los servicios Premium tienen guía autoservicio local', () => {
  for (const id of ['meet','remote','verify-sign','trade','business']) {
    assert.ok(help.localPremiumHelp(id, 'cómo empiezo'));
    assert.ok(help.localPremiumHelp(id, 'seguridad'));
  }
});

test('la ayuda rechaza secretos y datos financieros', () => {
  assert.equal(help.containsSensitiveData('mi PIN es 123456'), true);
  assert.equal(help.containsSensitiveData('cómo creo una reunión'), false);
});

test('la IA es opcional y siempre conserva respaldo local', () => {
  assert.match(server, /VOBIX_AI_API_URL/);
  assert.match(server, /source:'local-guide'/);
  assert.match(server, /source:'configured-ai'/);
  assert.match(server, /AbortSignal\.timeout\(15000\)/);
  assert.match(server, /attempts\.length >= 20/);
});
