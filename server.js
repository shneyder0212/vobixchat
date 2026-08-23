// En tu server.js dentro de io.on("connection", (socket) => { ... })
socket.on("enviar-oferta-webrtc", (datos) => {
    // Buscar el socket del destinatario y enviarle la oferta
    socket.broadcast.emit("recibir-oferta-webrtc", datos);
});

socket.on("enviar-respuesta-webrtc", (datos) => {
    socket.broadcast.emit("recibir-respuesta-webrtc", datos);
});

socket.on("enviar-candidato-ice", (datos) => {
    socket.broadcast.emit("recibir-candidato-ice", datos);
});
