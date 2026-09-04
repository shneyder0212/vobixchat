'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const guardian = require('../core/vobix-guardian');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'database/schema.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/chat.html'), 'utf8');

test('protege números, PIN y códigos antes de consultar al familiar', () => {
  assert.equal(guardian.safeSummary('money', 'Transferir a 1234 5678 9012 3456'), 'Transferir a [dato protegido]');
  assert.equal(guardian.safeSummary('code', 'Mi OTP es 123456'), 'El usuario solicita orientación antes de compartir un código.');
  assert.doesNotMatch(guardian.safeSummary('document', 'Documento 123456789'), /123456789/);
});

test('solo admite categorías y decisiones cerradas', () => {
  assert.equal(guardian.normalizeCategory('money'), 'money');
  assert.equal(guardian.normalizeCategory('password'), null);
  assert.equal(guardian.normalizeDecision('approved'), 'approved');
  assert.equal(guardian.normalizeDecision('maybe'), null);
});

test('la relación exige usuarios diferentes y aceptación del guardián', () => {
  assert.match(schema, /CHECK \(protected_user_id <> guardian_user_id\)/);
  assert.match(server, /guardian_user_id=\$3 AND status='invited'/);
  assert.match(server, /status='accepted'[\s\S]{0,220}requester_id/);
});

test('las consultas caducan y solo decide el guardián activo', () => {
  assert.match(schema, /guardian_review_requests/);
  assert.match(server, /NOW\(\)\+INTERVAL '30 minutes'/);
  assert.match(server, /guardian_user_id=\$3 AND status='pending' AND expires_at>NOW\(\)/);
  assert.match(server, /SET status='expired'/);
});

test('las notificaciones nunca transportan el resumen sensible', () => {
  const reviewRoute = server.slice(server.indexOf("app.post('/api/guardian/reviews'"), server.indexOf("app.get('/api/guardian/reviews'"));
  const pushBlock = reviewRoute.slice(reviewRoute.indexOf('sendPushToUser'));
  assert.doesNotMatch(pushBlock, /body:\s*summary/);
  assert.match(pushBlock, /solicita tu orientación/);
});

test('Modo Senior permite invitar, consultar y responder sin adjuntar secretos', () => {
  for (const marker of ['openGuardianPanelButton','inviteCurrentGuardianButton','data-guardian-category="money"','data-guardian-category="document"','data-guardian-category="code"']) {
    assert.match(html, new RegExp(marker));
  }
  assert.match(html, /\/api\/guardian\/invite/);
  assert.match(html, /\/api\/guardian\/reviews/);
  assert.doesNotMatch(html, /JSON\.stringify\(\{[^}]*password/);
});
