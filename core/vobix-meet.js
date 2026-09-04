'use strict';

const crypto = require('crypto');

const MAX_MEETING_MINUTES = 240;
const MAX_PARTICIPANTS = 1000;

function cleanMeetingTitle(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 120);
}

function createMeetingCode() {
  return crypto.randomBytes(6).toString('base64url').toUpperCase();
}

function normalizeMeetingCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z0-9_-]{8,16}$/.test(code) ? code : '';
}

function hashMeetingCode(code) {
  return crypto.createHash('sha256').update(String(code || '')).digest('hex');
}

function normalizeMeetingOptions(input = {}) {
  return {
    title: cleanMeetingTitle(input.title) || 'Reunión Vobix',
    waitingRoom: input.waitingRoom !== false,
    allowGuests: input.allowGuests === true,
    maxParticipants: Math.max(2, Math.min(MAX_PARTICIPANTS, Number.parseInt(input.maxParticipants, 10) || MAX_PARTICIPANTS)),
    durationMinutes: Math.max(15, Math.min(MAX_MEETING_MINUTES, Number.parseInt(input.durationMinutes, 10) || 60))
  };
}

module.exports = {
  MAX_MEETING_MINUTES,
  MAX_PARTICIPANTS,
  cleanMeetingTitle,
  createMeetingCode,
  hashMeetingCode,
  normalizeMeetingCode,
  normalizeMeetingOptions
};
