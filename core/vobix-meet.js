/**
 * VOBIXCHAT - MOTOR DE CONTROL DE REUNIONES GRUPALES (CAPA C1.6)
 * Orquesta los estados de videoconferencia de Vobix Meet.
 * Gestiona de forma desacoplada roles, silencios y reingresos resilientes en red móvil.
 */

class VobixMeetRoomManager {
    constructor() {
        this.activeConferences = new Map(); // meetRoomId -> { creatorId, participants: Map(socketId -> userId), state }
    }

    /**
     * Crea e inicializa una nueva videoconferencia masiva o de grupo
     * @param {string} meetRoomId - ID único asignado a la sala de conferencias
     * @param {string} creatorUserId - ID del usuario que inicia la sesión
     */
    initiateMeetSession(meetRoomId, creatorUserId) {
        if (!this.activeConferences.has(meetRoomId)) {
            this.activeConferences.set(meetRoomId, {
                creatorId: creatorUserId,
                participants: new Map(), // socketId -> { userId, audioMuted: false, videoMuted: false }
                creationTimestamp: Date.now()
            });
            console.log(`[Capa C1.6] Sala Vobix Meet activada. ID: ${meetRoomId} por administrador: ${creatorUserId}`);
        }
        return this.activeConferences.get(meetRoomId);
    }

    /**
     * Registra un participante o gestiona su reingreso automático tras un microcorte de red
     * @param {string} meetRoomId - ID de la sala destino
     * @param {string} socketId - Identificador del canal del dispositivo actual
     * @param {string} userId - Identificador único de base de datos del usuario
     */
    registerParticipantJoining(meetRoomId, socketId, userId) {
        const session = this.activeConferences.get(meetRoomId);
        if (!session) return { error: "CONFERENCE_NOT_FOUND" };

        // Evitar duplicidades si el usuario se está reconectando desde el mismo u otro dispositivo
        for (const [sId, data] of session.participants.entries()) {
            if (data.userId === userId) {
                session.participants.delete(sId); // Limpia la conexión muerta anterior
            }
        }

        const participantState = {
            userId,
            audioMuted: false,
            videoMuted: false,
            joinedAt: Date.now()
        };

        session.participants.set(socketId, participantState);
        console.log(`[Capa C1.6] Usuario ${userId} enlazado a la conferencia ${meetRoomId} bajo canal ${socketId}`);

        // Retorna la lista de los demás participantes reales actuales en la sala para la negociación WebRTC P2P
        const activePeers = [];
        session.participants.forEach((value, key) => {
            if (key !== socketId) {
                activePeers.push({ socketId: key, userId: value.userId });
            }
        });

        return {
            success: true,
            activePeers,
            totalConnected: session.participants.size
        };
    }

    /**
     * Alterna de forma remota o local el estado de los periféricos de hardware (micrófono / cámara)
     */
    toggleMediaTrackState(meetRoomId, socketId, trackType) {
        const session = this.activeConferences.get(meetRoomId);
        if (!session || !session.participants.has(socketId)) return false;

        const participant = session.participants.get(socketId);
        if (trackType === 'audio') {
            participant.audioMuted = !participant.audioMuted;
        } else if (trackType === 'video') {
            participant.videoMuted = !participant.videoMuted;
        }

        return {
            socketId,
            userId: participant.userId,
            audioMuted: participant.audioMuted,
            videoMuted: participant.videoMuted
        };
    }

    /**
     * Remueve un participante cuando cuelga o abandona la sala de forma voluntaria
     */
    removeParticipantLeaving(meetRoomId, socketId) {
        const session = this.activeConferences.get(meetRoomId);
        if (!session) return false;

        if (session.participants.has(socketId)) {
            const data = session.participants.get(socketId);
            session.participants.delete(socketId);
            console.log(`[Capa C1.6] Usuario ${data.userId} abandonó la videoconferencia ${meetRoomId}.`);

            // Si la sala se queda vacía por completo, se libera memoria del servidor de inmediato
            if (session.participants.size === 0) {
                this.activeConferences.delete(meetRoomId);
                console.log(`[Capa C1.6] Videoconferencia ${meetRoomId} cerrada por falta de participantes.`);
            }
            return true;
        }
        return false;
    }
}

if (typeof module !== 'undefined') {
    module.exports = VobixMeetRoomManager;
}
