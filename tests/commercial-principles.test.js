'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const premium = require('../core/vobix-premium');
const help = require('../core/premium-help');

test('VobixChat personal permanece gratis y sin publicidad privada', () => {
  assert.equal(premium.COMMERCIAL_PRINCIPLES.privateChatPrice, 'free');
  assert.equal(premium.COMMERCIAL_PRINCIPLES.advertisingInPrivateChats, false);
  assert.equal(premium.COMMERCIAL_PRINCIPLES.sellPrivateConversationData, false);
  const chat = premium.CAPABILITIES.find(item => item.id === 'chat');
  assert.equal(chat.minimumPlan, 'free');
  assert.equal(chat.advertisingInPrivateChats, false);
});

test('Vobix Plus agrupa almacenamiento, traducción e IA sin activar cobros', () => {
  assert.equal(premium.PLANS.find(item => item.id === 'premium').name, 'Vobix Plus');
  for (const id of ['plus-storage','plus-translation','plus-ai']) {
    const capability = premium.CAPABILITIES.find(item => item.id === id);
    assert.equal(capability.minimumPlan, 'premium');
    assert.equal(capability.status, 'preparation');
    assert.ok(help.SERVICE_HELP[id]);
  }
  assert.equal(premium.getPremiumCatalog('free').billingEnabled, false);
});

test('Business, Meet, Política y Trade declaran su alcance con honestidad', () => {
  assert.deepEqual(premium.CAPABILITIES.find(item => item.id === 'business').features, ['catalog','bookings','invoices','multi-agent','analytics']);
  assert.equal(premium.CAPABILITIES.find(item => item.id === 'meet').name, 'Vobix Meet Pro');
  assert.ok(premium.CAPABILITIES.find(item => item.id === 'politics'));
  const trade = premium.CAPABILITIES.find(item => item.id === 'trade');
  assert.equal(trade.isolated, true);
  assert.equal(trade.riskControlsRequired, true);
  assert.equal(trade.status, 'regulated-design');
});
