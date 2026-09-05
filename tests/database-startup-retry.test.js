'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('el servidor escucha antes de comprobar la base de datos', () => {
  const listenIndex = serverSource.indexOf('server.listen(');
  const retryIndex = serverSource.indexOf('initializeDatabaseWithRetry();');

  assert.ok(listenIndex >= 0);
  assert.ok(retryIndex > listenIndex);
});

test('la inicialización reintenta con una espera progresiva limitada', () => {
  assert.match(serverSource, /async function initializeDatabaseWithRetry\(attempt = 1\)/);
  assert.match(serverSource, /Math\.min\(30000, 2000 \* \(2 \*\* Math\.min\(attempt - 1, 4\)\)\)/);
  assert.match(serverSource, /setTimeout\([\s\S]*initializeDatabaseWithRetry\(attempt \+ 1\)/);
});
