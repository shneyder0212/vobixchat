require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Server } = require("socket.io");

const app = express();
const servidorHTTP = http.createServer(app);
const io = new Server(servidorHTTP, { 
    cors: { origin: "*" },
    pingTimeout: 60000,
    pingInterval: 25000
});

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
    filename: (req, file, cb) => {
        const extensionUnica = path.extname(file.originalname).toLowerCase();
        const nombreLimpio = path.basename(file.originalname, extensionUnica).replace(/[^a-zA-Z0-9]/g, '_');
        cb(null, `${Date.now()}-${nombreLimpio}${extensionUnica}`);
    }
});

const upload = multer({ 
    storage: almacenamientoConfig,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        // Ejemplo opcional: permitir solo imágenes y audios/videos comunes
        cb(null, true);
    }
});

// FILTRO ESTRICTO ANTI-VOIP Y ACCESO POR NÚMERO
app.post('/api/seguridad/verificar-usuario', (req, res) => {
    const { numeroCrudo } = req.body;
    if (!numeroCrudo) return res.status(400).json({ success: false, error: "NÚMERO REQUERIDO" });

    const telefonoLimpio = String(numeroCrudo).trim().replace(/[^0-9]/g, '');

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
        if (!data || !data.identificador_usuario) return;
        
        const idUsuario = data.identificador_usuario;
        mapaCanalesUsuarios.set(idUsuario, socket.id);
        socket.idUsuarioVobix = idUsuario;
        
        console.log(`[SOCKET] Usuario registrado: ${idUsuario} (${socket.id})`);
    });

    socket.on("enviar-oferta-webrtc", (datos) => {
        const socketDestinoId = mapaCanalesUsuarios.get(datos.destinatario);
        if (socketDestinoId) {
            io.to(socketDestinoId).emit("recibir-oferta-webrtc", { 
                emisor: datos.emisor, 
                sdp: datos.sdp 
            });
        } else {
            socket.emit("error-llamada", { error: "El usuario destinatario no está conectado." });
        }
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

    socket.on("disconnect", () => {
        if (socket.idUsuarioVobix) {
            // Solo borrar si sigue siendo el socket asociado a ese usuario (evita sobreescrituras por reconexiones)
            if (mapaCanalesUsuarios.get(socket.idUsuarioVobix) === socket.id) {
                mapaCanalesUsuarios.delete(socket.idUsuarioVobix);
                console.log(`[SOCKET] Usuario desconectado del mapa: ${socket.idUsuarioVobix}`);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
servidorHTTP.listen(PORT, () => {
    console.log("[SERVER] VobixChat operativo en puerto " + PORT);
});
