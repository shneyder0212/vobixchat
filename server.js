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

// MAPA CRIPTOGRÁFICO DE AGENTES ACTIVOS (AL ESTILO WHATSAPP)
// Guarda la relación entre identidades y su ID de socket en tiempo real
const activeAgents = {
    byName: {},  // Ejemplo: { '@shneyder': 'socket_id_123' }
    byPhone: {}  // Ejemplo: { '+5255123456': 'socket_id_123' }
};

// Escucha la raíz y busca el archivo de forma directa en la carpeta principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'), (err) => {
        if (err) {
            res.sendFile(path.join(__dirname, 'vobixchat.html'), (err2) => {
                if (err2) {
                    res.status(404).send("<h1>[SYS ERROR]: No se encontró el archivo HTML de VobixChat. Renómbralo a index.html o vobixchat.html</h1>");
                }
            });
        }
    });
});

io.on('connection', (socket) => {
    console.log(`[SYS]: Canal cuántico abierto -> ID Temporal: ${socket.id}`);
    let registeredName = null;
    let registeredPhone = null;

    // 1. REGISTRO DE IDENTIDAD PRIVADA (AL ESTILO WHATSAPP)
    socket.on('register-agent', (data) => {
        registeredName = data.name.toLowerCase();
        registeredPhone = data.phone.trim();

        // Guardar en el directorio activo del servidor
        activeAgents.byName[registeredName] = socket.id;
        activeAgents.byPhone[registeredPhone] = socket.id;

        console.log(`[SYS]: Agente Registrado -> Alias: ${registeredName} | Línea: ${registeredPhone} | Socket: ${socket.id}`);
    });

    // 2. BÚSQUEDA Y ENRUTAMIENTO DE INVITACIÓN DIRECTA PRIVADA
    socket.on('send-private-invite', (data) => {
        const mode = data.mode; // 'name' o 'phone'
        const target = data.target.toLowerCase().trim();
        let targetSocketId = null;

        // Buscar el ID de socket del destinatario sin exponerlo en salas públicas
        if (mode === 'name') {
            targetSocketId = activeAgents.byName[target];
        } else if (mode === 'phone') {
            targetSocketId = activeAgents.byPhone[target];
        }

        if (targetSocketId) {
            console.log(`[SYS]: Enlace privado encontrado. Conectando a ${socket.id} con ${target}`);
            // Envía la señal multimedia UNICAMENTE al agente encontrado
            io.to(targetSocketId).emit('private-invite-received', {
                from: registeredName || 'Agente Anónimo'
            });
        } else {
            console.log(`[SYS]: Intento de enlace fallido. Destinatario no encontrado: ${target}`);
            // Informa de vuelta al emisor que el usuario está desconectado o no existe
            socket.emit('invite-error', {
                message: `El agente "${target}" no se encuentra activo en la red cuántica.`
            });
        }
    });

    // 3. RETRANSMISIÓN DE MENSAJES DE TEXTO EN TIEMPO REAL
    socket.on('chat-message', (data) => {
        // Envía el texto cifrado a todos los agentes de la red
        socket.broadcast.emit('chat-message', data);
    });

    // 4. SEÑALIZACIÓN WEBRTC (OFERTAS MULTIMEDIA)
    socket.on('webrtc-offer', (data) => {
        socket.broadcast.emit('webrtc-offer', data);
    });

    // 5. SEÑALIZACIÓN WEBRTC (RESPUESTAS MULTIMEDIA)
    socket.on('webrtc-answer', (answer) => {
        socket.broadcast.emit('webrtc-answer', answer);
    });

    // 6. INTERCAMBIO DE CANDIDATOS ICE (CONECTIVIDAD MÓVIL)
    socket.on('webrtc-candidate', (candidate) => {
        socket.broadcast.emit('webrtc-candidate', candidate);
    });

    // 7. CIERRE DE ENLACE (HANGUP)
    socket.on('webrtc-hangup', () => {
        socket.broadcast.emit('webrtc-hangup');
    });

    // 8. LIMPIEZA DE DIRECTORIO POR DESCONEXIÓN
    socket.on('disconnect', () => {
        console.log(`[SYS]: Canal caído -> ID: ${socket.id}`);
        
        // Remover de los mapas activos para evitar llamadas a fantasmas
        if (registeredName && activeAgents.byName[registeredName] === socket.id) {
            delete activeAgents.byName[registeredName];
        }
        if (registeredPhone && activeAgents.byPhone[registeredPhone] === socket.id) {
            delete activeAgents.byPhone[registeredPhone];
        }

        socket.broadcast.emit('webrtc-hangup');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`[VOBIXCHAT] BACKEND PRIVADO ESTILO WHATSAPP ACTIVO`);
    console.log(`[URL EN LÍNEA]: http://localhost:${PORT}`);
    console.log(`==================================================`);
});
