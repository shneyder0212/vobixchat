'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const chat = fs.readFileSync(path.join(__dirname, '..', 'public', 'chat.html'), 'utf8');
const layers = fs.readFileSync(path.join(__dirname, '..', 'core', 'vobix-layers.js'), 'utf8');

test('la cámara móvil solicita una fotografía nueva con la cámara trasera', () => {
  assert.match(chat, /id="chatCameraInput"[\s\S]{0,160}accept="image\/\*"[\s\S]{0,100}capture="environment"/);
  assert.match(chat, /uploadChatAttachment\(file, 'image', \{ originSource: 'vobix-camera' \}\)/);
  assert.doesNotMatch(chat, /id="chatCameraInput"[\s\S]{0,160}accept="image\/\*,video\/\*"/);
});

test('fotos y documentos se envían sin la ventana de confirmación rutinaria', () => {
  assert.doesNotMatch(chat, /function confirmAttachmentSend/);
  assert.doesNotMatch(chat, /¿Enviar este \$\{label\}\?/);
});

test('los documentos muestran formato conocido, nombre compacto y tamaño', () => {
  for (const format of ['PDF', 'WORD', 'EXCEL', 'POWERPOINT', 'ZIP']) {
    assert.match(chat, new RegExp(`label: '${format}'`));
  }
  assert.match(chat, /className = 'chatDocumentName'/);
  assert.match(chat, /createDocumentDetails\(fileName, file, message\)/);
  assert.match(chat, /readableFileSize\(size\)/);
  assert.doesNotMatch(chat, /function confirmDocumentDownload/);
});

test('la Capa 141 queda registrada', () => {
  assert.match(layers, /id:'141'.*Cámara Directa y Documentos Claros/);
});
