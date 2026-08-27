'use strict';

/**
 * VOBIXCHAT - Configuración interna del servidor
 * UBICACIÓN: RAÍZ DEL PROYECTO
 *
 * NO colocar dentro de /public.
 * No contiene credenciales ni claves secretas.
 */

module.exports = Object.freeze({

  // MODO DE PRUEBAS
  // true = NO gastar SMS
  // false = producción / SMS real
  TEST_PIN_MODE: true,

  // PIN fijo para nuestras pruebas
  TEST_PIN: '123456',

  // Validez futura del PIN: 5 minutos
  PIN_TTL_MS: 5 * 60 * 1000,

  // Máximo de intentos
  PIN_MAX_ATTEMPTS: 5

});