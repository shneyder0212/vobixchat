const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// SOLUCIÓN AL CANNOT GET: Escucha la raíz y busca el archivo de forma directa en la carpeta principal
app.get('/', (req, res) => {
    // Intenta buscar si tu archivo de interfaz se llama index.html
    res.sendFile(path.join(__dirname, 'index.html'), (err) => {
        if (err) {
            // Si no lo encuentra, busca automáticamente si lo renombraste como vobixchat.html
            res.sendFile(path.join(__dirname, 'vobixchat.html'), (err2) => {
                if (err2) {
                    res.status(404).send("<h1>[SYS ERROR]: No se encontró el archivo HTML de VobixChat en la raíz del proyecto. Renómbralo a index.html o vobixchat.html</h1>");
                }
            });
        }
    });
});

io.on('connection', (socket) => {
    console.log(`[SYS]: Agente conectado al canal cuántico -> ID: ${socket.id}`);

    // 1. TRANSMISIÓN DE MENSAJES DE TEXTO CIFRADOS
    socket.on('chat-message', (data) => {
        // Retransmite el mensaje de texto a todos los demás agentes conectados
        socket.broadcast.emit('chat-message', data);
    });

    // 2. SEÑALIZACIÓN WEBRTC: TRANSMISIÓN DE OFERTA DE LLAMADA/VIDEO HD
    socket.on('webrtc-offer', (data) => {
        console.log(`[SYS]: Oferta WebRTC recibida de ${socket.id} (Modo: ${data.mode})`);
        // Reenvía la oferta a los demás dispositivos enlazados
        socket.broadcast.emit('webrtc-offer', {
            offer: data.offer,
            mode: data.mode
        });
    });

    // 3. SEÑALIZACIÓN WEBRTC: RESPUESTA DE CONEXIÓN MULTIMEDIA
    socket.on('webrtc-answer', (answer) => {
        console.log(`[SYS]: Respuesta WebRTC recibida de ${socket.id}. Enlazando canales...`);
        // Envía la respuesta de vuelta para consolidar la llamada peer-to-peer sin eco
        socket.broadcast.emit('webrtc-answer', answer);
    });

    // 4. INTERCAMBIO DE CANDIDATOS ICE (CONECTIVIDAD ULTRA HD DE RED)
    socket.on('webrtc-candidate', (candidate) => {
        // Intercambia las rutas de red mapeadas por el servidor STUN para saltar firewalls
        socket.broadcast.emit('webrtc-candidate', candidate);
    });

    // 5. FINALIZACIÓN Y FINAL DE ENLACE MULTIMEDIA (HANGUP)
    socket.on('webrtc-hangup', () => {
        console.log(`[SYS]: Enlace multimedia cerrado por orden de ${socket.id}`);
        // Ordena de manera remota limpiar el hardware de cámara y audio del otro agente
        socket.broadcast.emit('webrtc-hangup');
    });

    // 6. GESTIÓN DE DESCONEXIÓN INVOLUNTARIA
    socket.on('disconnect', () => {
        console.log(`[SYS]: Canal caído. Agente desconectado -> ID: ${socket.id}`);
        // Notificación de seguridad para cerrar cualquier llamada activa si se pierde la red
        socket.broadcast.emit('webrtc-hangup');
    });
});

// Puerto táctico de escucha para levantar el canal
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`[VOBIXCHAT] SERVIDOR TÁCTICO DE ALTA FIDELIDAD ACTIVO`);
    console.log(`[URL EN LÍNEA]: http://localhost:${PORT}`);
    console.log(`==================================================`);
});
