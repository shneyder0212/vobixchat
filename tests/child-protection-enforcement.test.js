'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const chat = read('routes/chat.js');
const server = read('server.js');

function between(source, start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `No se encontró ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `No se encontró ${end}`);
  return source.slice(from, to);
}

test('abrir una conversación consulta la protección infantil',()=>{
  const route = between(chat,"router.post(\n  '/conversations'","router.get(\n  '/conversations'");
  assert.match(route,/childProtection\.communicationDecision\(\s*database,\s*userId,\s*otherUserId/);
  assert.match(route,/status\(403\)/);
});

test('subir un archivo consulta la protección y elimina el temporal si deniega',()=>{
  const handler = between(chat,'async function uploadChatFileHandler','/* ========================================================\n   RUTAS DE SUBIDA');
  assert.match(handler,/childProtection\.communicationDecision\(\s*database,\s*userId,\s*room\.otherUser\.id/);
  assert.match(handler,/if \(!childPolicy\.allowed\)[\s\S]*?removeUploadedFile\(\s*req\.file/);
});

test('el canal de texto en tiempo real verifica a cada participante',()=>{
  const handler = between(server,"socket.on(\n      'conversation-message'",'// INDICADOR "ESCRIBIENDO..."');
  assert.match(handler,/getConversationParticipants\(\s*conversationId/);
  assert.match(handler,/vobixChildProtection\.communicationDecision\(\s*database,\s*userId,\s*participant\.user_id/);
  assert.match(handler,/Mensaje no autorizado por la protección familiar/);
});

test('aceptar una solicitud antigua vuelve a comprobar la política actual',()=>{
  const route = between(server,"app.post('/api/friends/:id/accept'","app.post('/api/friends/:id/reject'");
  assert.match(route,/SELECT id,requester_id,addressee_id,status/);
  assert.match(route,/vobixChildProtection\.communicationDecision\(\s*database,\s*friendship\.requester_id,\s*friendship\.addressee_id/);
});

test('la Capa 110 declara sus límites de privacidad',()=>{
  const layers = read('core/vobix-layers.js');
  assert.match(layers,/id:'110'.*Vobix Escudo Infantil Integral.*no inspecciona el contenido privado/);
});
