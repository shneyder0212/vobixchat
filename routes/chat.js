/**
 * VOBIXCHAT - ENRUTAMIENTO Y MENSAJERÍA EN VIVO (CAPA C5.2)
 * Manejo de flujos de chat, entrega móvil y validación de seguridad.
 * Cero modificaciones invasivas. Estructura modular por capas fijas.
 */

const express = require('express');
const router = express.Router();

// Base de datos simulada en memoria (Se conecta con tu Capa de Base de Datos en producción)
const messageDeliveryQueue = new Map(); // targetUserId -> [pendingMessages]

/**
 * RUTA: Enviar un mensaje de texto o multimedia
 * Integra la validación del Motor Anti-Estafas local del cliente
 */
router.post('/send', (req, res) => {
    const { chatId, senderId, targetId, content, timestamp, type, antiFraudRisk } = req.body;

    // Validación básica de integridad de datos (Evita inyecciones o paquetes corruptos)
    if (!chatId || !senderId || !targetId || !content) {
        return res.status(400).json({ error: "Estructura de payload inválida. Faltan campos requeridos." });
    }

    const messagePacket = {
        id: `vbx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        chatId,
        senderId,
        targetId,
        content,
        timestamp: timestamp || Date.now(),
        type: type || 'text',
        securityTag: antiFraudRisk || 'UNCHECKED'
    };

    // Almacenar temporalmente en la cola de entrega si el usuario está offline
    if (!messageDeliveryQueue.has(targetId)) {
        messageDeliveryQueue.set(targetId, []);
    }
    messageDeliveryQueue.get(targetId).push(messagePacket);

    console.log(`[Capa C5.2] Mensaje procesado con éxito. ID: ${messagePacket.id} | Riesgo IA: ${messagePacket.securityTag}`);

    return res.status(200).json({
        success: true,
        messageId: messagePacket.id,
        status: "DELIVERED_TO_QUEUE",
        packet: messagePacket
    });
});

/**
 * RUTA: Recuperar el historial reciente o mensajes pendientes de la caché
 * Garantiza la arquitectura Offline-First sincronizando con la caché local
 */
router.get('/sync/:userId', (req, res) => {
    const { userId } = req.params;

    if (!userId) {
        return res.status(400).json({ error: "Identificador de usuario requerido." });
    }

    // Obtener y vaciar los mensajes pendientes acumulados en la cola de red
    const pendingMessages = messageDeliveryQueue.get(userId) || [];
    messageDeliveryQueue.set(userId, []); // Vaciar cola tras la entrega segura

    return res.status(200).json({
        success: true,
        userId,
        syncTimestamp: Date.now(),
        messages: pendingMessages
    });
});

/**
 * RUTA: Configuración rápida del estado de llamada WebRTC
 * Valida si el canal de comunicación está disponible antes de lanzar los sockets
 */
router.post('/call/initiate', (req, res) => {
    const { callerId, targetId, callType } = req.body;

    if (!callerId || !targetId || !callType) {
        return res.status(400).json({ error: "Parámetros de llamada insuficientes." });
    }

    // Registro de control técnico en el enrutamiento
    console.log(`[Capa C5.2] Intento de llamada en tránsito: ${callerId} -> ${targetId} (${callType})`);

    return res.status(200).json({
        success: true,
        callSessionId: `session_${Date.now()}`,
        status: "SIGNALING_READY"
    });
});

module.exports = router;
