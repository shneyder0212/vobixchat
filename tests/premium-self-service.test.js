'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const premium = require('../core/vobix-premium');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.js'), 'utf8');

test('todos los servicios Premium reconocidos permiten preparación autoservicio', () => {
  for (const id of ['meet', 'remote', 'verify-sign', 'trade', 'business']) {
    assert.equal(premium.isConfigurableCapability(id), true);
  }
  assert.equal(premium.isConfigurableCapability('inventado'), false);
});

test('la configuración autoservicio se guarda por usuario y servicio', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS premium_service_settings/);
  assert.match(schema, /PRIMARY KEY \(user_id, capability_id\)/);
  assert.match(server, /\/api\/premium\/services\/:capabilityId\/setup/);
  assert.match(server, /ON CONFLICT \(user_id, capability_id\) DO UPDATE/);
});

test('el servidor limita campos, estados y progreso del autoservicio', () => {
  assert.match(server, /new Set\(\['draft', 'ready', 'paused'\]\)/);
  assert.match(server, /\.slice\(0, 80\)/);
  assert.match(server, /Math\.max\(0, Math\.min\(20/);
});
