'use strict';

const CALL_END_REASONS = new Set([
  'ended',
  'rejected',
  'cancelled',
  'busy',
  'missed',
  'unavailable',
  'caller-disconnected',
  'disconnected',
  'expired'
]);

function normalizeCallEndReason(value) {
  const reason = String(value || 'ended').trim().toLowerCase();
  return CALL_END_REASONS.has(reason) ? reason : 'ended';
}

function buildCallEndedPayload(callId, endedBy, reason) {
  return {
    callId: String(callId),
    reason: normalizeCallEndReason(reason),
    endedBy: endedBy == null ? null : String(endedBy)
  };
}

function rememberEndedCall(endedCalls, payload, now = Date.now()) {
  if (!endedCalls) return;
  endedCalls.set(payload.callId, { payload, endedAt: now });
  while (endedCalls.size > 1000) {
    endedCalls.delete(endedCalls.keys().next().value);
  }
}

function terminateCall({ activeCalls, endedCalls, io, userRoom, callId, endedBy, reason, now = Date.now() }) {
  const id = String(callId || '').trim();
  if (!id) return { ended: false, payload: null, code: 'invalid_call_id' };

  const call = activeCalls.get(id);
  if (!call) {
    const previous = endedCalls?.get(id);
    return {
      ended: false,
      payload: previous?.payload || buildCallEndedPayload(id, endedBy, reason),
      code: previous ? 'call_already_ended' : 'call_not_found'
    };
  }

  const payload = buildCallEndedPayload(id, endedBy, reason);
  call.endedAt = now;
  call.endedBy = payload.endedBy;
  call.endReason = payload.reason;
  activeCalls.delete(id);
  rememberEndedCall(endedCalls, payload, now);

  const recipients = new Set([
    String(call.callerId || ''),
    ...(call.participants || []),
    ...(call.invited || [])
  ]);
  for (const recipient of recipients) {
    if (recipient) io.to(userRoom(recipient)).emit('call:ended', payload);
  }

  return { ended: true, payload, code: 'call_ended' };
}

module.exports = {
  buildCallEndedPayload,
  normalizeCallEndReason,
  rememberEndedCall,
  terminateCall
};
