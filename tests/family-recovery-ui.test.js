'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('la interfaz consulta y completa con el secreto local',()=>{
  const ui=read('public/family-recovery.html');
  assert.match(ui,/vobix_recovery_secret/);
  assert.match(ui,/\/status/);
  assert.match(ui,/\/complete/);
  assert.match(ui,/localStorage\.setItem\('vobix_token',data\.token\)/);
});

test('el propietario puede cancelar solicitudes desde la interfaz',()=>{
  const ui=read('public/family-recovery.html');
  assert.match(ui,/item\.role==='guardian'/);
  assert.match(ui,/\/cancel/);
});

test('los identificadores inválidos se rechazan antes de consultar datos',()=>{
  const server=read('server.js');
  assert.match(server,/requestId\/status'[\s\S]*?validUuid\(req\.params\.requestId\)/);
  assert.match(server,/requestId\/complete'[\s\S]*?validUuid\(req\.params\.requestId\)[\s\S]*?database\.pool\.connect/);
});

test('la Capa 111 queda registrada como en validación',()=>{
  assert.match(read('core/vobix-layers.js'),/id:'111'.*Recuperación Familiar Completa.*status:'en_validacion'/);
});
