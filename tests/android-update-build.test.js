'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const gradle = fs.readFileSync(path.join(root, 'android', 'app', 'build.gradle.kts'), 'utf8');
const activity = fs.readFileSync(path.join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'vobixchat', 'mobile', 'MainActivity.kt'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'android-debug-apk.yml'), 'utf8');

test('Android reconoce la nueva APK como una versión superior', () => {
  assert.match(gradle, /versionCode = 12/);
  assert.match(gradle, /versionName = "1\.2\.9"/);
  assert.match(activity, /VobixChatAndroid\/1\.2\.9/);
  assert.match(activity, /cacheMode = WebSettings\.LOAD_NO_CACHE/);
});

test('GitHub compila y conserva la APK de pruebas', () => {
  assert.match(workflow, /gradle -p android --no-daemon assembleDebug/);
  assert.match(workflow, /android\/app\/build\/outputs\/apk\/debug\/app-debug\.apk/);
  assert.match(workflow, /VobixChat-1\.2\.9-debug/);
  assert.match(workflow, /push:[\s\S]{0,80}branches: \[main\]/);
});

test('la APK recibe automáticamente las actualizaciones web publicadas', () => {
  assert.match(activity, /cacheMode = WebSettings\.LOAD_NO_CACHE/);
  assert.match(activity, /https:\/\/vobixchat\.onrender\.com\/inbox\.html/);
  assert.match(activity, /webView\.loadUrl\(safeUrl\)/);
  const layers = fs.readFileSync(path.join(root, 'core', 'vobix-layers.js'), 'utf8');
  assert.match(layers, /id:'168'.*Actualización Web Automática de la APK.*status:'activo'/);
});
