'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const protectedRoute = require('../core/vobix-protected-route');
const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.js'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'protected-route.html'), 'utf8');
const layers = fs.readFileSync(path.join(__dirname, '..', 'core', 'vobix-layers.js'), 'utf8');

test('Capa 103 está registrada y visible', () => {
  assert.match(layers, /id:'103', name:'Vobix Ruta Protegida'/);
  assert.match(page, /VOBIX · RUTA PROTEGIDA/);
  assert.match(page, /En una emergencia real llama al 112/);
});

test('coordenadas, destino y duración se limitan', () => {
  assert.deepEqual(protectedRoute.safeCoordinate(40.416775, -3.70379, 12.8), { latitude:40.41678, longitude:-3.70379, accuracy:13 });
  assert.equal(protectedRoute.safeCoordinate(91, 0, 1), null);
  assert.equal(protectedRoute.safeExpectedAt(Date.now() + 2 * 60 * 1000), null);
  assert.ok(protectedRoute.safeExpectedAt(Date.now() + 30 * 60 * 1000));
  assert.equal(protectedRoute.safeDestinationLabel('  Mi   casa  '), 'Mi casa');
});

test('la llegada usa distancia geográfica y tolerancia de precisión', () => {
  assert.ok(protectedRoute.distanceMetres({latitude:40.41678,longitude:-3.70379}, {latitude:40.41680,longitude:-3.70380}) < 10);
  assert.ok(protectedRoute.distanceMetres({latitude:40.41678,longitude:-3.70379}, {latitude:41.3874,longitude:2.1686}) > 400000);
  assert.match(server, /distanceToDestination <= Math\.max\(100, location\.accuracy \|\| 0\)/);
});

test('solo guardianes activos y consentimiento explícito pueden acompañar la ruta', () => {
  assert.match(server, /protected_user_id=\$1 AND status='active' AND id=ANY/);
  assert.match(server, /req\.body\?\.consent !== true/);
  assert.match(schema, /protected_route_guardians/);
  assert.match(server, /slice\(0, 5\)/);
});

test('el monitor alerta por retraso o más de diez minutos sin ubicación', () => {
  assert.match(server, /NOW\(\)-INTERVAL '10 minutes'/);
  assert.match(server, /expected_at<NOW\(\)/);
  assert.match(server, /protected-route-alert/);
  assert.match(server, /alert_sent_at IS NULL/);
});

test('la ubicación se comparte temporalmente y puede finalizarse', () => {
  assert.match(page, /navigator\.geolocation\.watchPosition/);
  assert.match(server, /protected-routes\/:routeId\/finish/);
  assert.match(server, /status IN \('active','late','stalled'\)/);
  assert.match(page, /La ubicación deja de compartirse al llegar o cancelar/);
});
