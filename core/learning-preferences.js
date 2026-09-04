'use strict';

const THEMES = Object.freeze(['vobix-green', 'ocean-blue', 'purple', 'warm']);
const TUTOR_VOICES = Object.freeze(['female', 'male', 'neutral']);
const VOICE_SPEEDS = Object.freeze(['slow', 'normal', 'fast']);
const ACCENTS = Object.freeze([
  'auto', 'en-US', 'en-GB', 'es-419', 'es-ES', 'it-IT',
  'fr-FR', 'de-DE', 'pt-BR', 'nl-NL', 'ja-JP', 'zh-CN'
]);

function pick(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function normalizeLearningPreferences(input = {}) {
  return {
    theme: pick(String(input.theme || ''), THEMES, 'vobix-green'),
    darkMode: input.darkMode === true,
    highContrast: input.highContrast === true,
    tutorVoice: pick(String(input.tutorVoice || ''), TUTOR_VOICES, 'female'),
    accent: pick(String(input.accent || ''), ACCENTS, 'auto'),
    voiceSpeed: pick(String(input.voiceSpeed || ''), VOICE_SPEEDS, 'normal')
  };
}

module.exports = {
  ACCENTS,
  THEMES,
  TUTOR_VOICES,
  VOICE_SPEEDS,
  normalizeLearningPreferences
};
