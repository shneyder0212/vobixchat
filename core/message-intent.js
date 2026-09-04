'use strict';

function matchesPersistedMessage(row, expected = {}) {
  if (!row) return false;
  const baseMatches = String(row.conversation_id || '') === String(expected.conversationId || '') &&
    String(row.content || '') === String(expected.content || '') &&
    String(row.message_type || '') === String(expected.messageType || '');
  if (!baseMatches) return false;
  if (Object.prototype.hasOwnProperty.call(expected, 'originSha256')) {
    return String(row.origin_sha256 || '') === String(expected.originSha256 || '');
  }
  return true;
}

module.exports = { matchesPersistedMessage };
