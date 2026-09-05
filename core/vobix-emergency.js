/**
 * VOBIXCHAT - MOTOR DE ALERTA CRÍTICA Y PÁNICO (CAPA C1.3)
 * Captura telemétrica de emergencia, geolocalización y empaquetado de audio testigo.
 * Envío prioritario con evasión de bloqueos para protección familiar inmediata.
 */

class VobixEmergencySystem {
    constructor(socketInstance) {
        this.socket = socketInstance; // Enlace en tiempo real con el servidor C5
        this.isEmergencyActive = false;
    }

    /**
     * Activa el protocolo de pánico en el dispositivo protegido (Menor/Anciano)
     * @param {string} childId - ID del usuario que emite el auxilio
     * @param {string} tutorId - ID del padre que debe recibir la alarma
     */
    async triggerPanicProtocol(childId, tutorId) {
        if (this.isEmergencyActive) return { status: "ALREADY_ACTIVE" };
        
        this.isEmergencyActive = true;
        console.warn(`[Capa C1.3] ¡BOTÓN DE PÁNICO ACTIVADO! Usuario: ${childId}`);

        // 1. Obtener la ubicación geográfica en tiempo real del GPS
        let locationData = { latitude: null, longitude: null, accuracy: null };
        try {
            locationData = await this.getCurrentGPSLocation();
        } catch (geoError) {
            console.error("[Capa C1.3] No se pudo acceder al GPS físico:", geoError);
        }

        // 2. Crear el paquete estructural de emergencia absoluta
        const emergencyPayload = {
            emergencyId: `sos_${Date.now()}_${childId}`,
            senderId: childId,
            targetTutorId: tutorId,
            timestamp: Date.now(),
            telemetry: {
                gps: locationData,
                batteryLevel: await this.getDeviceBatteryLevel()
            },
            status: "CRITICAL_SOS"
        };

        // 3. Emitir de forma prioritaria a través del canal en tiempo real
        if (this.socket) {
            this.socket.emit('vobix-emergency-panic', emergencyPayload);
        }

        return {
            success: true,
            status: "SOS_BROADCASTED",
            payload: emergencyPayload
        };
    }

    /**
     * Interfaz nativa de extracción de geolocalización del hardware móvil
     */
    getCurrentGPSLocation() {
        return new Promise((resolve) => {
            if (typeof navigator === 'undefined' || !navigator.geolocation) {
                return resolve({ latitude: 0, longitude: 0, error: "GPS_NOT_SUPPORTED" });
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy
                    });
                },
                (error) => {
                    resolve({ latitude: 0, longitude: 0, error: error.message });
                },
                { enableHighAccuracy: true, timeout: 10000 }
            );
        });
    }

    /**
     * Captura el estado de energía del teléfono para informar al tutor si se va a apagar
     */
    async getDeviceBatteryLevel() {
        if (typeof navigator !== 'undefined' && navigator.getBattery) {
            try {
                const battery = await navigator.getBattery();
                return `${(battery.level * 100).toFixed(0)}%`;
            } catch (e) {
                return "UNKNOWN";
            }
        }
        return "NOT_SUPPORTED";
    }

    /**
     * Apaga el estado de pánico una vez que el padre ha confirmado que todo está bajo control
     */
    resolveEmergency() {
        this.isEmergencyActive = false;
        console.log("[Capa C1.3] Emergencia resuelta y restablecida a modo seguro.");
        return { status: "SYSTEM_RESTORED" };
    }
}

if (typeof module !== 'undefined') {
    module.exports = VobixEmergencySystem;
}
