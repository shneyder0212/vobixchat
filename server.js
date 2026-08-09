const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling']
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
    console.log(`Dispositivo enlazado ID: ${socket.id}`);

    // LOGICA CENTRAL: Enlazar agentes en búnkeres cerrados tipo WhatsApp
    socket.on('join-private-room', (data) => {
        socket.join(data.room);
        console.log(`Agente ${socket.id} ha ingresado de forma privada al búnker: ${data.room}`);
    });

    // Envío de mensajes de texto en canal aislado
    socket.on('private-chat-message', (data) => {
        socket.to(data.room).emit('private-chat-message', data);
    });

    // Retransmisión multimedia WebRTC HD asíncrona y segura
    socket.on('webrtc-offer', (data) => {
        socket.to(data.room).emit('webrtc-offer', data);
    });

    socket.on('webrtc-answer', (data) => {
        socket.to(data.room).emit('webrtc-answer', data);
    });

    socket.on('webrtc-candidate', (data) => {
        socket.to(data.room).emit('webrtc-candidate', data);
    });

    socket.on('webrtc-hangup', (data) => {
        socket.to(data.room).emit('webrtc-hangup');
    });

    socket.on('disconnect', () => {
        console.log(`Dispositivo retirado de la red: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor de búnkeres privados activo en puerto: ${PORT}`);
});
