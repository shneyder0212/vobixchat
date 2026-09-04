'use strict';

const SERVICE_HELP = Object.freeze({
  meet: Object.freeze({ start:'Cree una reunión, revise cámara y micrófono, comparta el enlace y abra la sala de espera.', security:'Use sala de espera, código temporal y permisos de moderación. No publique el enlace en lugares abiertos.' }),
  remote: Object.freeze({ start:'Genere un código temporal, confirme quién solicita ayuda y conceda solo los permisos necesarios.', security:'Nunca permita acceso bancario ni comparta contraseñas. Finalice la sesión si la persona o la solicitud no son reconocidas.' }),
  'verify-sign': Object.freeze({ start:'Prepare el documento, identifique a los firmantes y revise el resumen antes de solicitar firmas.', security:'Una firma cualificada solo se activará mediante un proveedor legal verificado. No se presenta como certificada antes de esa integración.' }),
  trade: Object.freeze({ start:'Cree una operación, añada participantes autorizados y organice los documentos antes de enviarlos.', security:'Compruebe identidades, permisos y versiones. Vobix no garantiza pagos, aduanas ni decisiones comerciales.' }),
  business: Object.freeze({ start:'Cree el espacio de empresa, asigne administradores y después configure equipos, canales y permisos.', security:'Conceda privilegios mínimos, revise administradores y retire accesos cuando una persona deje el equipo.' })
});

function containsSensitiveData(text) {
  return /\b(?:\d[ -]?){6,}\b/.test(text) ||
    /\b(?:password|contrase(?:ñ|n)a|pin|otp|c[oó]digo|tarjeta|cuenta bancaria)\s*(?:es|:)/i.test(text);
}

function localPremiumHelp(capabilityId, question) {
  const guide = SERVICE_HELP[capabilityId];
  if (!guide) return null;
  const value = String(question || '').toLowerCase();
  if (/segur|fraude|permiso|privacidad|contrase/.test(value)) return guide.security;
  return guide.start;
}

module.exports = { SERVICE_HELP, containsSensitiveData, localPremiumHelp };
