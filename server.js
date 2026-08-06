const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

// Esto le dice al servidor que muestre tu index.html en la página principal
app.use(express.static(__dirname));

io.on('connection', (socket) => {
    // Contador de dispositivos en vivo
    io.emit('device_count', io.engine.clientsCount);

    socket.on('chat_message', (msg) => {
        io.emit('chat_message', msg);
    });

    socket.on('disconnect', () => {
        io.emit('device_count', io.engine.clientsCount);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor activo en puerto ${PORT}`);
});