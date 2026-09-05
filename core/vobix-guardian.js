/**
 * VOBIXCHAT - MOTOR DE GESTIÓN Y PROTECCIÓN PARENTAL (CAPA C2.4)
 * Administrador de listas de confianza, perfiles protegidos y bloqueos preventivos.
 * Sincroniza las alertas del servidor con la interfaz de administración del tutor.
 */

class VobixGuardianEngine {
    constructor() {
        this.guardians = new Map(); // tutorId -> { protectedUserIds: [], trustedPhones: [] }
        this.globalBannedList = new Set(); // Números bloqueados permanentemente por acoso
    }

    /**
     * Registra un nuevo núcleo familiar de protección
     * @param {string} tutorId - Identificador único del padre o administrador
     */
    registerGuardianProfile(tutorId) {
        if (!this.guardians.has(tutorId)) {
            this.guardians.set(tutorId, {
                protectedUserIds: [],
                trustedPhones: []
            });
            console.log(`[Capa C2.4] Tutor registrado con éxito. ID: ${tutorId}`);
        }
    }

    /**
     * Vincula a un menor o adulto mayor al escudo del tutor
     */
    linkProtectedMember(tutorId, childId) {
        const profile = this.guardians.get(tutorId);
        if (profile && !profile.protectedUserIds.includes(childId)) {
            profile.protectedUserIds.push(childId);
            console.log(`[Capa C2.4] Cuenta protegida ${childId} enlazada al tutor ${tutorId}`);
        }
    }

    /**
     * Añade un número telefónico seguro (Familiares, amigos autorizados)
     */
    authorizeTrustedPhone(tutorId, phone) {
        const profile = this.guardians.get(tutorId);
        if (profile && !profile.trustedPhones.includes(phone)) {
            profile.trustedPhones.push(phone);
            console.log(`[Capa C2.4] Número ${phone} añadido a la lista de confianza del tutor ${tutorId}`);
        }
    }

    /**
     * Procesa la alerta crítica de insistencia generada en el servidor (Capa C5.1)
     * @param {Object} alertPayload - Datos de la alerta de acoso recibida por WebSocket
     */
    processIncomingParentalEmergency(alertPayload) {
        const { childId, offender, totalAttempts, suggestion } = alertPayload;
        
        console.warn(`[Capa C2.4] PROCESANDO ALERTA CRÍTICA: El agresor ${offender} atacó a la cuenta ${childId} con ${totalAttempts} intentos.`);
        
        // Retorna un paquete limpio estructurado para pintar la notificación en la pantalla del padre
        return {
            displayNotification: true,
            title: "🛑 Alerta Crítica Vobix Guard",
            body: `El número ${offender} ha intentado comunicarse repetidamente con tu hijo en menos de un minuto de forma sospechosa. El sistema ha congelado los intentos de forma automática para protegerlo.`,
            metaData: {
                offenderPhone: offender,
                childTarget: childId,
                actionExecuted: "AUTOMATIC_SILENT_BLOCK",
                recommendedNextStep: "BAN_PERMANENT",
                systemSuggestion: suggestion
            }
        };
    }

    /**
     * Ejecuta el baneo permanente de un número telefónico sospechoso
     */
    executePermanentBan(offendingPhone) {
        if (offendingPhone) {
            this.globalBannedList.add(offendingPhone);
            console.log(`[Capa C2.4] BLOQUEO ABSOLUTO: El número ${offendingPhone} fue expulsado del entorno familiar.`);
            return { success: true, bannedPhone: offendingPhone, status: "BLACKLISTED" };
        }
        return { success: false };
    }
}

if (typeof module !== 'undefined') {
    module.exports = VobixGuardianEngine;
}
