/**
 * VOBIXCHAT - MOTOR DE IA LOCAL ANTI-ESTAFAS (CAPA C1.2)
 * Procesamiento heurístico de lenguaje natural en el dispositivo.
 * Detecta fraudes financieros y suplantación de identidad sin romper el cifrado.
 */

class VobixAntiScamAI {
    constructor() {
        // Base de conocimiento heurística optimizada para fraudes comunes
        this.fraudMatrix = [
            {
                intent: "suplantacion_familiar",
                baseWeight: 45,
                keywords: [/cambie\s+de\s+numero/i, /cambi[eé]\s+el\s+celular/i, /este\s+es\s+mi\s+nuevo\s+n[uú]mero/i, /guarda\s+este\s+n[uú]mero/i, /soy\s+tu\s+hijo/i, /hola\s+pap[aá]/i, /hola\s+mam[aá]/i]
            },
            {
                intent: "urgencia_financiera",
                baseWeight: 50,
                keywords: [/transferencia\s+urgente/i, /necesito\s+dinero/i, /pago\s+movil/i, /cbu/i, /cvu/i, /cuenta\s+bloqueada/i, /prestarme\s+plata/i, /deposita/i]
            },
            {
                intent: "robo_credenciales",
                baseWeight: 55,
                keywords: [/codigo\s+de\s+confirmacion/i, /pasa\s+el\s+codigo/i, /token/i, /verificar\s+cuenta/i, /sms\s+que\s+te\s+llego/i, /clave/i]
            },
            {
                intent: "enlaces_phishing",
                baseWeight: 40,
                keywords: [/bit\.ly/i, /tinyurl/i, /t\.me/i, /\.xyz\b/i, /\.ru\b/i, /actualizar\-datos/i, /iniciar\-sesion/i]
            }
        ];
    }

    /**
     * Analiza el texto en tiempo real
     * @param {string} rawText - Texto del mensaje entrante
     * @param {boolean} isContactSaved - Si el número emisor está en la agenda del teléfono
     */
    evaluateTextRisk(rawText, isContactSaved = false) {
        if (!rawText) return { riskLevel: "SAFE", score: 0 };

        let totalScore = 0;
        let matchedIntents = [];
        const cleanText = rawText.trim();

        // Factor de desconfianza inicial si el número no está guardado en la agenda
        if (!isContactSaved) {
            totalScore += 25;
        }

        // Evaluar coincidencia de patrones de ingeniería social
        for (const item of this.fraudMatrix) {
            for (const regex of item.keywords) {
                if (regex.test(cleanText)) {
                    totalScore += item.baseWeight;
                    if (!matchedIntents.includes(item.intent)) {
                        matchedIntents.push(item.intent);
                    }
                    break; // Pasa al siguiente intento para no duplicar peso de la misma categoría
                }
            }
        }

        return this.generateProgressiveWarning(totalScore, matchedIntents);
    }

    /**
     * Clasifica el riesgo y define la alerta educativa exacta para guiar al usuario
     */
    generateProgressiveWarning(score, intents) {
        // RIESGO CRÍTICO (Puntuación mayor o igual a 75)
        if (score >= 75) {
            return {
                riskLevel: "CRITICAL_DANGER",
                score,
                actionRequired: "SHOW_CRITICAL_BANNER",
                badgeColor: "#D32F2F", // Rojo de alerta activa
                uiWarningText: "⚠️ Alerta Vobix Anti-Fraude: Este mensaje utiliza tácticas exactas de estafa telefónica. Vobix te recomienda encarecidamente NO enviar dinero, NO compartir códigos SMS y llamar inmediatamente al número telefónico habitual de tu familiar para verificar.",
                intents
            };
        } 
        // RIESGO MODERADO (Puntuación entre 45 y 74)
        else if (score >= 45) {
            return {
                riskLevel: "SUSPICIOUS_WARNING",
                score,
                actionRequired: "SHOW_NUDGE_ALERT",
                badgeColor: "#F57C00", // Naranja de advertencia
                uiWarningText: "💡 Sugerencia de Seguridad Vobix: Este mensaje detecta una petición inusual de dinero o datos. Tómate un momento para asegurar la identidad de la persona antes de responder.",
                intents
            };
        }
        
        // COMPLETAMENTE SEGURO
        return {
            riskLevel: "SAFE",
            score,
            actionRequired: "NONE",
            badgeColor: "TRANSPARENT",
            uiWarningText: "",
            intents: []
        };
    }
}

if (typeof module !== 'undefined') {
    module.exports = VobixAntiScamAI;
}
