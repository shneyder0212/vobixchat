'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const routes = fs.readFileSync(path.join(root, 'routes/chat.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'database/schema.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/chat.html'), 'utf8');

test('el teléfono queda privado por defecto', () => {
  assert.match(schema, /discover_by_phone BOOLEAN\s+DEFAULT FALSE/);
});

test('amistades públicas no devuelven el teléfono', () => {
  const friendsRoute = server.slice(server.indexOf("app.get('/api/friends'"), server.indexOf("app.post('/api/friends/request'"));
  assert.doesNotMatch(friendsRoute, /u\.phone/);
  assert.match(friendsRoute, /u\.vobix_id/);
});

test('la búsqueda pública usa nombre o Vobix ID y nunca teléfono', () => {
  const searchRoute = routes.slice(routes.indexOf('async function searchUsersHandler'), routes.indexOf("router.get(\n  '/users/search'"));
  assert.match(searchRoute, /discover_by_vobix_id = TRUE/);
  assert.doesNotMatch(searchRoute, /discover_by_phone|REGEXP_REPLACE|\bphone\b/);
});

test('la interfaz identifica contactos por Vobix ID y no pinta su teléfono', () => {
  const renderer = html.slice(html.indexOf('function renderPeopleResults'), html.indexOf('async function searchPeople'));
  assert.match(renderer, /user\.vobix_id/);
  assert.doesNotMatch(renderer, /userPhone\(user\)/);
});
