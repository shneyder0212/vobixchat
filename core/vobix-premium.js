/**
 * VOBIXCHAT - MOTOR DE LICENCIAS Y CONTROLES PREMIUM (CAPA C1.8)
 * Administra el acceso modular a características corporativas y de monetización.
 * Controla cuotas de catálogo, automatizaciones CRM y límites de mensajería masiva.
 */

class VobixPremiumManager {
    constructor() {
        // Estructura fija de capacidades y límites por tipo de nivel corporativo
        this.tierCapabilities = {
            FREE: {
                maxCatalogItems: 5,
                enableAutomatedReplies: false,
                enableMassMessaging: false,
                crmIntegration: false
            },
            BUSINESS_PLUS: {
                maxCatalogItems: 50,
                enableAutomatedReplies: true,
                enableMassMessaging: false,
                crmIntegration: true
            },
            ENTERPRISE_PRO: {
                maxCatalogItems: 1000,
                enableAutomatedReplies: true,
                enableMassMessaging: true,
                crmIntegration: true
            }
        };
        this.userSubscriptions = new Map(); // userId -> { tier: "FREE", expires: timestamp }
    }

    /**
     * Otorga o actualiza de forma segura un plan premium tras la confirmación de pago
     */
    upgradeUserSubscription(userId, selectedTier, durationDays = 30) {
        if (!this.tierCapabilities[selectedTier.toUpperCase()]) {
            console.error(`[Capa C1.8] Nivel de suscripción inválido intentado: ${selectedTier}`);
            return false;
        }

        const subscriptionState = {
            tier: selectedTier.toUpperCase(),
            expires: Date.now() + (durationDays * 24 * 60 * 60 * 1000)
        };

        this.userSubscriptions.set(userId, subscriptionState);
        console.log(`[Capa C1.8] Licencia comercial activa. Cuenta: ${userId} asignada a nivel ${selectedTier}`);

        return {
            success: true,
            currentSubscription: subscriptionState
        };
    }

    /**
     * Valida de forma estricta si una cuenta corporativa tiene acceso a una característica específica
     * @param {string} userId - ID de la cuenta comercial a auditar
     * @param {string} featureKey - Característica técnica ("enableMassMessaging", "crmIntegration", etc.)
     */
    verifyFeatureAccess(userId, featureKey) {
        const activeSub = this.userSubscriptions.get(userId);
        let activeTier = "FREE";

        // Comprobar validez temporal si tiene una suscripción premium registrada
        if (activeSub) {
            if (Date.now() < activeSub.expires) {
                activeTier = activeSub.tier;
            } else {
                // Degradación automática no invasiva tras vencer el plazo de la licencia
                this.userSubscriptions.delete(userId);
                console.warn(`[Capa C1.8] La suscripción premium de la cuenta ${userId} ha caducado.`);
            }
        }

        const tierLimits = this.tierCapabilities[activeTier];
        const isFeatureAllowed = tierLimits[featureKey] === true;

        return {
            allowed: isFeatureAllowed,
            currentTier: activeTier,
            limits: tierLimits
        };
    }

    /**
     * Control de cuota fija para el catálogo comercial avanzado de Vobix Negocios
     */
    canAddItemToCatalog(userId, currentTotalItems) {
        const accessCheck = this.verifyFeatureAccess(userId, "maxCatalogItems");
        const maxAllowed = this.tierCapabilities[accessCheck.currentTier].maxCatalogItems;

        if (currentTotalItems >= maxAllowed) {
            return {
                allowed: false,
                reason: "LIMIT_REACHED",
                message: `Has alcanzado el límite de tu plan (${maxAllowed} artículos). Mejora tu plan comercial en VobixChat para expandir tu catálogo.`
            };
        }

        return { allowed: true, currentLimit: maxAllowed };
    }
}

if (typeof module !== 'undefined') {
    module.exports = VobixPremiumManager;
}
