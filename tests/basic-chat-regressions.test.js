'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const chat = fs.readFileSync(path.join(root, 'public', 'chat.html'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'routes', 'chat.js'), 'utf8');
const android = fs.readFileSync(path.join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'vobixchat', 'mobile', 'MainActivity.kt'), 'utf8');
const manifest = fs.readFileSync(path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');

test('el mensaje aparece antes de esperar la confirmación HTTP', () => {
  const start = chat.indexOf('async function sendCurrentMessage()');
  const end = chat.indexOf('MICRO / NOTA DE VOZ', start);
  const send = chat.slice(start, end);
  const optimistic = send.indexOf("status: 'sending'");
  const request = send.indexOf("'/api/chat/messages'");
  assert.ok(optimistic > 0, 'falta el mensaje optimista');
  assert.ok(request > optimistic, 'la petición empezó antes de pintar el mensaje');
  assert.match(send, /updateMessageStatus\(\{ clientMessageId: payload\.clientMessageId \}, 'sent'\)/);
});

test('el botón de cámara abre la cámara integrada', () => {
  const start = chat.indexOf("elements.cameraButton?.addEventListener('click'");
  const end = chat.indexOf('function closeCameraChoice()', start);
  const handler = chat.slice(start, end);
  assert.match(handler, /openIntegratedCamera\(\)/);
  assert.match(chat, /id="integratedCameraPreview"/);
  assert.match(chat, /id="integratedCameraShutter"/);
  assert.match(chat, /id="integratedCameraGallery"/);
});

test('traducir solo aparece dentro de las opciones del mensaje', () => {
  const render = chat.slice(chat.indexOf('function renderTextMessage'), chat.indexOf('function renderPhotoMessage'));
  assert.doesNotMatch(render, /addMessageTranslationControl\(bubble/);
  assert.match(render, /translateButton\.textContent = '🌐 Traducir'/);
  assert.match(render, /actions\.append\(translateButton\)/);
});

test('vaciar un chat lo oculta del historial hasta que llegue otro mensaje', () => {
  assert.match(routes, /WHERE\s+me\.cleared_at IS NULL\s+OR last_message\.id IS NOT NULL/);
});

test('Android atiende cámara y galería nativas sin pedir multimedia al arrancar', () => {
  assert.match(android, /override fun onShowFileChooser/);
  assert.match(android, /Intent\(MediaStore\.ACTION_IMAGE_CAPTURE\)/);
  assert.match(android, /Intent\(MediaStore\.ACTION_VIDEO_CAPTURE\)/);
  assert.match(android, /Intent\(Intent\.ACTION_OPEN_DOCUMENT\)/);
  const onCreate = android.slice(android.indexOf('override fun onCreate'), android.indexOf('override fun onNewIntent'));
  assert.doesNotMatch(onCreate, /requestNeededPermissions/);
  assert.match(manifest, /androidx\.core\.content\.FileProvider/);
});
