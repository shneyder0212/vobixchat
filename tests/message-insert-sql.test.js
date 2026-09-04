'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname,'..','routes','chat.js'),'utf8');
const start = source.indexOf('async function sendMessageHandler');
const end = source.indexOf("router.post(\n  '/conversations/:conversationId/messages'", start);
const handler = source.slice(start,end);

test('Capa 109 no introduce expresiones dentro de las columnas INSERT',()=>{
  const insertColumns = handler.match(/INSERT INTO messages\s*\(([\s\S]*?)\)\s*VALUES/);
  assert.ok(insertColumns);
  assert.doesNotMatch(insertColumns[1],/xmax|\bAS\b/i);
  assert.match(insertColumns[1],/expires_at/);
});

test('la confirmación distingue inserción y reintento en RETURNING',()=>{
  const returning = handler.match(/RETURNING([\s\S]*?)`/);
  assert.ok(returning);
  assert.match(returning[1],/\(xmax\s*=\s*0\)\s+AS\s+inserted/i);
  assert.match(handler,/ON CONFLICT \(sender_user_id, client_message_id\)/);
  assert.match(handler,/const persistedRow = result\.rows\[0\]/);
  assert.match(handler,/const inserted = persistedRow\.inserted !== false/);
});

test('la Capa 109 queda registrada',()=>{
  const layers=fs.readFileSync(path.join(__dirname,'..','core','vobix-layers.js'),'utf8');
  assert.match(layers,/id:'109'.*Persistencia de Mensajes de Acero/);
});
