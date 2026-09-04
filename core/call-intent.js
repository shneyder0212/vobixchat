'use strict';

function normalizeCallId(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9_-]{8,100}$/.test(id) ? id : null;
}

function matchesCallIntent(call, expected = {}) {
  if (!call) return false;
  return String(call.callerId) === String(expected.callerId) &&
    String(call.conversationId) === String(expected.conversationId) &&
    String(call.type) === String(expected.type);
}

module.exports = { matchesCallIntent, normalizeCallId };