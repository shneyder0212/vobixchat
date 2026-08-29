'use strict';

/**
 * VOBIXCHAT - Configuración interna del servidor
 * UBICACIÓN: RAÍZ DEL PROYECTO
 *
 * NO colocar dentro de /public.
 * Las credenciales secretas se leen desde variables de entorno.
 */

module.exports = Object.freeze({

  // ======================================================
  // MODO DE PRUEBAS / PIN
  // ======================================================

  // true = NO gastar SMS
  // false = producción / SMS real
  TEST_PIN_MODE: true,

  // PIN fijo para nuestras pruebas
  TEST_PIN: '123456',

  // Validez futura del PIN: 5 minutos
  PIN_TTL_MS: 5 * 60 * 1000,

  // Máximo de intentos
  PIN_MAX_ATTEMPTS: 5,

  // ======================================================
  // SERVIDOR
  // ======================================================

  PORT:
    process.env.PORT || 3000,

  // ======================================================
  // WEB PUSH / VAPID
  // ======================================================

  VAPID_PUBLIC_KEY:
    process.env.VAPID_PUBLIC_KEY || '',

  VAPID_PRIVATE_KEY:
    process.env.VAPID_PRIVATE_KEY || '',

  VAPID_SUBJECT:
    process.env.VAPID_SUBJECT ||
    'mailto:admin@vobixchat.com'

});
