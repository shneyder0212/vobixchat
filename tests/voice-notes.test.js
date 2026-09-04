'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('graba notas de voz con permisos, duración y cancelación', () => {
  const html = read('public/chat.html');
  assert.match(html, /navigator\.mediaDevices[\s\S]{0,180}getUserMedia/);
  assert.match(html, /new MediaRecorder\(/);
  assert.match(html, /startRecordingTimer\(\)/);
  assert.match(html, /cancelVoiceRecording/);
  assert.match(html, /app\.recordingCancelled/);
  assert.match(html, /Nota de voz cancelada/);
});

test('la subida conserva el audio y reintenta con el mismo identificador', () => {
  const html = read('public/chat.html');
  assert.match(html, /voiceUploadPending: null/);
  assert.match(html, /app\.voiceUploadPending = \{ blob, clientMessageId, viewOnce, conversationId \}/);
  assert.match(html, /clientMessageId = createCallId\(\)/);
  assert.match(html, /for \(let attempt = 0; attempt < 3; attempt \+= 1\)/);
  assert.match(html, /retryPendingVoiceUpload\(\)/);
  assert.match(html, /sendVoiceBlob\(pending\.blob, pending\.clientMessageId, pending\.viewOnce, pending\.conversationId\)/);
});

test('la entrega usa el mensaje persistido y evita el envío Socket duplicado', () => {
  const html = read('public/chat.html');
  assert.match(html, /if \(uploaded\?\.message\) \{[\s\S]{0,300}renderIncomingMessage\(uploaded\.message\)/);
  assert.doesNotMatch(html, /emit\(\s*['"]chat:voice['"]/);
});

test('la reproducción permite pausa, reanudación, inicio, progreso y errores claros', () => {
  const html = read('public/chat.html');
  assert.match(html, /audio\.controls = true/);
  assert.match(html, /audio\.currentTime = ratio \* audio\.duration/);
  assert.match(html, /audio\.addEventListener\('timeupdate', syncProgress\)/);
  assert.match(html, /No se pudo reproducir esta nota de voz/);
  assert.match(html, /URL\.revokeObjectURL\(temporaryUrl\)/);
});

test('el servidor valida que una nota de voz sea audio y conserva sus límites', () => {
  const routes = read('routes/chat.js');
  assert.match(routes, /mime[\s\S]{0,120}startsWith[\s\S]{0,120}'audio\/'/);
  assert.match(routes, /voice_audio_required/);
  assert.match(routes, /fileSize:\s*50 \* 1024 \* 1024/);
  assert.match(routes, /socketCanAccessConversation|conversationId/);
  assert.match(routes, /sender_user_id/);
  assert.match(routes, /client_message_id/);
});

test('una sola vista sigue siendo compatible con notas de voz', () => {
  const html = read('public/chat.html');
  const routes = read('routes/chat.js');
  assert.match(html, /viewOnce\) form\.append\('viewOnce', 'true'\)/);
  assert.match(html, /renderViewOnceGate\(message, mine, 'voice'\)/);
  assert.match(routes, /\['image', 'video', 'voice', 'audio'\]\.includes\(messageType\)/);
});

test('la limpieza libera recorder, micrófono, timer, chunks y URLs temporales', () => {
  const html = read('public/chat.html');
  assert.match(html, /function resetVoiceRecorderState\(\)/);
  assert.match(html, /app\.mediaRecorder = null/);
  assert.match(html, /stopRecordingTracks\(\)/);
  assert.match(html, /stopRecordingTimer\(\)/);
  assert.match(html, /app\.recordingChunks = \[\]/);
});

test('la Capa 132 queda registrada y las capas WebRTC previas permanecen', () => {
  const layers = read('core/vobix-layers.js');
  assert.match(layers, /id:'127'/);
  assert.match(layers, /id:'128'/);
  assert.match(layers, /id:'129'/);
  assert.match(layers, /id:'130'/);
  assert.match(layers, /id:'132'.*Notas de Voz Fiables/);
});
