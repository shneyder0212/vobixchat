'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'chat.html'), 'utf8');
const layers = fs.readFileSync(path.join(root, 'core', 'vobix-layers.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('el historial usa un respaldo existente y no oculta errores del servidor', () => {
  assert.match(html, /Number\(firstError\?\.status\) !== 404/);
  assert.match(html, /'\/api\/chat\/messages\/' \+/);
  assert.doesNotMatch(html, /api\/chat\/messages\?conversationId=/);
});

test('las subidas móviles tienen tiempo máximo y reintentos acotados', () => {
  assert.match(html, /for \(let attempt = 0; attempt < 3 && !session; attempt \+= 1\)/);
  assert.match(html, /for \(let attempt = 0; attempt < 3 && !delivered; attempt \+= 1\)/);
  assert.match(html, /timeoutMs: 45000/);
});

test('la nota de voz ofrece detener, enviar o cancelar con controles táctiles', () => {
  assert.match(html, /id="stopVoiceButton"[^>]*>Detener y enviar<\/button>/);
  assert.match(html, /bindVoiceControl\(elements\.stopVoiceButton, stopVoiceRecording\)/);
  assert.match(html, /bindVoiceControl\(elements\.cancelVoiceButton, cancelVoiceRecording\)/);
  assert.match(html, /addEventListener\('pointerdown'/);
});

test('las llamadas cargan STUN y TURN del servidor y fallan sin quedar en limbo', () => {
  assert.match(html, /api\('\/api\/rtc-config', \{ timeoutMs: 10000 \}\)/);
  assert.match(html, /await loadRtcConfiguration\(\)/);
  assert.match(html, /socket\.timeout\(10000\)\.emit/);
  assert.match(html, /El servidor no respondió a la llamada/);
  assert.match(server, /filter\(value => \/\^turns\?:\[\^\\s\]\+\$\/i\.test\(value\)\)/);
});

test('cada conversación abre en el mensaje más reciente aunque cargue contenido multimedia', () => {
  assert.match(html, /function openConversationAtLatest/);
  assert.match(html, /\[80, 250, 700, 1500, 3000\]/);
  assert.match(html, /openConversationAtLatest\(conversation\)/);
  assert.doesNotMatch(html, /saveConversationReadPosition\(\);\s*saveCurrentDraft\(\)/);
});

test('la Capa 138 documenta la recuperación integral en validación', () => {
  assert.match(layers, /id:'138'[\s\S]*Comunicación Móvil sin Bloqueos[\s\S]*status:'en_validacion'/);
});

test('Modo Senior se desactiva con una pulsación visible y sin temporizador', () => {
  assert.match(html, /id="seniorExitButton"[^>]*>Desactivar Modo Senior<\/button>/);
  assert.match(html, /function deactivateSeniorMode/);
  assert.match(html, /seniorExitButton\?\.addEventListener\('pointerdown'/);
  assert.doesNotMatch(html, /Mantén pulsado 3 segundos/);
  assert.doesNotMatch(html, /seniorExitTimer/);
  assert.match(layers, /id:'139'[\s\S]*Salida Directa de Modo Senior[\s\S]*status:'en_validacion'/);
});
