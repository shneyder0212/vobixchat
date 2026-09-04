'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const server=read('server.js');
const start=server.indexOf("socket.on(\n      'conversation-message'");
const end=server.indexOf('// INDICADOR "ESCRIBIENDO..."',start);
const handler=server.slice(start,end);

test('Socket exige un identificador de mensaje limitado y seguro',()=>{
  assert.match(handler,/\^\[A-Za-z0-9_-\]\{8,100\}\$/);
  assert.match(handler,/client_message_id_required/);
});

test('Socket aplica la misma unicidad persistente que HTTP',()=>{
  assert.match(handler,/ON CONFLICT \(sender_user_id, client_message_id\)/);
  assert.match(handler,/\(xmax = 0\) AS inserted/);
  assert.match(handler,/const inserted = row\.inserted !== false/);
});

test('un reintento se confirma sin volver a emitir ni enviar push',()=>{
  const duplicate=handler.indexOf('if (!inserted)');
  const roomEmit=handler.indexOf(".emit(\n              'conversation-message'");
  const push=handler.indexOf('await sendPushToUser');
  assert.ok(duplicate>0&&roomEmit>duplicate&&push>duplicate);
  assert.match(handler,/duplicate: true[\s\S]*?return;/);
  assert.match(handler,/duplicate: false/);
});

test('la Capa 113 queda registrada',()=>{
  assert.match(read('core/vobix-layers.js'),/id:'113'.*Mensajería en Tiempo Real Idempotente/);
});
