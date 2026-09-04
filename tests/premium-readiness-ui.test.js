'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const center = fs.readFileSync(path.join(__dirname, '..', 'public', 'centro-config.html'), 'utf8');

test('el centro consulta el catálogo autenticado antes de mostrar estados', () => {
  assert.match(center, /await api\('\/api\/premium\/catalog'\)/);
  assert.match(center, /data\.capabilities/);
  assert.match(center, /catalog\.set\(item\.id,item\)/);
});

test('los estados operativos y de diseño se traducen sin inventarlos', () => {
  assert.match(center, /active:'OPERATIVO'/);
  assert.match(center, /preparation:'EN PREPARACIÓN'/);
  assert.match(center, /'legal-design':'DISEÑO LEGAL'/);
  assert.match(center, /'regulated-design':'DISEÑO REGULATORIO'/);
  assert.match(center, /service\.operational\?'Servicio operativo\.':'El servicio aún no está operativo\.'/);
});

test('el usuario ve el plan real y si los cobros están desactivados', () => {
  assert.match(center, /currentPlan=data\.currentPlan\|\|'free'/);
  assert.match(center, /Plan actual:/);
  assert.match(center, /data\.billingEnabled\?'habilitados\.':'desactivados\.'/);
  assert.match(center, /Plan mínimo:/);
});
