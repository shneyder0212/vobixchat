'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'chat.html'),
  'utf8'
);
const inbox = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'inbox.html'),
  'utf8'
);

test('el botón queda bloqueado y accesible mientras busca', () => {
  assert.match(html, /searchButton\.disabled = true/);
  assert.match(html, /searchButton\.setAttribute\(['"]aria-busy['"], ['"]true['"]\)/);
  assert.match(html, /searchButton\.textContent = ['"]Buscando…['"]/);
});

test('solo la búsqueda vigente puede restaurar el botón', () => {
  assert.match(html, /searchSequence === app\.peopleSearchSequence/);
  assert.match(html, /searchButton\.disabled = false/);
  assert.match(html, /searchButton\.removeAttribute\(['"]aria-busy['"]\)/);
  assert.match(html, /searchButton\.textContent = ['"]Buscar['"]/);
});

test('nombre y teléfono usan la ruta real y abren el usuario elegido', () => {
  assert.match(html, /placeholder="Nombre o teléfono"/);
  assert.match(html, /\/api\/chat\/users\/search\?q=/);
  assert.match(inbox, /placeholder="Buscar por nombre o teléfono"/);
  assert.match(inbox, /const endpoints=\['\/api\/chat\/users\/search\?q=','\/api\/chat\/search\?q='\]/);
  assert.match(inbox, /b\.onclick=\(\)=>\{r\.style\.display='none';openPrivateRoom\(u\)\}/);
});

test('llamar desde la búsqueda inicia la llamada al abrir el chat', () => {
  assert.match(inbox, /startCall=audio/);
  assert.match(inbox, /startCall=video/);
  assert.match(html, /function maybeStartRequestedCall\(\)/);
  assert.match(html, /params\.get\('startCall'\)/);
  assert.match(html, /setTimeout\(\(\) => startCall\(requestedType\), 80\)/);
});
