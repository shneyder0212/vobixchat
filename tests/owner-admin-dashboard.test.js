'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const config = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'private', 'owner-console.html'), 'utf8');
const client = fs.readFileSync(path.join(root, 'public', 'owner-console.js'), 'utf8');

test('el panel exige sesión verificada y cuenta exclusiva del propietario', () => {
  assert.match(server, /app\.get\('\/api\/admin\/overview', requireOwnerAdmin/);
  assert.match(server, /owner_admin_not_configured/);
  assert.match(server, /owner_only/);
  assert.match(server, /admin_reauthentication_required/);
  assert.match(server, /crypto\.timingSafeEqual/);
  assert.match(config, /ADMIN_OWNER_USER_ID: process\.env\.ADMIN_OWNER_USER_ID/);
  assert.match(config, /ADMIN_OWNER_PHONE: process\.env\.ADMIN_OWNER_PHONE/);
});

test('la puerta privada no expone el archivo HTML por el directorio público', () => {
  assert.match(server, /app\.get\('\/propietario-vobix'/);
  assert.match(server, /private', 'owner-console\.html'/);
  assert.match(server, /X-Robots-Tag', 'noindex, nofollow, noarchive'/);
  assert.match(server, /frame-ancestors 'none'/);
});

test('el control incluye registrados totales, actividad y crecimiento', () => {
  assert.match(server, /COUNT\(\*\)::int FROM users\) AS total_users/);
  assert.match(server, /registrations_today/);
  assert.match(server, /registrations_30d/);
  assert.match(server, /weeklyGrowthPercent/);
  assert.match(server, /activeCalls: activeCalls\.size/);
  assert.match(html, /Registrados totales/);
  assert.match(html, /AUGE DE LA APP/);
  assert.match(client, /setInterval\(load,5000\)/);
});

test('la respuesta administrativa conserva la privacidad de comunicaciones', () => {
  const route = server.slice(
    server.indexOf("app.get('/api/admin/overview'"),
    server.indexOf('// ======================================================\n// FIN BLOQUE 5/6')
  );
  assert.doesNotMatch(route, /SELECT[\s\S]{0,100}content\s+FROM messages/i);
  assert.doesNotMatch(route, /SELECT[\s\S]{0,100}phone\s+FROM users/i);
  assert.match(route, /conversationsExcluded: true/);
  assert.match(route, /phoneNumbersExcluded: true/);
  assert.match(route, /secretsExcluded: true/);
  assert.match(route, /owner_dashboard_view/);
});
