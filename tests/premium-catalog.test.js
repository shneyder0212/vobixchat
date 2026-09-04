'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const premium = require('../core/vobix-premium');
const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('el catálogo define los tres planes sin habilitar cobros', () => {
  assert.deepEqual(premium.PLANS.map(plan => plan.id), ['free', 'premium', 'business']);
  assert.equal(premium.getPremiumCatalog().billingEnabled, false);
  assert.ok(premium.PLANS.every(plan => plan.billingEnabled === false));
});

test('los permisos respetan la jerarquía de planes', () => {
  assert.equal(premium.planAllows('free', 'premium'), false);
  assert.equal(premium.planAllows('premium', 'premium'), true);
  assert.equal(premium.planAllows('business', 'premium'), true);
  assert.equal(premium.normalizePlan('manipulado'), 'free');
});

test('un módulo preparado nunca se presenta como operativo', () => {
  const catalog = premium.getPremiumCatalog('business');
  const meet = catalog.capabilities.find(item => item.id === 'meet');
  const chat = catalog.capabilities.find(item => item.id === 'chat');
  assert.equal(meet.entitled, true);
  assert.equal(meet.available, false);
  assert.equal(meet.reason, 'service_not_operational');
  assert.equal(chat.available, true);
});

test('las rutas Premium requieren autenticación y evitan caché', () => {
  assert.match(serverSource, /app\.get\(['"]\/api\/premium\/catalog['"], requireAuth/);
  assert.match(serverSource, /app\.get\(['"]\/api\/premium\/me['"], requireAuth/);
  assert.match(serverSource, /Cache-Control['"], ['"]no-store/);
});
