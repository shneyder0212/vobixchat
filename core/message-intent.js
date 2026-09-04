'use strict';

function matchesPersistedMessage(row, expected = {}) {
  if (!row) return false;
  return String(row.conversation_id || '') === String(expected.conversationId || '') &&
    String(row.content || '') === String(expected.content || '') &&
    String(row.message_type || '') === String(expected.messageType || '');
}

module.exports = { matchesPersistedMessage };
