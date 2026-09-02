'use strict';

module.exports = Object.freeze({
  TEST_PIN_MODE: true,
  TEST_PIN: '123456',
  PIN_TTL_MS: 5 * 60 * 1000,
  PIN_MAX_ATTEMPTS: 5,
  PORT: process.env.PORT || 3000,
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || '',
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || '',
  VAPID_SUBJECT: process.env.VAPID_SUBJECT || 'mailto:admin@vobixchat.com'
});
