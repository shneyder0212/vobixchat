'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('el registro mantiene visible el teléfono cuando aparece el teclado', () => {
  const html = read('public/index.html');
  assert.match(html, /interactive-widget=resizes-content/);
  assert.match(html, /function updateLoginViewport/);
  assert.match(html, /visualViewport\?\.addEventListener\('resize'/);
  assert.match(html, /scrollIntoView\(\{block:'center'/);
  assert.match(html, /body\.keyboardOpen \.card/);
  assert.match(html, /body\.keyboardOpen \.logo/);
  assert.match(html, /\.card:focus-within/);
  assert.match(html, /body:has\(\.card :is\(input,select\):focus\)/);
  assert.match(html, /function revealLoginField\(field\)/);
  assert.match(html, /\[0, 120, 280, 520\]/);
  assert.match(read('android/app/src/main/AndroidManifest.xml'), /android:windowSoftInputMode="adjustResize"/);
  assert.match(read('core/vobix-layers.js'), /id:'158'.*Registro Visible Sobre el Teclado/);
});

test('buscar contacto conserva un botón visible y admite Buscar del teclado', () => {
  const html = read('public/inbox.html');
  assert.match(html, /\.searchbox input\{flex:1 1 auto;min-width:0;width:0/);
  assert.match(html, /\.searchbox button\{flex:0 0 94px;min-width:94px/);
  assert.match(html, /id="searchInput"[^>]*inputmode="search"[^>]*enterkeyhint="search"/);
  assert.match(html, /id="searchBtn" type="button">Buscar/);
  assert.match(html, /function updateInboxViewport/);
  assert.match(html, /closest\('\.searchbox,\.inviteBox'\)\?\.scrollIntoView/);
});

test('la Capa 149 registra la corrección sin retirar la llamada grupal', () => {
  const layers = read('core/vobix-layers.js');
  assert.match(layers, /id:'148'.*Llamadas Ampliables de Seis Personas/);
  assert.match(layers, /id:'149'.*Formularios Visibles con Teclado Móvil/);
});

test('la búsqueda y la conversación permiten volver a la sala principal', () => {
  const inbox = read('public/inbox.html');
  const chat = read('public/chat.html');
  assert.match(inbox, /id="finderBackButton"[^>]*>← Volver a los chats/);
  assert.match(inbox, /finderBackButton'\)\.onclick=.*backBtn/);
  assert.match(chat, /class="vobixBackButton"[\s\S]{0,100}href="\/inbox\.html"/);
  assert.match(read('core/vobix-layers.js'), /id:'150'.*Regreso Visible a la Sala Principal/);
});
