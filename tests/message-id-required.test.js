'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const chat=read('routes/chat.js');const server=read('server.js');const html=read('public/chat.html');
const http=chat.slice(chat.indexOf('async function sendMessageHandler'),chat.indexOf("router.post(\n  '/conversations/:conversationId/messages'"));
const socket=server.slice(server.indexOf("socket.on(\n      'conversation-message'"),server.indexOf('// INDICADOR "ESCRIBIENDO..."'));

test('HTTP rechaza mensajes sin identificador antes de consultar la sala',()=>{
  const required=http.indexOf('if (!clientMessageId)');
  const room=http.indexOf('await validatePrivateRoom');
  assert.ok(required>0&&room>required);
  assert.match(http,/client_message_id_required/);
});

test('HTTP y Socket aplican el mismo formato seguro',()=>{
  assert.match(http,/\^\[A-Za-z0-9_-\]\{8,100\}\$/);
  assert.match(socket,/\^\[A-Za-z0-9_-\]\{8,100\}\$/);
  assert.match(socket,/client_message_id_required/);
});

test('el cliente actual genera y envía siempre el identificador',()=>{
  assert.match(html,/clientMessageId: createCallId\(\)/);
  assert.match(html,/clientMessageId: payload\.clientMessageId/);
});

test('la Capa 116 queda registrada',()=>{
  assert.match(read('core/vobix-layers.js'),/id:'116'.*Confirmación Obligatoria de Envío/);
});
