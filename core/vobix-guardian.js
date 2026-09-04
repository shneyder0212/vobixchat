'use strict';

const REVIEW_CATEGORIES = Object.freeze(['money', 'document', 'code']);
const REVIEW_DECISIONS = Object.freeze(['approved', 'rejected']);

function normalizeCategory(value) {
  const category = String(value || '').trim().toLowerCase();
  return REVIEW_CATEGORIES.includes(category) ? category : null;
}

function safeSummary(category, value) {
  const normalized = normalizeCategory(category);
  if (!normalized) return '';
  if (normalized === 'code') return 'El usuario solicita orientación antes de compartir un código.';
  const text = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 240);
  // Nunca transportar números de cuenta, tarjetas, teléfonos, PIN u OTP.
  return text
    .replace(/\b(?:\d[ -]?){6,}\b/g, '[dato protegido]')
    .replace(/\b(?:pin|otp|contrase(?:ñ|n)a|c[oó]digo)\s*[:=-]?\s*\S+/gi, '$1 [dato protegido]');
}

function normalizeDecision(value) {
  const decision = String(value || '').trim().toLowerCase();
  return REVIEW_DECISIONS.includes(decision) ? decision : null;
}

module.exports = { REVIEW_CATEGORIES, REVIEW_DECISIONS, normalizeCategory, safeSummary, normalizeDecision };
