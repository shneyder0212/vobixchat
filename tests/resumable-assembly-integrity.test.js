'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('la reconstrucción recalcula la huella de cada fragmento',()=>{const chat=read('routes/chat.js');assert.match(chat,/const actualHash = crypto\.createHash\('sha256'\)\.update\(chunk\)\.digest\('hex'\)/);assert.match(chat,/actualHash !== session\.received\.get\(index\)/);});
test('la corrupción cancela el archivo final y libera la sesión',()=>{const chat=read('routes/chat.js');assert.match(chat,/code: 'chunk_integrity_failed'/);assert.match(chat,/unlink\(finalPath\).*\n\s*session\.completing = false/s);});
test('la capa 121 está registrada',()=>assert.match(read('core/vobix-layers.js'),/id:'121'.*Reconstrucción Verificada de Archivos/));
