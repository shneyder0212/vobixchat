'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function answerHandler() {
  const server = read('server.js');
  return server.slice(server.indexOf("socket.on('call:answer'"), server.indexOf("socket.on('call:ice'"));
}

test('el primer socket queda registrado como ganador antes de cualquier await', () => {
  const answer = answerHandler();
  assert.match(answer, /if \(call\.answeredSocketId \|\| call\.answeredBy\)/);
  assert.match(answer, /call\.answeredBy = currentUserKey/);
  assert.match(answer, /call\.answeredSocketId = socket\.id/);
  const claim = answer.slice(answer.indexOf('if (call.answeredSocketId'), answer.indexOf('call.participants.add'));
  assert.equal(claim.includes('await '), false);
});

test('respuestas duplicadas o de otro dispositivo se rechazan', () => {
  const answer = answerHandler();
  assert.match(answer, /code:'call_already_answered'/);
  assert.match(answer, /answeredSocketId:call\.answeredSocketId \|\| null/);
  assert.ok(answer.indexOf('call_already_answered') < answer.indexOf("emit('call:answer'"));
});

test('la reanudación también bloquea una llamada ya atendida y avisa al usuario', () => {
  const server = read('server.js');
  const resume = server.slice(server.indexOf("socket.on('call:resume'"), server.indexOf("socket.on('call:captions-consent'"));
  assert.match(resume, /call\.answeredSocketId \|\| call\.answeredBy/);
  assert.match(resume, /io\.to\(userRoom\(userId\)\)\.emit\('call:accepted-device'/);
  assert.match(resume, /code:'call_already_answered'/);
});

test('el cliente evita doble aceptación y limpia los dispositivos perdedores', () => {
  const html = read('public/chat.html');
  const accept = html.slice(html.indexOf('async function acceptPendingCall'), html.indexOf('function rejectPendingCall'));
  const device = html.slice(html.indexOf('function handleCallAcceptedOnDevice'), html.indexOf('/* =====================================================\n       RECIBIR ICE'));
  assert.match(accept, /if \(app\.acceptingCall\) return/);
  assert.match(accept, /app\.acceptingCall = true/);
  assert.match(device, /stopAllCallSignals\(\)/);
  assert.match(device, /hideIncomingCallPanel\(\)/);
  assert.match(device, /clearCallTimeout\(\)/);
});

test('la capa 129 está registrada', () => {
  assert.match(read('core/vobix-layers.js'), /id:'129'.*Un Solo Dispositivo Atiende/);
});