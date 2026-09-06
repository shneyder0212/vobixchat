'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const javaRoot = path.join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'vobixchat', 'mobile');
const service = fs.readFileSync(path.join(javaRoot, 'VobixFirebaseMessagingService.kt'), 'utf8');
const notifications = fs.readFileSync(path.join(javaRoot, 'CallNotifications.kt'), 'utf8');

test('Android muestra mensajes recibidos en primer plano', () => {
  assert.match(service, /CallNotifications\.showMessage/);
  assert.match(notifications, /fun showMessage/);
  assert.match(notifications, /NotificationCompat\.CATEGORY_MESSAGE/);
  assert.match(notifications, /MESSAGE_CHANNEL/);
  assert.match(notifications, /putExtra\("vobix_url", url\)/);
});

test('la rama nativa de llamadas permanece separada', () => {
  assert.match(service, /if \(data\["type"\] == "call" \|\| data\["type"\] == "video-call"\) \{[\s\S]*?showIncomingCall[\s\S]*?return/);
});
