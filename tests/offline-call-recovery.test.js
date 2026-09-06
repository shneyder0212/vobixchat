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

test('los tonos imitan un teléfono y se detienen al conectar', () => {
  assert.match(chat, /\[425, 450\]\.forEach\(frequency/);
  assert.match(chat, /setInterval\(playOutgoingRingPulse, 3200\)/);
  assert.match(chat, /\[440, 480\]\.forEach\(frequency/);
  assert.match(chat, /setInterval\(playIncomingCallSound, 3000\)/);
  assert.match(chat, /state === 'connected'[\s\S]{0,100}stopOutgoingRing\(\)/);
  assert.match(chat, /function stopAllCallSignals\(\)[\s\S]{0,420}navigator\.vibrate\(0\)/);
});

test('el llamante ve y oye la llamada antes de esperar red o permisos', () => {
  const start = chat.slice(chat.indexOf('async function startCall'), chat.indexOf('function bindImmediateCallButton'));
  assert.match(start, /unlockAudio\(\)/);
  assert.match(start, /showCallScreen\(type\)[\s\S]{0,300}startOutgoingRing\(\)[\s\S]{0,180}waitForCallSocket/);
  assert.match(chat, /Llamando.*userName\(app\.peer\)/);
  assert.match(chat, /no está disponible en estos momentos/);
  assert.match(chat, /function waitForCallSocket/);
});

test('la oferta llega al servidor antes de pedir permisos multimedia', () => {
  const start = chat.slice(chat.indexOf('async function startCall'), chat.indexOf('function bindImmediateCallButton'));
  const offerIndex = start.indexOf("'call:offer'");
  const mediaIndex = start.lastIndexOf('await prepareCallMedia(type)');
  assert.ok(offerIndex > 0, 'debe emitir call:offer');
  assert.ok(mediaIndex > offerIndex, 'en navegadores modernos debe avisar al destinatario antes de abrir la media');
  assert.match(start, /prepareOutgoingCallTransceivers\(pc, type\)/);
  assert.match(start, /app\.callOfferAcknowledged = true;[\s\S]{0,100}flushPendingLocalIceCandidates\(\)/);
});

test('los candidatos ICE esperan la confirmación de la llamada', () => {
  const connection = chat.slice(
    chat.indexOf('function createPeerConnection()'),
    chat.indexOf('CONEXIONES ADICIONALES PARA LLAMADAS')
  );
  assert.match(connection, /app\.callDirection === 'outgoing' && !app\.callOfferAcknowledged/);
  assert.match(connection, /app\.pendingLocalIceCandidates\.push/);
  assert.match(connection, /function flushPendingLocalIceCandidates\(\)/);
});

test('el diagnóstico físico registra cada etapa sin contenido de conversaciones', () => {
  assert.match(chat, /function reportClientDiagnostic/);
  assert.match(chat, /'call_tapped'/);
  assert.match(chat, /'call_socket_ready'/);
  assert.match(chat, /'call_offer_created'/);
  assert.match(chat, /'call_offer_accepted'/);
  assert.match(chat, /'call_media_ready'/);
  assert.match(chat, /'call_start_error'/);
  assert.match(server, /app\.post\('\/api\/client-diagnostic', requireAuth/);
  const route = server.slice(server.indexOf("app.post('/api/client-diagnostic'"), server.indexOf("app.get('/api/network-probe'"));
  assert.doesNotMatch(route, /message\.content|conversation\.content|req\.body\.token/);
  assert.match(route, /rate\.count > 60/);
});

test('la conexión usa el tipo de llamada guardado y no una variable inexistente', () => {
  const connection = chat.slice(
    chat.indexOf('function createPeerConnection()'),
    chat.indexOf('CONEXIONES ADICIONALES PARA LLAMADAS')
  );
  assert.match(connection, /app\.localMediaType === app\.callType/);
  assert.match(connection, /attachLocalCallStream\(app\.localStream, app\.callType\)/);
  assert.doesNotMatch(connection, /localMediaType === type/);
});

test('una llamada entrante suena aunque el usuario esté mirando otro chat', () => {
  const incoming = chat.slice(
    chat.indexOf('function handleIncomingCallOffer'),
    chat.indexOf('RECUPERAR LLAMADA PERDIDA DURANTE DESCONEXIÓN')
  );
  assert.doesNotMatch(incoming, /declineIncomingOffer\(payload, 'unavailable'\)/);
  assert.match(incoming, /showIncomingCallPanel\(payload\)/);
  assert.match(chat, /app\.callPeer = payload\?\.caller \|\| payload\?\.sender \|\| app\.peer/);
});

test('los tonos básicos quedan activos y siguen siendo configurables', () => {
  assert.match(chat, /function playOutgoingRingPulse\(\) \{\s*if \(!app\.callSound\) return;/);
  assert.match(chat, /id="outgoingMessageSoundSwitch" class="vobixSwitch on"/);
  assert.match(chat, /vobix_sound_defaults_v2/);
  assert.match(chat, /readBooleanPreference\('vobix_outgoing_message_sound', true\)/);
  assert.match(chat, /async function useReadyAudio/);
  assert.match(chat, /bindPrivacySwitch\(elements\.outgoingMessageSoundSwitch, 'outgoingMessageSound'/);
  assert.match(chat, /function playOutgoingMessageSound\(\) \{\s*if \(!app\.outgoingMessageSound\) return;/);
  assert.match(chat, /Foto enviada'[\s\S]{0,100}playOutgoingMessageSound\(\)/);
  assert.match(chat, /Nota de voz enviada'[\s\S]{0,100}playOutgoingMessageSound\(\)/);
});

test('una desconexión móvil breve no destruye la llamada', () => {
  const disconnect = server.slice(
    server.indexOf("socket.on(\n      'disconnect'"),
    server.indexOf("// AHORA SÍ CERRAMOS io.on('connection')")
  );
  assert.match(disconnect, /new Promise\(resolve => setTimeout\(resolve, 15000\)\)/);
  assert.match(disconnect, /if \(isUserOnline\(userId\)\) return;/);
  assert.match(server, /VOBIXCHAT \| CALL OFFER/);
  assert.match(server, /VOBIXCHAT \| CALL ANSWER/);
});

test('las capas 145, 146 y 164 quedan registradas', () => {
  assert.match(layers, /id:'145'.*Llamada Recuperable sin Conexión/);
  assert.match(layers, /id:'146'.*Selector de Cámara para Fotos/);
  assert.match(layers, /id:'164'.*Señalización de Llamada Primero/);
});
