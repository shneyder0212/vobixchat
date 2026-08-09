const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Configuración absoluta de CORS para producción en Render
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Enrutar automáticamente la raíz al archivo visual index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Canal de control para la señalización de llamadas móviles
io.on('connection', (socket) => {
    console.log(`Dispositivo enlazado ID: ${socket.id}`);

    socket.on('webrtc-offer', (data) => {
        socket.broadcast.emit('webrtc-offer', data);
    });

    socket.on('webrtc-answer', (data) => {
        socket.broadcast.emit('webrtc-answer', data);
    });

    socket.on('webrtc-candidate', (data) => {
        socket.broadcast.emit('webrtc-candidate', data);
    });

    socket.on('disconnect', () => {
        console.log(`Dispositivo desconectado: ${socket.id}`);
    });
});

// Render inyecta el puerto de escucha dinámicamente mediante variables de entorno
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor de VOBIXCHAT corriendo en puerto ${PORT}`);
});
