'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('the inbox exposes a confirmed per-device logout in both mobile entry points', () => {
  const inbox = read('public/inbox.html');
  assert.match(inbox, /id="bubbleLogout"[^>]*>.*Cerrar sesión/s);
  assert.match(inbox, /id="logoutDeviceButton"[^>]*>.*Cerrar sesión en este dispositivo/s);
  assert.match(inbox, /window\.confirm\('¿Cerrar sesión en este dispositivo\?/);
  assert.match(inbox, /fetch\('\/api\/auth\/logout'/);
  assert.match(inbox, /VobixPush\?\.unregister\?\.\(\)/);
  assert.match(inbox, /location\.replace\('\/\?logout=1'\)/);
});

test('the conversation logout revokes remote access and clears all auth aliases', () => {
  const chat = read('public/chat.html');
  assert.match(chat, /id="logoutButton"/);
  assert.match(chat, /fetch\('\/api\/auth\/logout'/);
  assert.match(chat, /VobixPush\?\.unregister\?\.\(\)/);
  assert.match(chat, /'vobixToken', 'authToken'/);
  assert.match(chat, /window\.location\.replace\('\/\?logout=1'\)/);
});

test('push is removed from this device before local authentication disappears', () => {
  const push = read('public/vobix-push.js');
  assert.match(push, /async function unregisterPush\(\)/);
  assert.match(push, /fetch\('\/api\/push\/unsubscribe'/);
  assert.match(push, /subscription\.unsubscribe\(\)/);
  assert.match(push, /unregister: unregisterPush/);
});

test('installed mobile layouts reserve system bars without brand-specific fixed offsets', () => {
  const inbox = read('public/inbox.html');
  const chat = read('public/chat.html');
  for (const html of [inbox, chat]) {
    assert.match(html, /display-mode: standalone/);
    assert.match(html, /--vobix-safe-top:max\(env\(safe-area-inset-top\),28px\)|--vobix-safe-top: max\(env\(safe-area-inset-top\), 28px\)/);
    assert.match(html, /--vobix-safe-bottom:max\(env\(safe-area-inset-bottom\),32px\)|--vobix-safe-bottom: max\(env\(safe-area-inset-bottom\), 32px\)/);
  }
  assert.doesNotMatch(inbox, /padding-top:30px/);
  assert.doesNotMatch(inbox, /bottom:42px/);
});

test('the release catalog records secure logout and cross-device safe areas', () => {
  const layers = read('core/vobix-layers.js');
  assert.match(layers, /id:'152'.*Sesión Cerrada por Dispositivo/);
  assert.match(layers, /id:'153'.*Zonas Seguras Multidispositivo/);
});

test('the server revokes the presented session token on both logout routes', () => {
  const server = read('server.js');
  assert.match(server, /app\.post\(\s*'\/api\/logout',[\s\S]*?await revokeSession\(token\)/);
  assert.match(server, /app\.post\(\s*'\/api\/auth\/logout',[\s\S]*?await revokeSession\(token\)/);
});
