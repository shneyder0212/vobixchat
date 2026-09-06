'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const capacity = require('../core/vobix-video-capacity');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('la plataforma se diseña para 50.000 conexiones sin convertirlas en una sola sala', () => {
  assert.equal(capacity.DESIGNED_CONCURRENT_CONNECTIONS, 50_000);
  assert.equal(capacity.INTERACTIVE_ROOM_MAX_PARTICIPANTS, 1_000);
  assert.equal(require('../core/vobix-meet').MAX_PARTICIPANTS, 1_000);
});

test('la capacidad nunca se presenta operativa sin proveedor, contrato y carga verificada', () => {
  const base = {
    LIVEKIT_URL:'wss://example.livekit.cloud',
    LIVEKIT_API_KEY:'key',
    LIVEKIT_API_SECRET:'secret',
    LIVEKIT_MAX_CONNECTIONS:'50000'
  };
  assert.equal(capacity.getVideoCapacity(base).operational, false);
  assert.equal(capacity.getVideoCapacity({...base, LIVEKIT_ENTERPRISE_CONTRACT:'true'}).operational, false);
  assert.equal(capacity.getVideoCapacity({
    ...base,
    LIVEKIT_ENTERPRISE_CONTRACT:'true',
    VOBIX_MEET_CAPACITY_VERIFIED:'true'
  }).operational, true);
});

test('el servidor publica estado empresarial sin exponer secretos', () => {
  const server = read('server.js');
  assert.match(server, /designedConcurrentConnections:DESIGNED_CONCURRENT_CONNECTIONS/);
  assert.match(server, /enterpriseContractConfirmed:capacity\.enterpriseContractConfirmed/);
  assert.match(server, /operational:capacity\.operational/);
  assert.doesNotMatch(server, /api\/meet\/capacity[\s\S]{0,900}apiSecret/);
});

test('la Capa 160 conserva Meet sin presentarlo como activo', () => {
  assert.match(read('core/vobix-layers.js'), /id:'160'.*Videollamadas Empresariales 50K.*status:'aparcada'/);
});
