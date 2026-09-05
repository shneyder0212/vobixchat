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
  assert.match(gradle, /versionCode = 2/);
  assert.match(gradle, /versionName = "1\.1\.0"/);
  assert.match(activity, /VobixChatAndroid\/1\.1/);
});

test('GitHub compila y conserva la APK de pruebas', () => {
  assert.match(workflow, /gradle -p android --no-daemon assembleDebug/);
  assert.match(workflow, /android\/app\/build\/outputs\/apk\/debug\/app-debug\.apk/);
  assert.match(workflow, /VobixChat-1\.1\.0-debug/);
});
