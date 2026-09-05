'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('el menú principal abre un centro de permisos comprensible', () => {
  const inbox = read('public/inbox.html');
  assert.match(inbox, /id="bubblePermissions"[^>]*>.*Permisos/s);
  assert.match(inbox, /id="permissionsSettingsView"/);
  assert.match(inbox, /id="cameraPermissionStatus"/);
  assert.match(inbox, /id="microphonePermissionStatus"/);
  assert.match(inbox, /id="notificationPermissionStatus"/);
});

test('cámara y micrófono se solicitan juntos y las pistas se liberan', () => {
  const inbox = read('public/inbox.html');
  assert.match(inbox, /navigator\.mediaDevices\.getUserMedia\(\{audio:/);
  assert.match(inbox, /getVideoTracks\(\)\.length>0/);
  assert.match(inbox, /getAudioTracks\(\)\.length>0/);
  assert.match(inbox, /stream\?\.getTracks\(\)\.forEach\(track=>track\.stop\(\)\)/);
});

test('notificaciones conservan su gesto propio y registran push al concederse', () => {
  const inbox = read('public/inbox.html');
  assert.match(inbox, /Notification\.requestPermission\(\)/);
  assert.match(inbox, /VobixPush\?\.register\?\.\(\)/);
  assert.match(inbox, /Ajustes > Aplicaciones > VOBIXCHAT > Permisos/);
});

test('la conversación permite reabrir manualmente el permiso aunque ya se haya descartado', () => {
  const chat = read('public/chat.html');
  assert.match(chat, /id="openMediaPermissionsButton"/);
  assert.match(chat, /function showMediaPermissionOnboarding\(force = false\)/);
  assert.match(chat, /showMediaPermissionOnboarding\(true\)/);
});

test('la capa de permisos reversibles queda registrada', () => {
  const layers = read('core/vobix-layers.js');
  assert.match(layers, /id:'156'.*Centro de Permisos Reversible/);
});
