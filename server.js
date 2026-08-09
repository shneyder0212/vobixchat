const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
    console.log(`Usuario conectado ID: ${socket.id}`);

    // Ahora enviamos también si la llamada es de voz o video
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
        console.log(`Usuario desconectado ID: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor cuántico corriendo en el puerto ${PORT}`);
});
