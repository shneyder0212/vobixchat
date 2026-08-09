const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// CONFIGURACIÓN DE SEGURIDAD ABSOLUTA PARA RENDER (CORS REFORZADO)
// Permite que cualquier smartphone (iOS/Android) o PC se conecte sin bloqueos de firewall
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'] // Estabilidad máxima ante pérdidas de señal móvil
});

// Enrutador cuántico: Sirve el archivo visual de forma automática
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// CANAL CENTRAL DE SEÑALIZACIÓN MULTIMEDIA (VOBIXCHAT CORE)
io.on('connection', (socket) => {
    console.log(`[SISTEMA]: Dispositivo enlazado con ID cuántico: ${socket.id}`);

    // 1. Gestionar ofertas de llamadas (Voz o Video) y su configuración
    socket.on('webrtc-offer', (data) => {
        // Retransmite los datos multimedia y el modo ('voice' o 'video') al destinatario
        socket.broadcast.emit('webrtc-offer', data);
    });

    // 2. Gestionar respuestas de aceptación de llamada
    socket.on('webrtc-answer', (data) => {
        socket.broadcast.emit('webrtc-answer', data);
    });

    // 3. Intercambio de coordenadas de red (ICE Candidates)
    // Crucial para que los teclados y conexiones no se congelen al cambiar de Wi-Fi a Datos Móviles
    socket.on('webrtc-candidate', (data) => {
        socket.broadcast.emit('webrtc-candidate', data);
    });

    // 4. Notificar finalización o rechazo de llamada de forma atómica
    socket.on('webrtc-hangup', () => {
        socket.broadcast.emit('webrtc-hangup');
    });

    // Gestión de desconexiones para liberar memoria en el servidor de Render
    socket.on('disconnect', () => {
        console.log(`[SISTEMA]: Dispositivo retirado de la red: ${socket.id}`);
    });
});

// CAPTURA DE PUERTO DINÁMICA MANDATORIA PARA RENDER
// Render inyecta la variable de entorno process.env.PORT de forma automática
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`  VOBIXCHAT // SERVER ACTIVO EN EL PUERTO: ${PORT}  `);
    console.log(`====================================================`);
});
