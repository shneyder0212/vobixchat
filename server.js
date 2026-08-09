const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Configuración de WebSockets con CORS abierto para producción
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Servir tu archivo index.html de forma automática
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Gestión de conexiones en tiempo real de VOBIXCHAT
io.on('connection', (socket) => {
    console.log(`Usuario conectado ID: ${socket.id}`);

    // Reenviar oferta de videollamada al destinatario
    socket.on('webrtc-offer', (data) => {
        socket.broadcast.emit('webrtc-offer', data);
    });

    // Reenviar respuesta de aceptación de videollamada
    socket.on('webrtc-answer', (data) => {
        socket.broadcast.emit('webrtc-answer', data);
    });

    // Intercambiar configuraciones de red (ICE Candidates) entre móviles
    socket.on('webrtc-candidate', (data) => {
        socket.broadcast.emit('webrtc-candidate', data);
    });

    socket.on('disconnect', () => {
        console.log(`Usuario desconectado ID: ${socket.id}`);
    });
});

// El puerto lo asigna dinámicamente Render mediante variables de entorno
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor cuántico corriendo en el puerto ${PORT}`);
});
