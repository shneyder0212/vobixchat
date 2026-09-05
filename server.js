/**
 * VOBIXCHAT - NÚCLEO CENTRAL DEL SERVIDOR (CAPA C5.1)
 * Versión privada de pruebas por capas. Compatible con Render y Google Cloud.
 * Cero dependencias externas invasivas. Respeta cifrado y privacidad.
 */

const express = require('express');
const http = require('http');
const path = require('path'); // Librería nativa para manejo de rutas de archivos
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
    transports: ['websocket', 'polling']
});

// ==========================================
// CONFIGURACIÓN DE SEGURIDAD Y TELEMETRÍA (C2.3)
// ==========================================
const insistenceRegistry = new Map(); // senderPhone_childId -> [timestamps]
const MAX_ALERT_ATTEMPTS = 3;         // Intentos de insistencia permitidos
const TIME_WINDOW_MS = 60000;         // Ventana de tiempo (1 minuto)

// Servir de forma automática los archivos estáticos de la carpeta public (js, html, css)
app.use(express.static(path.join(__dirname, 'public')));

// Ruta principal: Carga la pantalla visual del chat y el entorno de llamadas
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Monitoreo de salud requerido por Render / Cloud Run
app.get('/healthz', (req, res) => {
    res.status(200).send('VOBIX_ACTIVE');
});

// Ruta de compatibilidad hacia atrás para evitar apagado de instancias
app.get('/ping', (req, res) => {
    res.send('VobixChat está despierto');
});

// ==========================================
// GESTIÓN DE SEÑALES WEBRTC Y MENSAJERÍA REALTIME
// ==========================================
const activeRooms = new Map(); // roomId -> Set(socketId)

io.on('connection', (socket) => {
    console.log(`[Vobix Engine] Dispositivo enlazado: ${socket.id}`);

    // Entrada a sala de comunicación segura (1x1 o Comunidad)
    socket.on('vobix-join', ({ roomId, userId, role }) => {
        socket.join(roomId);
        socket.userId = userId;
        socket.roomId = roomId;

        if (!activeRooms.has(roomId)) {
            activeRooms.set(roomId, new Set());
        }
        activeRooms.get(roomId).add(socket.id);

        // Envía los participantes existentes para interconexión Mesh P2P
        const existingParticipants = Array.from(activeRooms.get(roomId)).filter(id => id !== socket.id);
        socket.emit('vobix-current-participants', existingParticipants);
    });

    // Envío y reenvío de señales WebRTC directas
    socket.on('vobix-signal', ({ targetSocketId, signalData }) => {
        io.to(targetSocketId).emit('vobix-incoming-signal', {
            callerSocketId: socket.id,
            signalData
        });
    });

    // ==========================================
    // CAPA C2.3: MONITOREO DE ACOSO E INSISTENCIA
    // ==========================================
    socket.on('parental-track-insistence', ({ tutorId, childId, senderPhone }) => {
        const registryKey = `${senderPhone}_${childId}`;
        const now = Date.now();

        if (!insistenceRegistry.has(registryKey)) {
            insistenceRegistry.set(registryKey, []);
        }

        const history = insistenceRegistry.get(registryKey);
        history.push(now);

        // Limpiar registros antiguos fuera del rango de 1 minuto
        const recentHistory = history.filter(timestamp => (now - timestamp) < TIME_WINDOW_MS);
        insistenceRegistry.set(registryKey, recentHistory);

        // Si se detecta insistencia reiterada sobre el menor/adulto mayor
        if (recentHistory.length >= MAX_ALERT_ATTEMPTS) {
            console.warn(`[Alerta Parental] Acoso detectado hacia: ${childId}. Notificando a: ${tutorId}`);
            
            // Envío en tiempo real al canal privado del padre
            io.to(`user_${tutorId}`).emit('vobix-parental-emergency', {
                alertCode: "VOBIX_SECURITY_ALERT_01",
                childId: childId,
                offender: senderPhone,
                totalAttempts: recentHistory.length,
                timestamp: Date.now(),
                suggestion: "Bloqueo automático preventivo activado por el sistema Vobix."
            });
            
            socket.emit('parental-track-response', { status: "BLOCKED_BY_INSISTENCE" });
        } else {
            socket.emit('parental-track-response', { status: "TRACKING" });
        }
    });

    // Desconexión limpia y conservación de la sala para reingresos dinámicos
    socket.on('disconnect', () => {
        if (socket.roomId && activeRooms.has(socket.roomId)) {
            const roomSet = activeRooms.get(socket.roomId);
            roomSet.delete(socket.id);
            if (roomSet.size === 0) {
                activeRooms.delete(socket.roomId);
            } else {
                socket.to(socket.roomId).emit('vobix-participant-left', socket.id);
            }
        }
        console.log(`[Vobix Engine] Dispositivo desconectado: ${socket.id}`);
    });
});

// Inicio del servidor en el puerto dinámico de la nube
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[Vobix Core] Sistema corriendo sin errores en puerto ${PORT}`);
});
