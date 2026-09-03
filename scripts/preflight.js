'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const server = read('server.js');
const chatRoutes = read('routes/chat.js');
const chatHtml = read('public/chat.html');
const failures = [];
const warnings = [];

function check(name, fn) {
  try {
    fn();
    process.stdout.write(`OK  ${name}\n`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    process.stdout.write(`FALLO  ${name}\n`);
  }
}

check('Node 20 o superior', () => assert.ok(Number(process.versions.node.split('.')[0]) >= 20));

check('dependencias instaladas', () => {
  Object.keys(packageJson.dependencies || {}).forEach(name => require.resolve(name, { paths:[root] }));
});

check('router de chat montado', () => {
  assert.ok(
    /app\.use\(\s*['"]\/api\/chat['"]\s*,\s*requireAuth\s*,\s*chatRoutes\s*\)/.test(server),
    'Falta el montaje autenticado de /api/chat'
  );
});

check('rutas nuevas disponibles', () => {
  [
    "router.post('/translate'",
    "router.post('/assistant'",
    "router.post('/files/resumable/start'",
    "router.get('/files/resumable/:uploadId'",
    "router.post('/files/resumable/:uploadId/complete'"
  ].forEach(route => assert.ok(chatRoutes.includes(route), `Falta ${route}`));
  assert.ok(
    /router\.put\(\s*['"]\/files\/resumable\/:uploadId\/:index['"]/.test(chatRoutes),
    'Falta la ruta PUT de fragmentos reanudables'
  );
});

check('cliente conectado a las rutas', () => {
  ['/api/chat/translate', '/api/chat/assistant', '/api/chat/files/resumable/start']
    .forEach(endpoint => assert.ok(chatHtml.includes(endpoint), `Falta ${endpoint}`));
});

check('scripts del chat compilan', () => {
  const scripts = [...chatHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1]).filter(source => source.trim());
  assert.ok(scripts.length > 0);
  scripts.forEach(source => new Function(source));
});

check('identificadores HTML únicos', () => {
  const ids = [...chatHtml.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

check('sin claves privadas incrustadas', () => {
  const source = [server, chatRoutes, chatHtml].join('\n');
  assert.doesNotMatch(source, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/);
  assert.doesNotMatch(source, /\bsk-[A-Za-z0-9_-]{20,}\b/);
});

if (!process.env.VOBIX_AI_API_URL || !process.env.VOBIX_AI_API_KEY || !process.env.VOBIX_AI_MODEL) {
  warnings.push('Motor IA externo sin configurar; seguirá activo el respaldo local Senior.');
}
if (!process.env.TRANSLATION_API_URL) {
  warnings.push('Traductor del servidor sin configurar; se intentará traducción local compatible.');
}

warnings.forEach(message => process.stdout.write(`AVISO  ${message}\n`));
if (failures.length) {
  failures.forEach(message => process.stderr.write(`ERROR  ${message}\n`));
  process.exitCode = 1;
} else {
  process.stdout.write('PREVALIDACIÓN APROBADA\n');
}
