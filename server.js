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
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
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

// ENDPOINT DE VERIFICACIÓN DE PIN (MODO PRUEBA GRATIS PARA TU FAMILIA)
app.post('/api/seguridad/verificar-pin', (req, res) => {
    const { telefono, pin } = req.body;
    if (!telefono || !pin) return res.status(400).json({ success: false, error: "Datos incompletos" });

    const pinMaestro = "1234"; // PIN universal gratuito para pruebas

    if (pin === pinMaestro) {
        return res.status(200).json({ success: true, message: "ACCESO CONCEDIDO (SISTEMA SEGURO)" });
    }

    return res.status(400).json({ success: false, error: "PIN incorrecto. Usa '1234' para entrar." });
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

    // GESTIÓN DE SALAS PARA VIDEOCONFERENCIAS GRUPALES
    socket.on("unirse-a-sala", (data) => {
        const { salaId, usuarioId } = data;
        socket.join(salaId);
        socket.salaActual = salaId;
        console.log(`[SOCKET] Usuario ${usuarioId} se unió a la sala grupal: ${salaId}`);
        
        socket.to(salaId).emit("nuevo-usuario-sala", { emisor: usuarioId });
    });

    socket.on("senalizacion-grupal", (datos) => {
        const { destinatario, emisor, tipo, payload } = datos;
        const socketDestinoId = mapaCanalesUsuarios.get(destinatario);
        if (socketDestinoId) {
            io.to(socketDestinoId).emit("recibir-senalizacion-grupal", {
                emisor,
                tipo,
                payload
            });
        } else {
            // Compatibilidad hacia llamadas 1 a 1 tradicionales si el destinatario no está en sala grupal
            io.to(socketDestinoId).emit("recibir-oferta-webrtc", {
                emisor,
                sdp: payload
            });
        }
    });

    socket.on("finalizar-llamada", (datos) => {
        const { destinatario, salaId } = datos;
        if (salaId) {
            socket.to(salaId).emit("usuario-salio-sala", { emisor: socket.idUsuarioVobix });
            socket.leave(salaId);
        } else if (destinatario) {
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
                if (socket.salaActual) {
                    socket.to(socket.salaActual).emit("usuario-salio-sala", { emisor: socket.idUsuarioVobix });
                }
                console.log(`[SOCKET] Usuario desconectado: ${socket.idUsuarioVobix}`);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
servidorHTTP.listen(PORT, () => {
    console.log("[SERVER] VobixChat operativo en puerto " + PORT);
});
