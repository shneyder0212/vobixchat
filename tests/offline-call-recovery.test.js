'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const chat = fs.readFileSync(path.join(root, 'public', 'chat.html'), 'utf8');
const layers = fs.readFileSync(path.join(root, 'core', 'vobix-layers.js'), 'utf8');

test('el servidor entrega la oferta pendiente al usuario invitado que reconecta', () => {
  const pending = server.slice(server.indexOf("socket.on('call:pending'"), server.indexOf("socket.on('call:captions-consent'"));
  assert.match(pending, /call\.invited\?\.has\(currentUserKey\)/);
  assert.match(pending, /offer:pending\.offer/);
  assert.match(pending, /candidates:\(pending\.pendingIce \|\| \[\]\)/);
});

test('el chat recupera llamadas desde Push o al volver la conexión', () => {
  assert.match(chat, /recoverPendingIncomingCall\(\)/);
  assert.match(chat, /launchCallId \? 'call:resume' : 'call:pending'/);
  assert.match(chat, /handleIncomingCallOffer\(\{[\s\S]{0,140}recoveredFromOffline:true/);
  assert.match(chat, /<script src="\/vobix-push\.js"><\/script>/);
});

test('el tono de espera es suave y se detiene al conectar', () => {
  assert.match(chat, /exponentialRampToValueAtTime\(\.045/);
  assert.match(chat, /setInterval\(playOutgoingRingPulse, 2600\)/);
  assert.match(chat, /state === 'connected'[\s\S]{0,100}stopOutgoingRing\(\)/);
});

test('el llamante ve y oye la llamada antes de esperar red o permisos', () => {
  const start = chat.slice(chat.indexOf('async function startCall'), chat.indexOf('function bindImmediateCallButton'));
  assert.match(start, /unlockAudio\(\)/);
  assert.match(start, /showCallScreen\(type\)[\s\S]{0,300}startOutgoingRing\(\)[\s\S]{0,180}waitForCallSocket/);
  assert.match(chat, /Llamando.*userName\(app\.peer\)/);
  assert.match(chat, /no está disponible en estos momentos/);
  assert.match(chat, /function waitForCallSocket/);
});

test('el tono de llamada saliente está activo y el sonido de mensajes salientes es opcional', () => {
  assert.match(chat, /function playOutgoingRingPulse\(\) \{\s*if \(!app\.callSound\) return;/);
  assert.match(chat, /id="outgoingMessageSoundSwitch" class="vobixSwitch"/);
  assert.match(chat, /readBooleanPreference\('vobix_outgoing_message_sound', false\)/);
  assert.match(chat, /bindPrivacySwitch\(elements\.outgoingMessageSoundSwitch, 'outgoingMessageSound'/);
  assert.match(chat, /function playOutgoingMessageSound\(\) \{\s*if \(!app\.outgoingMessageSound\) return;/);
  assert.match(chat, /Foto enviada'[\s\S]{0,100}playOutgoingMessageSound\(\)/);
  assert.match(chat, /Nota de voz enviada'[\s\S]{0,100}playOutgoingMessageSound\(\)/);
});

test('las capas 145 y 146 quedan registradas', () => {
  assert.match(layers, /id:'145'.*Llamada Recuperable sin Conexión/);
  assert.match(layers, /id:'146'.*Selector de Cámara para Fotos/);
});
