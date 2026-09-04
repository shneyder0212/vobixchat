'use strict';

const SERVICE_HELP = Object.freeze({
  'plus-storage': Object.freeze({ start:'Revise el espacio utilizado y elija una ampliación solamente cuando la necesite.', security:'Los archivos privados no se utilizan para publicidad. La ampliación no cambia los permisos de sus conversaciones.' }),
  'plus-translation': Object.freeze({ start:'Elija los idiomas y active traducción avanzada únicamente en los chats donde la necesite.', security:'No envíe contraseñas, códigos ni datos bancarios al traductor.' }),
  'plus-ai': Object.freeze({ start:'Active cada herramienta de IA por separado y revise siempre el resultado antes de compartirlo.', security:'La IA no debe recibir contraseñas, PIN, documentos de identidad ni información bancaria.' }),
  meet: Object.freeze({ start:'Cree una reunión, revise cámara y micrófono, comparta el enlace y abra la sala de espera.', security:'Use sala de espera, código temporal y permisos de moderación. No publique el enlace en lugares abiertos.' }),
  remote: Object.freeze({ start:'Genere un código temporal, confirme quién solicita ayuda y conceda solo los permisos necesarios.', security:'Nunca permita acceso bancario ni comparta contraseñas. Finalice la sesión si la persona o la solicitud no son reconocidas.' }),
  'verify-sign': Object.freeze({ start:'Prepare el documento, identifique a los firmantes y revise el resumen antes de solicitar firmas.', security:'Una firma cualificada solo se activará mediante un proveedor legal verificado. No se presenta como certificada antes de esa integración.' }),
  trade: Object.freeze({ start:'Cree una operación, añada participantes autorizados y organice los documentos antes de enviarlos.', security:'Compruebe identidades, permisos y versiones. Vobix no garantiza pagos, aduanas ni decisiones comerciales.' }),
  politics: Object.freeze({ start:'Cree una organización, defina el territorio y asigne responsables antes de invitar colaboradores.', security:'Separe permisos de campaña, voluntariado y administración. Registre consentimiento y cumpla la normativa electoral y de protección de datos.' }),
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
