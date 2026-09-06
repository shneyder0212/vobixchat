'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('los siete controles de llamada caben en móvil y respetan la zona inferior', () => {
  const html = read('public/chat.html');
  const start = html.indexOf('CAPA 176 · CONTROLES DE LLAMADA MÓVIL COMPLETOS');
  const block = html.slice(start, html.indexOf('@media (prefers-contrast: more)', start));

  assert.ok(start > 0, 'debe existir la Capa 176');
  assert.match(block, /@media \(max-width: 720px\)/);
  assert.match(block, /bottom: max\(44px, calc\(env\(safe-area-inset-bottom\) \+ 16px\)\)/);
  assert.match(block, /width: min\(calc\(100vw - 12px\), 420px\)/);
  assert.match(block, /body\.vobixSeniorMode \.callControl/);
  assert.match(block, /width: clamp\(38px, 11\.5vw, 46px\)/);
  assert.match(block, /#endCallButton,[\s\S]*#addCallParticipantButton/);
  assert.match(block, /overflow: visible/);
});

test('la Capa 176 queda registrada en el catálogo', () => {
  assert.match(
    read('core/vobix-layers.js'),
    /id:'176'.*Controles de Llamada Móvil Completos.*status:'en_validacion'/
  );
});
