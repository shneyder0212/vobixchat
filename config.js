'use strict';

module.exports = Object.freeze({
  // Solo para pruebas privadas. El PIN vive en Render como secreto,
  // nunca dentro de GitHub ni de la APK.
  TEST_PIN_MODE: process.env.TEST_PIN_MODE === 'true',
  TEST_PIN: process.env.TEST_PIN || '',
  PIN_TTL_MS: 5 * 60 * 1000,
  PIN_MAX_ATTEMPTS: 5,
  // Capa 3.3: se mantiene apagado hasta activar SMS real y probarlo.
  // Nunca se usa el tipo VoIP como causa única de rechazo.
  REGISTRATION_GUARD_ENABLED: process.env.REGISTRATION_GUARD_ENABLED === 'true',
  REGISTRATION_SENDS_PER_PHONE: Number(process.env.REGISTRATION_SENDS_PER_PHONE || 4),
  REGISTRATION_SENDS_PER_IP: Number(process.env.REGISTRATION_SENDS_PER_IP || 12),
  REGISTRATION_GUARD_WINDOW_MS: Number(process.env.REGISTRATION_GUARD_WINDOW_MS || 15 * 60 * 1000),
  // Panel privado del propietario. Debe configurarse en Render, nunca en GitHub.
  // Se admite el UUID interno o el teléfono normalizado de UNA sola cuenta.
  ADMIN_OWNER_USER_ID: process.env.ADMIN_OWNER_USER_ID || '',
  ADMIN_OWNER_PHONE: process.env.ADMIN_OWNER_PHONE || '',
  ADMIN_REAUTH_MAX_AGE_MS: Number(process.env.ADMIN_REAUTH_MAX_AGE_MS || 12 * 60 * 60 * 1000),
  PORT: process.env.PORT || 3000,
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || '',
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || '',
  VAPID_SUBJECT: process.env.VAPID_SUBJECT || 'mailto:admin@vobixchat.com'
});
