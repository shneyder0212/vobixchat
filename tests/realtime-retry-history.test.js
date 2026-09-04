'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const server=read('server.js');
const start=server.indexOf("socket.on(\n      'conversation-message'");
const end=server.indexOf('// INDICADOR "ESCRIBIENDO..."',start);
const handler=server.slice(start,end);

test('Socket actualiza la actividad únicamente para mensajes recién insertados',()=>{
  const guard=handler.indexOf('if (inserted)');
  const update=handler.indexOf('UPDATE conversations',guard);
  const guardEnd=handler.indexOf('\n          }',update);
  assert.ok(guard>0&&update>guard&&guardEnd>update);
});

test('el reintento retorna antes de emisiones y notificaciones',()=>{
  const duplicate=handler.indexOf('if (!inserted)');
  const emit=handler.indexOf(".emit(\n              'conversation-message'",duplicate);
  assert.ok(duplicate>0&&emit>duplicate);
  assert.match(handler.slice(duplicate,emit),/return;/);
});

test('la Capa 114 queda registrada',()=>{
  assert.match(read('core/vobix-layers.js'),/id:'114'.*Reintentos sin Alterar Historial/);
});
