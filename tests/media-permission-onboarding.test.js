'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const chat = fs.readFileSync(path.join(__dirname, '..', 'public', 'chat.html'), 'utf8');
const layers = fs.readFileSync(path.join(__dirname, '..', 'core', 'vobix-layers.js'), 'utf8');

test('al entrar aparece una activación explícita de cámara y micrófono', () => {
  assert.match(chat, /id="mediaPermissionPanel"[\s\S]*Activar cámara y micrófono/);
  assert.match(chat, /await loadCurrentUser\(\);[\s\S]{0,260}setTimeout\(showMediaPermissionOnboarding, 180\)/);
  assert.match(chat, /activateMediaPermissionsButton\?\.addEventListener\('click', activateMediaPermissions\)/);
});

test('la activación comprueba ambas pistas y las detiene al terminar', () => {
  assert.match(chat, /getUserMedia\(\{[\s\S]{0,220}audio:[\s\S]{0,220}video:/);
  assert.match(chat, /getAudioTracks\(\)\.length > 0/);
  assert.match(chat, /getVideoTracks\(\)\.length > 0/);
  assert.match(chat, /permissionStream\?\.getTracks\(\)\.forEach\(track => track\.stop\(\)\)/);
});

test('el permiso se recuerda por cuenta y ahora no solo cierra la visita', () => {
  assert.match(chat, /MEDIA_PERMISSION_KEY_PREFIX = 'vobix_media_permissions_v1_'/);
  assert.match(chat, /localStorage\.setItem\(mediaPermissionStorageKey\(\), 'granted'\)/);
  assert.match(chat, /mediaPermissionDismissedForSession = true/);
});

test('el texto del compositor conserva tamaño móvil normal', () => {
  assert.match(chat, /#messageInput \{[\s\S]{0,520}font-size: 16px;[\s\S]{0,100}line-height: 1\.3;/);
});

test('la Capa 142 queda registrada', () => {
  assert.match(layers, /id:'142'.*Permisos Multimedia al Entrar/);
});
