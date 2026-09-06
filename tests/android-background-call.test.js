'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Android declara un servicio de cámara y micrófono para la llamada activa', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /android\.permission\.FOREGROUND_SERVICE_CAMERA/);
  assert.match(manifest, /android\.permission\.FOREGROUND_SERVICE_MICROPHONE/);
  assert.match(manifest, /android:name="\.CallKeepAliveService"/);
  assert.match(manifest, /android:foregroundServiceType="camera\|microphone"/);
});

test('la APK mantiene la llamada y permite volver desde su notificación', () => {
  const service = read('android/app/src/main/java/com/vobixchat/mobile/CallKeepAliveService.kt');
  const activity = read('android/app/src/main/java/com/vobixchat/mobile/MainActivity.kt');
  assert.match(service, /startForeground\(NOTIFICATION_ID, notification\)/);
  assert.match(service, /return START_STICKY/);
  assert.match(service, /vobix_resume_call/);
  assert.match(activity, /fun setCallActive\(active: Boolean, type: String\)/);
  assert.match(activity, /CallKeepAliveService\.start/);
  assert.match(activity, /CallKeepAliveService\.stop/);
});

test('la videollamada usa ventana flotante al pulsar Inicio', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  const activity = read('android/app/src/main/java/com/vobixchat/mobile/MainActivity.kt');
  assert.match(manifest, /android:supportsPictureInPicture="true"/);
  assert.match(activity, /override fun onUserLeaveHint\(\)/);
  assert.match(activity, /enterPictureInPictureMode/);
});

test('la web activa el servicio después de obtener media y lo detiene al colgar', () => {
  const html = read('public/chat.html');
  const prepare = html.slice(html.indexOf('async function prepareCallMedia'), html.indexOf('function callMediaErrorMessage'));
  const ending = html.slice(html.indexOf('function endLocalCall'), html.indexOf('BOTÓN COLGAR'));
  assert.match(html, /function setNativeCallActive/);
  assert.match(prepare, /setNativeCallActive\(true, type\)/);
  assert.match(ending, /setNativeCallActive\(false\)/);
  assert.match(read('core/vobix-layers.js'), /id:'177'.*Llamadas Activas en Segundo Plano/);
});
