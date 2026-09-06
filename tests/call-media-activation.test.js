'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function callMediaBlock(html) {
  return html.slice(html.indexOf('function createPeerConnection'), html.indexOf('function applyAdaptiveCallEncoding'));
}

function peerConnectionBlock(html) {
  return html.slice(
    html.indexOf('function createPeerConnection'),
    html.indexOf('function closeGroupPeerConnection')
  );
}

function answerBlock(html) {
  return html.slice(html.indexOf('async function acceptPendingCall'), html.indexOf('function rejectPendingCall'));
}

test('la llamada de voz usa audio remoto y reproduce tras metadata', () => {
  const html = read('public/chat.html');
  assert.match(html, /id="remoteAudio"[\s\S]{0,120}autoplay[\s\S]{0,120}playsinline/);
  assert.match(html, /app\.callType === 'audio' \? elements\.remoteAudio : elements\.remoteVideo/);
  assert.match(html, /mediaElement\.onloadedmetadata = \(\) =>/);
  assert.match(html, /await mediaElement\.play\(\)/);
});

test('la videollamada asocia vídeo local y remoto sin pantalla negra', () => {
  const html = read('public/chat.html');
  const media = callMediaBlock(html);
  assert.match(html, /id="localVideo"[\s\S]{0,140}autoplay[\s\S]{0,140}muted[\s\S]{0,140}playsinline/);
  assert.match(html, /function attachLocalCallStream\(stream, type\)/);
  assert.match(html, /function attachRemoteCallStream\(stream, callId\)/);
  assert.match(media, /pc\.ontrack/);
  assert.match(media, /attachRemoteCallStream\(stream, connectionCallId\)/);
  assert.match(html, /scheduleRemoteVideoPlaybackCheck\(\)/);
});

test('los permisos rechazados liberan la captura y finalizan la contestación', () => {
  const html = read('public/chat.html');
  const answer = answerBlock(html);
  assert.match(html, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(html, /stopMediaStream\(app\.localStream\)/);
  assert.match(answer, /catch \(error\)[\s\S]{0,600}callMediaErrorMessage[\s\S]{0,260}endLocalCall\(true\)/);
});

test('la reproducción bloqueada muestra estado y permite reintento explícito', () => {
  const html = read('public/chat.html');
  assert.match(html, /app\.remotePlaybackPending = true/);
  assert.match(html, /Audio recibido en espera: toca para activar/);
  assert.match(html, /app\.localPlaybackPending = true/);
  assert.match(html, /Vídeo local en espera: toca tu imagen para activar/);
  assert.match(html, /ensureRemoteAudioPlayback\(true\)/);
  assert.match(html, /ensureLocalVideoPlayback\(true\)/);
});

test('la contestación no crea una segunda conexión ni captura duplicada', () => {
  const html = read('public/chat.html');
  const media = peerConnectionBlock(html);
  assert.match(html, /if \(app\.acceptingCall\) return/);
  assert.match(html, /if \(\s*app\.peerConnection\s*\)/);
  assert.match(html, /return app\.peerConnection/);
  assert.match(html, /if \(app\.localStream && app\.localMediaType === app\.callType\)/);
  assert.doesNotMatch(media, /return app\.localStream/);
  assert.match(media, /pc\.addTrack\([\s\S]{0,120}track,[\s\S]{0,120}app\.localStream/);
  assert.match(media, /return pc/);
});

test('la limpieza al colgar detiene pistas, cierra WebRTC y limpia elementos', () => {
  const html = read('public/chat.html');
  const ending = html.slice(html.indexOf('function endLocalCall'), html.indexOf('/* =====================================================\n       BOTÓN COLGAR'));
  assert.match(ending, /stopAllCallSignals\(\)/);
  assert.match(ending, /peerConnection[\s\S]{0,500}\.close\(\)/);
  assert.match(ending, /stopMediaStream\(app\.localStream\)/);
  assert.match(ending, /hideCallScreen\(\)/);
  assert.match(html, /remoteAudio\.srcObject = null/);
  assert.match(html, /localVideo\.onloadedmetadata = null/);
});

test('el llamante siempre conserva el control rojo para colgar', () => {
  const html = read('public/chat.html');
  assert.match(html, /#endCallButton[\s\S]{0,320}order: -1/);
  assert.match(html, /#endCallButton[\s\S]{0,420}visibility: visible !important/);
  assert.match(html, /elements\.endCallButton\.hidden = false/);
  assert.match(html, /addEventListener\('pointerup', endCallFromControl\)/);
  assert.match(html, /reportClientDiagnostic\('call_end_tapped'/);
});

test('el altavoz usa el puente Android y salida compatible del navegador', () => {
  const html = read('public/chat.html');
  const android = read('android/app/src/main/java/com/vobixchat/mobile/MainActivity.kt');
  assert.match(html, /VobixNative\?\.setSpeakerphoneOn/);
  assert.match(html, /navigator\.mediaDevices\?\.selectAudioOutput/);
  assert.match(html, /mediaElement\.setSinkId/);
  assert.match(android, /fun setSpeakerphoneOn\(enabled: Boolean\): Boolean/);
  assert.match(android, /AudioManager\.MODE_IN_COMMUNICATION/);
  assert.match(android, /TYPE_BUILTIN_SPEAKER/);
  assert.match(android, /setCommunicationDevice\(speaker\)/);
});

test('la capa 167 identifica los controles permanentes de llamada', () => {
  assert.match(read('core/vobix-layers.js'), /id:'167'.*Controles Permanentes de Llamada y Altavoz.*status:'en_validacion'/);
});

test('offer, answer e ICE tardíos no sustituyen la llamada activa', () => {
  const html = read('public/chat.html');
  const media = callMediaBlock(html);
  assert.match(html, /function isCurrentCallMedia\(callId, connection\)/);
  assert.match(media, /!isCurrentCallMedia\(connectionCallId, pc\)/);
  assert.match(html, /hasEndedCallId\(answerCallId\)/);
  assert.match(html, /hasEndedCallId\(candidateCallId\)/);
  assert.match(html, /hasEndedCallId\(incomingCallId\)/);
});

test('la capa 131 queda registrada', () => {
  assert.match(read('core/vobix-layers.js'), /id:'131'.*Audio y Vídeo Activos al Contestar/);
});
