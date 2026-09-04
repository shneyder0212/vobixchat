'use strict';

const crypto = require('crypto');

const MIN_GUARDIANS = 2;
const MAX_GUARDIANS = 5;
const WAIT_HOURS = 24;
const REQUEST_HOURS = 72;

function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function normalizeThreshold(value, guardianCount) {
  const count = Number(guardianCount);
  const threshold = Number(value);
  if (!Number.isInteger(count) || count < MIN_GUARDIANS || count > MAX_GUARDIANS) return null;
  if (!Number.isInteger(threshold) || threshold < MIN_GUARDIANS || threshold > count) return null;
  return threshold;
}

function createRecoverySecret() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashRecoverySecret(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function safeDeviceLabel(value) {
  return String(value || 'Nuevo dispositivo').replace(/<[^>]*>/g, ' ').replace(/[\r\n<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Nuevo dispositivo';
}

function requestState(row, now = new Date()) {
  if (!row) return 'missing';
  if (['cancelled', 'completed', 'expired', 'rejected'].includes(row.status)) return row.status;
  if (new Date(row.expires_at) <= now) return 'expired';
  const approvals = Number(row.approval_count || 0);
  const threshold = Number(row.threshold_required || 0);
  if (approvals < threshold) return 'waiting_approvals';
  if (!row.ready_at || new Date(row.ready_at) > now) return 'security_wait';
  return 'ready';
}

module.exports = {
  MIN_GUARDIANS,
  MAX_GUARDIANS,
  WAIT_HOURS,
  REQUEST_HOURS,
  validUuid,
  normalizeThreshold,
  createRecoverySecret,
  hashRecoverySecret,
  safeDeviceLabel,
  requestState
};
