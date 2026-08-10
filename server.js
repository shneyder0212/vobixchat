const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e8, // Aumenta el límite a 100MB para permitir el envío de películas, música y Office pesados
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// MAPA CRIPTOGRÁFICO DE AGENTES ACTIVOS (AL ESTILO WHATSAPP)
const activeAgents = {
    byName: {},  // Guarda la relación { '@shneyder': 'socket_id_abc' }
    byPhone: {}  // Guarda la relación { '+5255123456': 'socket_id_abc' }
};

// Servir de forma automática el archivo index.html en la raíz del navegador
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'), (err) => {
        if (err) {
            res.sendFile(path.join(__dirname, 'vobixchat.html'), (err2) => {
                if (err2) {
                    res.status(404).send("<h1>[SYS ERROR]: No se encontró el archivo HTML de VobixChat. Renómbralo a index.html</h1>");
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

        activeAgents.byName[registeredName] = socket.id;
        activeAgents.byPhone[registeredPhone] = socket.id;

        console.log(`[SYS]: Agente Registrado -> Alias: ${registeredName} | Línea: ${registeredPhone} | Socket: ${socket.id}`);
    });

    // 2. BÚSQUEDA Y ENRUTAMIENTO DE INVITACIÓN DIRECTA PRIVADA
    socket.on('send-private-invite', (data) => {
        const mode = data.mode; 
        const target = data.target.toLowerCase().trim();
        let targetSocketId = null;

        if (mode === 'name') {
            targetSocketId = activeAgents.byName[target];
        } else if (mode === 'phone') {
            targetSocketId = activeAgents.byPhone[target];
        }

        if (targetSocketId) {
            console.log(`[SYS]: Enlace privado encontrado. Conectando a ${socket.id} con ${target}`);
            io.to(targetSocketId).emit('private-invite-received', {
                from: registeredName || 'Agente Anónimo'
            });
        } else {
            console.log(`[SYS]: Intento de enlace fallido. Destinatario no encontrado: ${target}`);
            socket.emit('invite-error', {
                message: `El agente "${target}" no se encuentra activo en la red cuántica.`
            });
        }
    });

    // 3. RETRANSMISIÓN MULTIMEDIA EN TIEMPO REAL (TEXTO, NOTAS DE VOZ, AUDIOS, ARCHIVOS)
    socket.on('chat-message', (data) => {
        // Retransmite de forma íntegra los buffers de texto o datos binarios a los demás nodos conectados
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

    // 6. INTERCAMBIO DE CANDIDATOS ICE (CONECTIVIDAD MÓVIL Y PC)
    socket.on('webrtc-candidate', (candidate) => {
        socket.broadcast.emit('webrtc-candidate', candidate);
    });

    // 7. CIERRE DE ENLACE MULTIMEDIA (HANGUP)
    socket.on('webrtc-hangup', () => {
        socket.broadcast.emit('webrtc-hangup');
    });

    // 8. LIMPIEZA DE DIRECTORIO POR DESCONEXIÓN DE RED
    socket.on('disconnect', () => {
        console.log(`[SYS]: Canal caído -> ID: ${socket.id}`);
        
        if (registeredName && activeAgents.byName[registeredName] === socket.id) {
            delete activeAgents.byName[registeredName];
        }
        if (registeredPhone && activeAgents.byPhone[registeredPhone] === socket.id) {
            delete activeAgents.byPhone[registeredPhone];
        }

        socket.broadcast.emit('webrtc-hangup');
    });
});

// Inicialización del puerto de producción táctico
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`[VOBIXCHAT] BACKEND PRIVADO ESTILO WHATSAPP ACTIVO`);
    console.log(`[URL EN LÍNEA]: http://localhost:${PORT}`);
    console.log(`==================================================`);
});
