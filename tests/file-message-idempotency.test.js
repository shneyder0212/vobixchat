'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const chat=read('routes/chat.js');const html=read('public/chat.html');
const start=chat.indexOf('async function uploadChatFileHandler');const end=chat.indexOf('/* ========================================================\n   RUTAS DE SUBIDA',start);const handler=chat.slice(start,end);

test('archivos exigen identidad y aplican la unicidad persistente',()=>{assert.match(handler,/client_message_id_required/);assert.match(handler,/ON CONFLICT \(sender_user_id, client_message_id\)/);assert.match(handler,/\(xmax = 0\) AS inserted/);});
test('la identidad del archivo queda vinculada también a su SHA-256',()=>{assert.match(handler,/matchesPersistedMessage\(persistedRow,[\s\S]*?originSha256/);assert.match(read('core/message-intent.js'),/expected\.originSha256/);});
test('reintentos limpian la copia nueva y no vuelven a notificar',()=>{assert.match(handler,/if \(!inserted\)[\s\S]*?deleteChatFile[\s\S]*?removeUploadedFile/);assert.match(handler,/if \(inserted\) \{[\s\S]*?notifyPrivateConversation/);});
test('subidas normales, reanudables, cámara y voz envían identidad',()=>{assert.match(html,/form\.append\('clientMessageId', clientMessageId\)/);assert.match(html,/clientMessageId,\s*\n\s*type: kind/);assert.ok((html.match(/form\.append\('clientMessageId', createCallId\(\)\)/g)||[]).length>=2);assert.match(chat,/clientMessageId: session\.clientUploadId/);});
test('la Capa 117 queda registrada',()=>{assert.match(read('core/vobix-layers.js'),/id:'117'.*Archivos y Notas de Voz sin Duplicados/);});
