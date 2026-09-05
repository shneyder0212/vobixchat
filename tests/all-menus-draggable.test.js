'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const chat = fs.readFileSync(path.join(root, 'public', 'chat.html'), 'utf8');
const inbox = fs.readFileSync(path.join(root, 'public', 'inbox.html'), 'utf8');
const layers = fs.readFileSync(path.join(root, 'core', 'vobix-layers.js'), 'utf8');

test('todos los tipos principales de menú flotante se preparan para arrastre', () => {
  assert.match(chat, /function makeFloatingMenusDraggable\(\)/);
  assert.match(chat, /\.notificationPanel \.notificationCard/);
  assert.match(chat, /\.profilePanel \.profileCard/);
  assert.match(chat, /\.vxDrawer \.vxCard/);
  assert.match(chat, /\.mediaPermissionPanel \.mediaPermissionCard/);
  assert.match(chat, /\.incomingCallPanel \.incomingCallCard/);
});

test('los menús se mueven en dos ejes, se limitan y recuerdan posición', () => {
  assert.match(chat, /event\.clientX - startX/);
  assert.match(chat, /event\.clientY - startY/);
  assert.match(chat, /window\.innerWidth - base\.right/);
  assert.match(chat, /window\.innerHeight - base\.bottom/);
  assert.match(chat, /localStorage\.setItem\(positionKey/);
});

test('los controles dentro de una cabecera siguen siendo pulsables', () => {
  assert.match(chat, /event\.target\.closest\('button, input, select, textarea, a'\)/);
});

test('la Capa 155 registra todos los menús movibles', () => {
  assert.match(layers, /id:'155'.*Todos los Menús Movibles/);
});

test('la sala principal mueve ajustes, historial, QR y menú burbuja', () => {
  assert.match(inbox, /prepareInboxDraggable\(document\.querySelector\('\.settingsBox'\),document\.querySelector\('\.settingsBox'\)/);
  assert.match(inbox, /prepareInboxDraggable\(document\.querySelector\('\.mobileHistorySheet'/);
  assert.match(inbox, /prepareInboxDraggable\(document\.querySelector\('\.qrShareCard'/);
  assert.match(inbox, /vobix_bubble_position/);
});
