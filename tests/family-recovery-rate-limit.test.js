'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const recovery=require('../core/vobix-family-recovery');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('el limitador permite el cupo y bloquea el intento siguiente',()=>{
  const store=new Map();
  assert.equal(recovery.consumeAttempt(store,'device',2,60000,1000).allowed,true);
  assert.equal(recovery.consumeAttempt(store,'device',2,60000,2000).allowed,true);
  const blocked=recovery.consumeAttempt(store,'device',2,60000,3000);
  assert.equal(blocked.allowed,false);
  assert.equal(blocked.retryAfterMs,58000);
});

test('los intentos vencidos dejan de contar',()=>{
  const store=new Map([['device',[1000,2000]]]);
  assert.equal(recovery.consumeAttempt(store,'device',2,60000,62000).allowed,true);
  assert.deepEqual(store.get('device'),[62000]);
});

test('inicio, estado y finalización tienen límites separados y Retry-After',()=>{
  const server=read('server.js');
  assert.match(server,/familyRecoveryRateLimit\(req,res,'start',5,15\*60\*1000\)/);
  assert.match(server,/familyRecoveryRateLimit\(req,res,'status',20,5\*60\*1000\)/);
  assert.match(server,/familyRecoveryRateLimit\(req,res,'complete',8,15\*60\*1000\)/);
  assert.match(server,/res\.set\('Retry-After'/);
});

test('la Capa 112 registra una memoria temporal acotada',()=>{
  assert.match(read('core/vobix-layers.js'),/id:'112'.*Defensa de Recuperación Familiar.*memoria temporal acotada/);
  assert.match(read('core/vobix-family-recovery.js'),/store\.size > 5000/);
});
