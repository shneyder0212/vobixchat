'use strict';

const crypto = require('crypto');

const COMMON_PHRASES = new Set([
  'ayuda por favor', 'estoy bien', 'hola familia', 'muchas gracias',
  'buenos dias', 'buenas tardes', 'buenas noches'
]);

function normalizePhrase(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('es')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function phraseIsSafe(value) {
  const phrase = normalizePhrase(value);
  return phrase.length >= 8 && phrase.length <= 60 &&
    phrase.split(' ').length >= 2 && !COMMON_PHRASES.has(phrase);
}

function validPhraseHash(value) {
  const hash = String(value || '').trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(hash) ? hash : null;
}

function phraseHash(value) {
  const phrase = normalizePhrase(value);
  return phraseIsSafe(phrase) ? crypto.createHash('sha256').update(phrase).digest('hex') : null;
}

function safeLocation(latitude, longitude, accuracy) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  const acc = Number(accuracy);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return {
    latitude: Number(lat.toFixed(5)),
    longitude: Number(lng.toFixed(5)),
    accuracy: Number.isFinite(acc) && acc >= 0 ? Math.min(Math.round(acc), 50000) : null
  };
}

function hashesMatch(first, second) {
  const a = validPhraseHash(first);
  const b = validPhraseHash(second);
  return !!a && !!b && crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

module.exports = { hashesMatch, normalizePhrase, phraseHash, phraseIsSafe, safeLocation, validPhraseHash };
