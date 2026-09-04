'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('la sesión nace sin finalización activa',()=>assert.match(read('routes/chat.js'),/completing:\s*false/));
test('una segunda finalización simultánea se rechaza',()=>{const chat=read('routes/chat.js');assert.match(chat,/if \(session\.completing\)/);assert.match(chat,/upload_completion_in_progress/);assert.match(chat,/session\.completing = true/);});
test('una reconstrucción inválida libera el bloqueo',()=>assert.match(read('routes/chat.js'),/session\.completing = false;\s*\n\s*return res\.status\(409\)/));
test('la capa 120 está registrada',()=>assert.match(read('core/vobix-layers.js'),/id:'120'.*Finalización Única de Subidas/));
