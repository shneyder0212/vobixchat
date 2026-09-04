'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('fragmentos y cancelación se bloquean durante el ensamblado',()=>{const chat=read('routes/chat.js');const matches=chat.match(/code: 'upload_session_finalizing'/g)||[];assert.equal(matches.length,2);});
test('la protección ocurre antes de escribir o eliminar',()=>{const chat=read('routes/chat.js');const put=chat.slice(chat.indexOf("router.put("),chat.indexOf("router.post('/files/resumable/:uploadId/complete'"));assert.ok(put.indexOf('session.completing')<put.indexOf('writeFile(temporaryPath'));const del=chat.slice(chat.indexOf("router.delete('/files/resumable/:uploadId'"));assert.ok(del.indexOf('session.completing')<del.indexOf('removeResumableSession(session.uploadId)'));});
test('la capa 122 está registrada',()=>assert.match(read('core/vobix-layers.js'),/id:'122'.*Cierre Atómico de Sesión de Subida/));
