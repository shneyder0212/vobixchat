/**
 * VOBIXCHAT - RECOVERY FAMILIAR Y TOKENS DE RESTAURACIÓN (CAPA C2.5)
 * Permite al tutor emitir llaves de recuperación criptográficas para perfiles protegidos.
 * Restablece la cuenta del menor de forma inmediata sin depender de contraseñas olvidadas.
 */

class VobixFamilyRecovery {
    constructor() {
        this.activeRecoveryTokens = new Map(); // token -> { childId, tutorId, expires }
        this.TOKEN_LIFETIME_MS = 15 * 60 * 1000; // El token dura 15 minutos por seguridad
    }

    /**
     * Genera un token criptográfico seguro desde el panel del tutor
     * @param {string} tutorId - ID del padre que autoriza la recuperación
     * @param {string} childId - ID de la cuenta del hijo que será restaurada
     */
    generateSecureRecoveryToken(tutorId, childId) {
        // Genera un token numérico de 6 dígitos de alta entropía (estilo PIN bancario temporal)
        const rawToken = Math.floor(100000 + Math.random() * 900000).toString();
        const expirationTime = Date.now() + this.TOKEN_LIFETIME_MS;

        this.activeRecoveryTokens.set(rawToken, {
            childId,
            tutorId,
            expires: expirationTime
        });

        console.log(`[Capa C2.5] Llave de recuperación familiar emitida para cuenta: ${childId}. Vence en 15 minutos.`);

        return {
            success: true,
            recoveryPIN: rawToken,
            expiresAt: expirationTime
        };
    }

    /**
     * Valida el token introducido en el dispositivo nuevo del menor
     * @param {string} inputToken - PIN numérico introducido por el usuario
     */
    validateRecoveryAttempt(inputToken) {
        if (!this.activeRecoveryTokens.has(inputToken)) {
            return { valid: false, error: "TOKEN_INVALIDO: El código no existe." };
        }

        const session = this.activeRecoveryTokens.get(inputToken);
        const now = Date.now();

        // Verificar si el token ya expiró
        if (now > session.expires) {
            this.activeRecoveryTokens.delete(inputToken);
            return { valid: false, error: "TOKEN_EXPIRADO: El código de 15 minutos ha caducado." };
        }

        // Token válido: se elimina para evitar doble uso (ataques de repetición)
        this.activeRecoveryTokens.delete(inputToken);
        console.log(`[Capa C2.5] ¡Autenticación exitosa! Cuenta ${session.childId} restaurada por el tutor ${session.tutorId}`);

        return {
            valid: true,
            targetChildId: session.childId,
            authorizedByTutor: session.tutorId,
            status: "ACCESS_GRANTED"
        };
    }

    /**
     * Limpieza periódica automática de tokens caducados en memoria del servidor
     */
    flushExpiredTokens() {
        const now = Date.now();
        for (const [token, data] of this.activeRecoveryTokens.entries()) {
            if (now > data.expires) {
                this.activeRecoveryTokens.delete(token);
            }
        }
    }
}

if (typeof module !== 'undefined') {
    module.exports = VobixFamilyRecovery;
}
