'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const intent=require('../core/upload-intent');const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const base={conversationId:'room-a',originalName:'foto.jpg',mimeType:'image/jpeg',totalSize:100,requestedType:'image',originSource:'vobix-upload',viewOnce:false};
test('identificadores de subida usan el mismo formato seguro',()=>{assert.equal(intent.normalizeUploadId('upload_123'), 'upload_123');assert.equal(intent.normalizeUploadId('corto'),null);assert.equal(intent.normalizeUploadId('inválido-123'),null);});
test('una sesión solo reanuda exactamente la intención original',()=>{assert.equal(intent.matchesUploadIntent(base,{...base}),true);for(const key of Object.keys(base)){const changed={...base,[key]:key==='totalSize'?101:(key==='viewOnce'?!base[key]:'otro')};assert.equal(intent.matchesUploadIntent(base,changed),false,key);}});
test('la ruta rechaza colisiones y aplica protección infantil antes de crear sesión',()=>{const chat=read('routes/chat.js');const start=chat.indexOf("router.post('/files/resumable/start'");const end=chat.indexOf("router.get('/files/resumable",start);const route=chat.slice(start,end);assert.match(route,/matchesUploadIntent\(existing/);assert.match(route,/client_upload_id_conflict/);assert.match(route,/childProtection\.communicationDecision/);});
test('la Capa 118 queda registrada',()=>{assert.match(read('core/vobix-layers.js'),/id:'118'.*Sesión de Subida Reanudable Vinculada/);});
