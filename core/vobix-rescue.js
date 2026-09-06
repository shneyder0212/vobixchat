'use strict';

const EMERGENCY_TYPES = Object.freeze(['medical','danger','lost','accident','other']);

function safeBattery(value) {
  const battery = Number(value);
  return Number.isFinite(battery) && battery >= 0 && battery <= 100 ? Math.round(battery) : null;
}

function safeEmergencyType(value) {
  const type = String(value || '').trim().toLowerCase();
  return EMERGENCY_TYPES.includes(type) ? type : null;
}

function safeClientId(value) {
  const id = String(value || '').trim();
  return /^[a-zA-Z0-9_-]{12,100}$/.test(id) ? id : null;
}

function safeCiphertext(value) {
  const ciphertext = String(value || '').trim();
  if (ciphertext.length < 24 || ciphertext.length > 16000) return null;
  return /^[a-zA-Z0-9_+=/.-]+$/.test(ciphertext) ? ciphertext : null;
}

module.exports = { EMERGENCY_TYPES, safeBattery, safeClientId, safeCiphertext, safeEmergencyType };
