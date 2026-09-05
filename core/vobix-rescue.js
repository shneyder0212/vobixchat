/**
 * VOBIXCHAT - MOTOR DE RESCATE EN REDES DÉBILES (CAPA C1.10)
 * Monitoreo de latencia y bitrate en redes móviles 3G/4G inestables.
 * Aplica degradación adaptativa para salvar la llamada antes de una desconexión.
 */

class VobixNetworkRescueEngine {
    constructor() {
        // Rangos de tolerancia técnica para la calidad de la conexión
        this.networkThresholds = {
            EXCELLENT: { maxLatencyMs: 100, packetLossLimit: 0.02, action: "MAX_QUALITY" },
            STABLE:    { maxLatencyMs: 250, packetLossLimit: 0.05, action: "REDUCE_VIDEO_720P" },
            CRITICAL:  { maxLatencyMs: 500, packetLossLimit: 0.15, action: "FORCE_AUDIO_ONLY" },
            DROPPED:   { maxLatencyMs: 1000, packetLossLimit: 0.40, action: "ACTIVATE_HOLD_MODE" }
        };
        this.currentStatus = "EXCELLENT";
    }

    /**
     * Evalúa los parámetros de red capturados en tiempo real por el cliente WebRTC
     * @param {number} currentLatencyMs - Latencia de red actual en milisegundos (Ping)
     * @param {number} packetLossRate - Tasa de pérdida de paquetes de datos (de 0.0 a 1.0)
     */
    evaluateConnectionHealth(currentLatencyMs, packetLossRate) {
        let targetStatus = "EXCELLENT";

        if (currentLatencyMs > this.networkThresholds.DROPPED.maxLatencyMs || packetLossRate > this.networkThresholds.DROPPED.packetLossLimit) {
            targetStatus = "DROPPED";
        } else if (currentLatencyMs > this.networkThresholds.CRITICAL.maxLatencyMs || packetLossRate > this.networkThresholds.CRITICAL.packetLossLimit) {
            targetStatus = "CRITICAL";
        } else if (currentLatencyMs > this.networkThresholds.STABLE.maxLatencyMs || packetLossRate > this.networkThresholds.STABLE.packetLossLimit) {
            targetStatus = "STABLE";
        }

        this.currentStatus = targetStatus;
        const executionPlan = this.networkThresholds[this.currentStatus];

        console.log(`[Capa C1.10] Estado de red Vobix: ${this.currentStatus} | Latencia: ${currentLatencyMs}ms | Pérdida: ${(packetLossRate * 100).toFixed(1)}%`);

        return this.triggerAdaptiveRescuePlan(executionPlan.action);
    }

    /**
     * Ejecuta las directrices técnicas para salvar la transmisión multimedia
     */
    triggerAdaptiveRescuePlan(actionCode) {
        switch (actionCode) {
            case "REDUCE_VIDEO_720P":
                return {
                    status: "ADAPTIVE_RESCUE_ACTIVE",
                    videoConstraints: { width: 1280, height: 720, frameRate: 20 },
                    audioBitrateKbps: 32,
                    uiMessage: "Ajustando resolución por fluctuación de red."
                };

            case "FORCE_AUDIO_ONLY":
                console.warn("[Capa C1.10] Red crítica detectada. Desconectando video para salvar la voz.");
                return {
                    status: "CRITICAL_AUDIO_ONLY",
                    videoConstraints: false, // Apaga la cámara automáticamente para liberar ancho de banda
                    audioBitrateKbps: 16,     // Reduce Opus a consumo mínimo de alta eficiencia
                    uiMessage: "Señal débil. Modo de solo audio activado para evitar caídas."
                };

            case "ACTIVATE_HOLD_MODE":
                console.error("[Capa C1.10] Conexión rota temporalmente. Congelando sesión en espera de reconexión.");
                return {
                    status: "CONNECTION_HOLD",
                    videoConstraints: false,
                    audioBitrateKbps: 0,
                    uiMessage: "Intentando reconectar... No cuelgues."
                };

            case "MAX_QUALITY":
            default:
                return {
                    status: "STABLE_MAX_PERFORMANCE",
                    videoConstraints: { width: 1920, height: 1080, frameRate: 30 },
                    audioBitrateKbps: 64,
                    uiMessage: ""
                };
        }
    }
}

if (typeof module !== 'undefined') {
    module.exports = VobixNetworkRescueEngine;
}
