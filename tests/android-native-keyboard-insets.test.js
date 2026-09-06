'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Android mide el teclado y comunica la altura visible en píxeles CSS', () => {
  const activity = read('android/app/src/main/java/com/vobixchat/mobile/MainActivity.kt');
  assert.match(activity, /WindowInsetsCompat\.Type\.ime\(\)/);
  assert.match(activity, /insets\.isVisible\(WindowInsetsCompat\.Type\.ime\(\)\)/);
  assert.match(activity, /resources\.displayMetrics\.density/);
  assert.match(activity, /vobix:native-keyboard/);
  assert.match(activity, /viewportHeight:\$nativeKeyboardViewportHeightCss/);
  assert.match(activity, /override fun onPageFinished/);
});

test('la web combina la medida nativa con VisualViewport sin restar dos veces', () => {
  const keyboard = read('public/vobix-keyboard.js');
  const html = read('public/chat.html');
  assert.match(keyboard, /if \(nativeKeyboardVisible\) heightCandidates\.push\(nativeViewportHeight\)/);
  assert.match(keyboard, /window\.addEventListener\('vobix:native-keyboard'/);
  assert.match(keyboard, /vobixNativeKeyboardOpen/);
  assert.match(html, /html\.vobixNativeKeyboardOpen \.vobixApp/);
  assert.match(html, /html\.vobixNativeKeyboardOpen \.vobixComposer/);
});

test('la Capa 180 y la APK 1.2.8 registran la corrección nativa', () => {
  assert.match(read('core/vobix-layers.js'), /id:'180'.*Teclado Android Medido por la APK/);
  assert.match(read('android/app/build.gradle.kts'), /versionCode = 11/);
  assert.match(read('android/app/build.gradle.kts'), /versionName = "1\.2\.8"/);
});
