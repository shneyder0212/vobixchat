// Mapa para llevar el control del estado de los usuarios: 'disponible', 'llamando', 'en-llamada'
const estadosUsuarios = new Map();

io.on("connection", (socket) => {
    socket.on("registrar-canal-llamada", (data) => {
        if (!data || !data.identificador_usuario) return;
        
        const idUsuario = data.identificador_usuario;
        mapaCanalesUsuarios.set(idUsuario, socket.id);
        socket.idUsuarioVobix = idUsuario;
        
        // Inicializar estado como disponible si no lo tiene
        if (!estadosUsuarios.has(idUsuario)) {
            estadosUsuarios.set(idUsuario, 'disponible');
        }
        
        console.log(`[SOCKET] Usuario registrado: ${idUsuario} (${socket.id})`);
    });

    socket.on("enviar-oferta-webrtc", (datos) => {
        const { emisor, destinatario, sdp } = datos;
        const socketDestinoId = mapaCanalesUsuarios.get(destinatario);
        const estadoDestino = estadosUsuarios.get(destinatario);

        if (!socketDestinoId) {
            return socket.emit("error-llamada", { error: "El usuario destinatario no está conectado." });
        }

        // Verificar si el destinatario está ocupado
        if (estadoDestino && estadoDestino !== 'disponible') {
            return socket.emit("error-llamada", { error: "El usuario se encuentra ocupado en otra llamada." });
        }

        // Actualizar estados
        estadosUsuarios.set(emisor, 'en-llamada');
        estadosUsuarios.set(destinatario, 'en-llamada');

        io.to(socketDestinoId).emit("recibir-oferta-webrtc", { emisor, sdp });
    });

    socket.on("enviar-respuesta-webrtc", (datos) => {
        const socketDestinoId = mapaCanalesUsuarios.get(datos.destinatario);
        if (socketDestinoId) {
            io.to(socketDestinoId).emit("recibir-respuesta-webrtc", { 
                emisor: datos.emisor,
                sdp: datos.sdp 
            });
        }
    });

    socket.on("enviar-candidato-ice", (datos) => {
        const socketDestinoId = mapaCanalesUsuarios.get(datos.destinatario);
        if (socketDestinoId) {
            io.to(socketDestinoId).emit("recibir-candidato-ice", { 
                emisor: datos.emisor,
                candidato: datos.candidato 
            });
        }
    });

    // Nuevo evento para colgar, rechazar o cancelar llamada
    socket.on("finalizar-llamada", (datos) => {
        const { destinatario } = datos;
        
        // Liberar estados de ambos
        if (socket.idUsuarioVobix) estadosUsuarios.set(socket.idUsuarioVobix, 'disponible');
        if (destinatario) {
            estadosUsuarios.set(destinatario, 'disponible');
            const socketDestinoId = mapaCanalesUsuarios.get(destinatario);
            if (socketDestinoId) {
                io.to(socketDestinoId).emit("llamada-finalizada", { emisor: socket.idUsuarioVobix });
            }
        }
    });

    socket.on("disconnect", () => {
        if (socket.idUsuarioVobix) {
            if (mapaCanalesUsuarios.get(socket.idUsuarioVobix) === socket.id) {
                mapaCanalesUsuarios.delete(socket.idUsuarioVobix);
                estadosUsuarios.delete(socket.idUsuarioVobix);
                console.log(`[SOCKET] Usuario desconectado: ${socket.idUsuarioVobix}`);
            }
        }
    });
});
