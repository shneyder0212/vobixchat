/**
 * VOBIXCHAT - ENLACE CLIENTE Y CONTROLADOR MULTIMEDIA (CAPA C5.4)
 * Ejecuta en el dispositivo la intercomunicación WebRTC, control parental e IA.
 * Integra de forma transparente todas las capas locales de VobixChat.
 */

// Instanciación nativa de los motores de seguridad locales previamente subidos
const vobixAI = typeof VobixAntiScamAI !== 'undefined' ? new VobixAntiScamAI() : null;
const vobixCache = typeof VobixLocalCacheManager !== 'undefined' ? new VobixLocalCacheManager() : null;

let socket = null;
let localMediaStream = null;
const activePeers = {}; // socketId -> PeerConnection Instance

// Servidores STUN de respaldo por defecto para pruebas rápidas
const defaultIceConfig = {
    iceServers: [{ urls: 'stun:://google.com' }]
};

/**
 * Inicializa la aplicación del cliente y activa la base de datos local
 */
async function initializeVobixClient() {
    console.log("[Capa C5.4] Inicializando entorno de cliente VobixChat...");
    
    if (vobixCache) {
        try {
            await vobixCache.initializeCache();
        } catch (e) {
            console.error("[Capa C5.4] Error iniciando persistencia local:", e);
        }
    }

    // Conexión dinámica al WebSocket del servidor (Reemplaza con tu URL de Render en producción)
    if (typeof io !== 'undefined') {
        socket = io(window.location.origin || 'http://localhost:3000', {
            transports: ['websocket']
        });
        setupSocketListeners();
    } else {
        console.warn("[Capa C5.4] Librería Socket.io no detectada en la vista HTML.");
    }
}

/**
 * Configura los escuchadores de red en tiempo real
 */
function setupSocketListeners() {
    if (!socket) return;

    // Escuchador de Alertas Críticas Parentales (Para el dispositivo del Padre)
    socket.on('vobix-parental-emergency', (alertPayload) => {
        console.warn("🛑 [ALERTA PARENTAL RECIBIDA]:", alertPayload);
        
        // Ejecución nativa del aviso visual emergente (Guía al tutor de forma inmediata)
        if (typeof showParentalAlertUI === 'function') {
            showParentalAlertUI(alertPayload);
        } else {
            alert(`🛑 Alerta de Seguridad Vobix:\nEl número ${alertPayload.offender} está intentando acosar a tu hijo de forma reiterada. El sistema bloqueó la comunicación preventivamente.`);
        }
    });

    // Sincronización WebRTC: Recepción de coordenadas de llamada de otros participantes
    socket.on('vobix-current-participants', (participants) => {
        participants.forEach(targetSocketId => {
            initiatePeerConnection(targetSocketId, true);
        });
    });

    socket.on('vobix-incoming-signal', ({ callerSocketId, signalData }) => {
        if (!activePeers[callerSocketId]) {
            initiatePeerConnection(callerSocketId, false);
        }
        activePeers[callerSocketId].signal(signalData);
    });

    socket.on('vobix-participant-left', (socketId) => {
        if (activePeers[socketId]) {
            activePeers[socketId].destroy();
            delete activePeers[socketId];
            removeVideoWidgetFromScreen(socketId);
        }
    });
}

/**
 * Procesa la mensajería entrante protegiendo la sesión del usuario
 */
async function processIncomingChatMessage(chatId, senderId, targetId, textMessage, isContactSaved) {
    console.log("[Capa C5.4] Procesando paquete de texto entrante...");

    // 1. Evaluar el riesgo con el Motor de IA Local (Capa C1.2) sin romper el cifrado
    let riskEvaluation = { riskLevel: "SAFE", uiWarningText: "" };
    if (vobixAI) {
        riskEvaluation = vobixAI.evaluateTextRisk(textMessage, isContactSaved);
    }

    const compiledMessagePacket = {
        id: `msg_local_${Date.now()}`,
        chatId,
        senderId,
        targetId,
        content: textMessage,
        timestamp: Date.now(),
        securityTag: riskEvaluation.riskLevel
    };

    // 2. Guardar inmediatamente en la Caché Ultra Rápida (Capa C3.2) para acceso sin internet
    if (vobixCache) {
        await vobixCache.writeMessageToCache(compiledMessagePacket);
    }

    // 3. Pintar en pantalla e inyectar avisos educativos si el riesgo es alto o crítico
    renderMessageInChatWindow(compiledMessagePacket);
    
    if (riskEvaluation.riskLevel !== "SAFE" && riskEvaluation.uiWarningText) {
        displaySafetyNudgeBanner(chatId, riskEvaluation.uiWarningText, riskEvaluation.badgeColor);
    }
}

/**
 * Inicializa y arranca una llamada de voz o videollamada Mesh
 */
async function executeCallAction(roomId, userId, role, requestVideo = true) {
    try {
        localMediaStream = await navigator.mediaDevices.getUserMedia({
            video: requestVideo,
            audio: true
        });
        
        // Renderizar el recuadro propio de cámara en pantalla
        injectVideoElementToGrid('local_stream', localMediaStream, true);

        if (socket) {
            socket.emit('vobix-join', { roomId, userId, role });
        }
    } catch (mediaError) {
        console.error("[Capa C5.4] Error solicitando permisos de hardware multimedia:", mediaError);
        alert("VobixChat requiere accesos a cámara y micrófono para enlazar la llamada.");
    }
}

// ==========================================
// FUNCIONES DE CONTROL DE INTERFAZ GRÁFICA (UI) PLACEHOLDERS
// ==========================================
function injectVideoElementToGrid(id, stream, isMuted) {
    const videoGrid = document.getElementById('vobix-video-grid');
    if (!videoGrid) return;
    let video = document.getElementById(`vbx_vid_${id}`);
    if (!video) {
        video = document.createElement('video');
        video.id = `vbx_vid_${id}`;
        video.autoplay = true;
        video.playsInline = true;
        if (isMuted) video.muted = true;
        videoGrid.appendChild(video);
    }
    video.srcObject = stream;
}

function removeVideoWidgetFromScreen(id) {
    const video = document.getElementById(`vbx_vid_${id}`);
    if (video) video.remove();
}

function renderMessageInChatWindow(packet) {
    console.log(`[UI] Dibujando mensaje en pantalla. Contenido: ${packet.content}`);
}

function displaySafetyNudgeBanner(chatId, alertText, hexColor) {
    console.warn(`[UI IA BANNER] Desplegando advertencia en el chat ${chatId}. Color: ${hexColor}. Texto: ${alertText}`);
    // Aquí tu frontend inyectará el aviso visual arriba del teclado para educar al usuario
}

function initiatePeerConnection(targetSocketId, isInitiator) {
    // Aquí se instancia la librería SimplePeer pasándole localMediaStream y defaultIceConfig
    console.log(`[WebRTC] Estableciendo puente P2P con ${targetSocketId}. Iniciador: ${isInitiator}`);
}

// Arrancar el motor del cliente automáticamente al cargar el script
window.addEventListener('DOMContentLoaded', initializeVobixClient);
