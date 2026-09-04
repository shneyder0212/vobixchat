'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {matchesPersistedMessage}=require('../core/message-intent');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('una confirmación coincide solo con la misma conversación, tipo y contenido',()=>{
  const row={conversation_id:'room-a',message_type:'text',content:'hola'};
  assert.equal(matchesPersistedMessage(row,{conversationId:'room-a',messageType:'text',content:'hola'}),true);
  assert.equal(matchesPersistedMessage(row,{conversationId:'room-b',messageType:'text',content:'hola'}),false);
  assert.equal(matchesPersistedMessage(row,{conversationId:'room-a',messageType:'image',content:'hola'}),false);
  assert.equal(matchesPersistedMessage(row,{conversationId:'room-a',messageType:'text',content:'otro'}),false);
});

test('HTTP y Socket rechazan la reutilización con otra intención',()=>{
  assert.match(read('routes/chat.js'),/client_message_id_conflict/);
  assert.match(read('server.js'),/client_message_id_conflict/);
  assert.match(read('routes/chat.js'),/matchesPersistedMessage\(persistedRow/);
  assert.match(read('server.js'),/matchesPersistedMessage\(row/);
});

test('la Capa 115 queda registrada',()=>{
  assert.match(read('core/vobix-layers.js'),/id:'115'.*Identidad de Mensaje Vinculada/);
});
