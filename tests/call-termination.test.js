'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  buildCallEndedPayload,
  terminateCall
} = require('../core/call-termination');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function createIo(events) {
  return {
    to(room) {
      return {
        emit(event, payload) {
          events.push({ room, event, payload });
        }
      };
    }
  };
}

function createCall() {
  return {
    callerId: 'caller',
    participants: new Set(['caller', 'answerer']),
    invited: new Set(['backup'])
  };
}

test('finaliza y notifica a todos los dispositivos con payload autorizado', () => {
  const activeCalls = new Map([['call_13001', createCall()]]);
  const endedCalls = new Map();
  const events = [];

  const result = terminateCall({
    activeCalls,
    endedCalls,
    io: createIo(events),
    userRoom: userId => `user:${userId}`,
    callId: 'call_13001',
    endedBy: 'answerer',
    reason: 'rejected'
  });

  assert.equal(result.ended, true);
  assert.deepEqual(result.payload, {
    callId: 'call_13001',
    reason: 'rejected',
    endedBy: 'answerer'
  });
  assert.equal(activeCalls.has('call_13001'), false);
  assert.equal(events.length, 3);
  assert.deepEqual(events.map(event => event.room).sort(), ['user:answerer', 'user:backup', 'user:caller']);
  assert.ok(events.every(event => event.event === 'call:ended'));
});

test('la doble finalización es idempotente y no vuelve a emitir', () => {
  const activeCalls = new Map([['call_13002', createCall()]]);
  const endedCalls = new Map();
  const events = [];
  const dependencies = {
    activeCalls,
    endedCalls,
    io: createIo(events),
    userRoom: userId => `user:${userId}`,
    callId: 'call_13002',
    endedBy: 'caller',
    reason: 'cancelled'
  };

  assert.equal(terminateCall(dependencies).ended, true);
  const second = terminateCall(dependencies);

  assert.equal(second.ended, false);
  assert.equal(second.code, 'call_already_ended');
  assert.equal(events.length, 3);
});

test('normaliza motivos desconocidos sin exponer estados arbitrarios', () => {
  assert.deepEqual(
    buildCallEndedPayload('call_13003', 'u1', 'forged-status'),
    { callId: 'call_13003', reason: 'ended', endedBy: 'u1' }
  );
});

test('el servidor usa terminación autorizada y bloquea señalización tardía', () => {
  const server = read('server.js');
  assert.match(server, /socket\.on\('call:end', async/);
  assert.match(server, /endActiveCall\(callId, userId, payload\.reason \|\| 'ended'\)/);
  assert.match(server, /endedCalls\.has\(callId\)/);
  assert.match(server, /call:end:legacy/);
  assert.match(server, /call_already_ended/);
  assert.match(server, /endActiveCall\(callId, call\.endedBy \|\| null, 'expired'\)/);
});

test('el cliente detiene la llamada completa y descarta eventos tardíos', () => {
  const html = read('public/chat.html');
  const ending = html.slice(html.indexOf('function endLocalCall'), html.indexOf('/* =====================================================\n       BOTÓN COLGAR'));
  assert.match(ending, /stopAllCallSignals\(\)/);
  assert.match(ending, /peerConnection[\s\S]{0,500}\.close\(\)/);
  assert.match(ending, /stopMediaStream\(app\.localStream\)/);
  assert.match(ending, /rememberEndedCallId\(oldCallId\)/);
  assert.match(html, /function handleRemoteCallEnd/);
  assert.match(html, /function rememberEndedCallId/);
  assert.match(html, /hasEndedCallId\(candidateCallId\)/);
  assert.match(html, /hasEndedCallId\(answerCallId\)/);
});

test('la capa 130 queda registrada', () => {
  assert.match(read('core/vobix-layers.js'), /id:'130'.*Finalización Sincronizada de Llamadas/);
});
