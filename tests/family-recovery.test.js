'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const recovery = require('../core/vobix-family-recovery');

test('Capa 108 exige consenso de varios guardianes', () => {
  assert.equal(recovery.normalizeThreshold(2, 2), 2);
  assert.equal(recovery.normalizeThreshold(1, 3), null);
  assert.equal(recovery.normalizeThreshold(4, 3), null);
  assert.equal(recovery.normalizeThreshold(2, 1), null);
  assert.equal(recovery.normalizeThreshold(5, 5), 5);
});

test('el secreto es aleatorio y solo se conserva como huella', () => {
  const first = recovery.createRecoverySecret();
  const second = recovery.createRecoverySecret();
  assert.notEqual(first, second);
  assert.match(recovery.hashRecoverySecret(first), /^[a-f0-9]{64}$/);
  assert.equal(recovery.hashRecoverySecret(first), recovery.hashRecoverySecret(first));
});

test('la espera empieza únicamente después del umbral', () => {
  const now = new Date('2026-09-04T12:00:00Z');
  const base = {status:'pending',approval_count:1,threshold_required:2,expires_at:'2026-09-07T12:00:00Z'};
  assert.equal(recovery.requestState(base, now), 'waiting_approvals');
  assert.equal(recovery.requestState({...base,approval_count:2,ready_at:'2026-09-05T12:00:00Z'}, now), 'security_wait');
  assert.equal(recovery.requestState({...base,approval_count:2,ready_at:'2026-09-04T11:00:00Z'}, now), 'ready');
});

test('las solicitudes vencidas o canceladas nunca habilitan acceso', () => {
  const now = new Date('2026-09-04T12:00:00Z');
  assert.equal(recovery.requestState({status:'pending',approval_count:3,threshold_required:2,ready_at:'2026-09-04T10:00:00Z',expires_at:'2026-09-04T11:00:00Z'},now),'expired');
  assert.equal(recovery.requestState({status:'cancelled'},now),'cancelled');
});

test('la etiqueta del dispositivo no admite marcado ni saltos', () => {
  assert.equal(recovery.safeDeviceLabel('<b>Mi\n móvil</b>'), 'Mi móvil');
  assert.ok(recovery.safeDeviceLabel('x'.repeat(200)).length <= 80);
});

test('servidor no comparte contraseñas o chats con guardianes', () => {
  const server = fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  const block = server.slice(server.indexOf("app.get('/api/family-recovery'"),server.indexOf('// CAPA 103 — VOBIX RUTA PROTEGIDA'));
  assert.ok(block.includes("UPDATE sessions SET revoked=TRUE"));
  assert.ok(block.includes("status='completed'"));
  assert.ok(block.includes("g.status='active'"));
  assert.ok(block.includes("status='cancelled',cancelled_at=NOW()"));
  assert.ok(!/SELECT[^;]*(password|messages|content|phone)/i.test(block));
});

test('la interfaz explica límites y la capa queda registrada', () => {
  const ui=fs.readFileSync(path.join(__dirname,'..','public','family-recovery.html'),'utf8');
  const layers=fs.readFileSync(path.join(__dirname,'..','core','vobix-layers.js'),'utf8');
  assert.match(ui,/Desactivada por defecto/);
  assert.match(ui,/24 horas/);
  assert.match(layers,/id:'108'.*Recuperación Familiar/);
});
