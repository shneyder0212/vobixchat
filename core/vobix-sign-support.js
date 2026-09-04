'use strict';

const SIGN_SYSTEMS=Object.freeze(['LSE','ASL','BSL']);
const SPOKEN_LOCALES=Object.freeze(['es-ES','en-US','en-GB','fr-FR','de-DE','it-IT']);

function safeSignSystem(value){const system=String(value||'').trim().toUpperCase();return SIGN_SYSTEMS.includes(system)?system:null;}
function safeSpokenLocale(value){const locale=String(value||'').trim();return SPOKEN_LOCALES.includes(locale)?locale:null;}
function safeTextSize(value){const size=Number(value);return Number.isInteger(size)&&size>=18&&size<=48?size:28;}
function safePreferences(value={}){return {signSystem:safeSignSystem(value.signSystem)||'LSE',spokenLocale:safeSpokenLocale(value.spokenLocale)||'es-ES',textSize:safeTextSize(value.textSize),highContrast:value.highContrast===true};}

module.exports={SIGN_SYSTEMS,SPOKEN_LOCALES,safePreferences,safeSignSystem,safeSpokenLocale,safeTextSize};
