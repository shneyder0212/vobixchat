require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Server } = require("socket.io");

const app = express();
const servidorHTTP = http.createServer(app);
const io = new Server(servidorHTTP, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const rutaMedia = path.join(__dirname, 'uploads', 'quantum_media');
if (!fs.existsSync(rutaMedia)){
    fs.mkdirSync(rutaMedia, { recursive: true });
}
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const almacenamientoConfig = multer.diskStorage({
    destination: (req, file, cb) => cb(null, rutaMedia),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, ''))
});

const upload = multer({ 
    storage: almacenamientoConfig,
    limits: { fileSize: 10 * 1024 * 1024 }
});

// FILTRO ESTRICTO ANTI-VOIP Y ACCESO POR NÚMERO
app.post('/api/seguridad/verificar-usuario', (req, res) => {
    const { numeroCrudo } = req.body;
    if (!numeroCrudo) return res.status(400).json({ success: false, error: "NÚMERO REQUERIDO" });

    const telefonoLimpio = numeroCrudo.trim().replace(/[^0-9]/g, '');

    const esVoipSospechoso = (
        telefonoLimpio.startsWith("800") || 
        telefonoLimpio.startsWith("888") || 
        telefonoLimpio.startsWith("900") ||
        telefonoLimpio.length < 8 || 
        telefonoLimpio.length > 15
    );

    if (esVoipSospechoso) {
        return res.status(400).json({ 
            success: false, 
            error: "CERO NÚMERO VoIP PERMITIDO. Introduzca un número de teléfono móvil real." 
        });
    }

    return res.status(200).json({ success: true, message: "ACCESO CONCEDIDO" });
});

app.post('/api/multimedia/subir-archivo', upload.single('archivo_multimedia'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: "NO_FILE" });
    }
    return res.status(200).json({ success: true, archivoUrl: '/uploads/quantum_media/' + req.file.filename });
});

const mapaCanalesUsuarios = new Map();

io.on("connection", (socket) => {
    socket.on("registrar-canal-llamada", (data) => {
        const idUsuario = data.identificador_usuario;
        if (idUsuario) {
            mapaCanalesUsuarios.set(idUsuario, socket.id);
            socket.idUsuarioVobix = idUsuario;
        }
    });

    socket.on("enviar-oferta-webrtc", (datos) => {
        const socketDestinoId = mapaCanalesUsuarios.get(datos.destinatario);
        if (socketDestinoId) {
            io.to(socketDestinoId).emit("recibir-oferta-webrtc", { emisor: datos.emisor, sdp: datos.sdp });
        }
    });

    socket.on("enviar-respuesta-webrtc", (datos) => {
        const socketDestinoId = mapaCanalesUsuarios.get(datos.destinatario);
        if (socketDestinoId) {
            io.to(socketDestinoId).emit("recibir-respuesta-webrtc", { sdp: datos.sdp });
        }
    });

    socket.on("enviar-candidato-ice", (datos) => {
        const socketDestinoId = mapaCanalesUsuarios.get(datos.destinatario);
        if (socketDestinoId) {
            io.to(socketDestinoId).emit("recibir-candidato-ice", { candidato: datos.candidato });
        }
    });

    socket.on("disconnect", () => {
        if (socket.idUsuarioVobix) {
            mapaCanalesUsuarios.delete(socket.idUsuarioVobix);
        }
    });
});

const PORT = process.env.PORT || 3000;
servidorHTTP.listen(PORT, () => {
    console.log("[SERVER] VobixChat operativo en puerto " + PORT);
});
