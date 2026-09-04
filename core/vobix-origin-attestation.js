'use strict';

const crypto = require('crypto');

function canonicalPayload(value) {
  return [
    'vobix-origin-v1',
    String(value.messageId || ''),
    String(value.sha256 || '').toLowerCase(),
    String(value.userId || ''),
    String(value.sessionId || ''),
    value.userVerified === true ? '1' : '0',
    value.deviceRecognized === true ? '1' : '0',
    value.locationShared === true ? '1' : '0',
    String(value.capturedAt || '')
  ].join('|');
}

function validSecret(secret) {
  return String(secret || '').length >= 32;
}

function sign(value, secret) {
  if (!validSecret(secret)) return null;
  return crypto.createHmac('sha256', String(secret)).update(canonicalPayload(value)).digest('hex');
}

function verify(value, signature, secret) {
  const expected = sign(value, secret);
  if (!expected || !/^[a-f0-9]{64}$/i.test(String(signature || ''))) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
}

module.exports = { canonicalPayload, validSecret, sign, verify };
