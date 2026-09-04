'use strict';

function normalizeUploadId(value) {
  const id=String(value||'').trim();
  return /^[A-Za-z0-9_-]{8,100}$/.test(id)?id:null;
}

function matchesUploadIntent(session, expected={}) {
  if(!session)return false;
  return String(session.conversationId)===String(expected.conversationId) &&
    String(session.originalName)===String(expected.originalName) &&
    String(session.mimeType)===String(expected.mimeType) &&
    Number(session.totalSize)===Number(expected.totalSize) &&
    String(session.requestedType)===String(expected.requestedType) &&
    String(session.originSource)===String(expected.originSource) &&
    Boolean(session.viewOnce)===Boolean(expected.viewOnce);
}

module.exports={matchesUploadIntent,normalizeUploadId};
