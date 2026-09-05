'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const push = fs.readFileSync(path.join(root, 'public', 'vobix-push.js'), 'utf8');
const inbox = fs.readFileSync(path.join(root, 'public', 'inbox.html'), 'utf8');
const android = fs.readFileSync(
  path.join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'vobixchat', 'mobile', 'MainActivity.kt'),
  'utf8'
);
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('la APK registra su token Firebase autenticado al cargar y al renovarlo', () => {
  assert.match(push, /VobixNative\?\.getFcmToken/);
  assert.match(push, /fetch\('\/api\/push\/device'/);
  assert.match(push, /vobix:fcm-token/);
  assert.match(push, /registerNativeDevice\(event\?\.detail\?\.token\)/);
});

test('las notificaciones Android se piden solo desde el botón de permisos', () => {
  assert.match(android, /fun requestNotificationPermission\(\)/);
  assert.match(android, /Manifest\.permission\.POST_NOTIFICATIONS/);
  assert.match(inbox, /requestNotificationPermission/);
  assert.match(inbox, /vobix:native-notification-permission/);
});

test('salud informa si TURN, avisos Android y R2 están configurados sin revelar secretos', () => {
  assert.match(server, /turnRelayConfigured/);
  assert.match(server, /androidCallPush/);
  assert.match(server, /mediaStorageConfigured/);
  assert.match(server, /mediaStorageConfigured:\s*r2Storage\.isConfigured\(\)/);
  const health = server.slice(server.indexOf("'/api/health'"), server.indexOf('// AUTENTICACIÓN DE SOCKET.IO'));
  assert.doesNotMatch(health, /TURN_CREDENTIAL\s*:/);
  assert.doesNotMatch(health, /FIREBASE_SERVICE_ACCOUNT_JSON\s*:/);
});
