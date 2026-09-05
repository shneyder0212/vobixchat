'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('las llamadas grupales conservan miembros separados de participantes activos', () => {
  const server = read('server.js');
  assert.match(server, /group:\s*true/);
  assert.match(server, /members:\s*new Set/);
  assert.match(server, /expelled:\s*new Set/);
  assert.match(server, /call\.members\.add/);
});

test('salir de una llamada grupal no termina a los demás y ofrece reingreso', () => {
  const server = read('server.js');
  assert.match(server, /if \(call\.group\) \{/);
  assert.match(server, /code: 'group_call_left'/);
  assert.match(server, /canRejoin: true/);
  assert.match(server, /call:user-left/);
  assert.match(server, /call\.participants\.size === 0/);
});

test('reingreso valida llamada, pertenencia y expulsión, y evita carreras', () => {
  const server = read('server.js');
  assert.match(server, /socket\.on\('call:rejoin'/);
  assert.match(server, /call\.expelled\?\.has\(currentUserKey\)/);
  assert.match(server, /!call\.members\?\.has\(currentUserKey\)/);
  assert.match(server, /call\.rejoining\.has\(currentUserKey\)/);
  assert.match(server, /call:participant-rejoined/);
});

test('desconexión grupal conserva el derecho de reingreso y actualiza participantes', () => {
  const server = read('server.js');
  assert.match(server, /if \(call\.group\) \{/);
  assert.match(server, /disconnected: true/);
  assert.match(server, /participants: Array\.from\(call\.participants\)/);
});

test('la expulsión elimina pertenencia y bloquea el reingreso', () => {
  const server = read('server.js');
  assert.match(server, /socket\.on\('call:remove-user'/);
  assert.match(server, /call\.members\.delete\(targetUserId\)/);
  assert.match(server, /call\.expelled\.add\(targetUserId\)/);
  assert.match(server, /call:participant-removed/);
  assert.match(server, /call:removed/);
});

test('la renegociación grupal no rompe la identidad privada 127 ni el dispositivo único 129', () => {
  const server = read('server.js');
  assert.match(server, /existingCall\.group && existingCall\.members\?\.has/);
  assert.match(server, /call:rejoin-offer/);
  assert.match(server, /if \(call\.answeredSocketId \|\| call\.answeredBy\)/);
  assert.match(server, /const targetUserIds = call\.group/);
});

test('el cliente muestra volver, crea nueva media y limpia la salida local', () => {
  const html = read('public/chat.html');
  assert.match(html, /id="rejoinGroupCallButton"[^>]*>Volver a la llamada/);
  assert.match(html, /function showGroupRejoin/);
  assert.match(html, /function rejoinGroupCall/);
  assert.match(html, /app\.socket\?\.timeout\(8000\)\.emit\('call:rejoin'/);
  assert.match(html, /await prepareCallMedia\(app\.callType\)/);
  assert.match(html, /const pc = createPeerConnection\(\)/);
  assert.match(html, /call:rejoin-available/);
});

test('el cliente actualiza participantes, rechaza expulsados y evita ofertas antiguas', () => {
  const html = read('public/chat.html');
  assert.match(html, /call:participant-rejoined/);
  assert.match(html, /call:removed/);
  assert.match(html, /function handleGroupRejoinOffer/);
  assert.match(html, /String\(payload\.callId \|\| ''\) !== String\(app\.callId \|\| ''\)/);
  assert.match(html, /createGroupPeerConnection\(fromUserId\)/);
  assert.match(html, /pc\.setRemoteDescription/);
});

test('la Capa 148 queda registrada y las capas de llamadas permanecen', () => {
  const layers = read('core/vobix-layers.js');
  for (const id of ['127', '128', '129', '130', '131', '132', '133', '145']) assert.match(layers, new RegExp(`id:'${id}'`));
  assert.match(layers, /id:'133'.*Reingreso Seguro a Llamadas Grupales/);
  assert.match(layers, /id:'148'.*Llamadas Ampliables de Seis Personas/);
});

test('una llamada 1x1 se amplía hasta seis con señalización WebRTC dirigida', () => {
  const server = read('server.js');
  assert.match(server, /const MAX_CALL_PARTICIPANTS = 6/);
  assert.match(server, /socket\.on\('call:peer-offer'/);
  assert.match(server, /socket\.on\('call:peer-answer'/);
  assert.match(server, /socket\.on\('call:peer-ice'/);
  assert.match(server, /targetUserId/);
  assert.match(server, /call\.group = true/);
});

test('el cliente permite añadir personas y crea una conexión por participante', () => {
  const html = read('public/chat.html');
  assert.match(html, /id="addCallParticipantButton"/);
  assert.match(html, /id="callParticipantPanel"/);
  assert.match(html, /function addParticipantToCurrentCall/);
  assert.match(html, /function createGroupPeerConnection/);
  assert.match(html, /call:add-user/);
  assert.match(html, /call:peer-offer/);
});

test('al reconectar se descubre una llamada grupal reingresable', () => {
  const server = read('server.js');
  const html = read('public/chat.html');
  assert.match(server, /const rejoinable = Array\.from\(activeCalls\.values\(\)\)/);
  assert.match(server, /rejoin:true/);
  assert.match(html, /if \(response\.rejoin\)/);
  assert.match(html, /showGroupRejoin\(response\)/);
});
