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

    socket.on('webrtc-offer', (data) => {
        socket.broadcast.emit('webrtc-offer', data);
    });

    socket.on('webrtc-answer', (data) => {
        socket.broadcast.emit('webrtc-answer', data);
    });

    socket.on('webrtc-candidate', (data) => {
        socket.broadcast.emit('webrtc-candidate', data);
    });

    socket.on('webrtc-hangup', () => {
        socket.broadcast.emit('webrtc-hangup');
    });

    socket.on('disconnect', () => {
        console.log(`Dispositivo retirado: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor activo en el puerto: ${PORT}`);
});
