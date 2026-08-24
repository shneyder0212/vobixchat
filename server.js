require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Server } = require("socket.io");

const app = express();
const servidorHTTP = http.createServer(app);

app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    next();
});

const io = new Server(servidorHTTP, { 
    cors: { origin: "*" },
    pingTimeout: 120000,
    pingInterval: 25000
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
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
    limits: { fileSize: 10 * 1024 * 1024 } 
});

const usuariosRegistradosDB = new Map();

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
        return res.status(400).json({ success: false, error: "DENEGADO: Números VoIP no permitidos." });
    }

    return res.status(200).json({ success: true, registradoPrevio: usuariosRegistradosDB.has(telefonoLimpio) });
});

app.post('/api/seguridad/verificar-pin', (req, res) => {
    const { telefono, pin, nombre } = req.body;
    if (!telefono || !pin) return res.status(400).json({ success: false, error: "Datos incompletos" });

    const telefonoLimpio = String(telefono).trim().replace(/[^0-9]/g, '');
    if (pin !== "1234") {
        return res.status(400).json({ success: false, error: "PIN incorrecto. Use '1234'." });
    }

    if (!usuariosRegistradosDB.has(telefonoLimpio)) {
        usuariosRegistradosDB.set(telefonoLimpio, { nombre: nombre || "Usuario", telefono: telefonoLimpio });
    }

    return res.status(200).json({ success: true, usuario: usuariosRegistradosDB.get(telefonoLimpio) });
});

const mapaCanalesUsuarios = new Map();

io.on("connection", (socket) => {
    socket.on("registrar-canal-llamada", (data) => {
        if (!data || !data.identificador_usuario) return;
        const idUsuario = String(data.identificador_usuario).trim();
        mapaCanalesUsuarios.set(idUsuario, socket.id);
        socket.idUsuarioVobix = idUsuario;
        console.log(`[SOCKET] Canal registrado exitosamente: ${idUsuario}`);
    });

    socket.on("enviar-mensaje-chat", (datos) => {
        const { destinatario, texto, aliasEmisor } = datos;
        const socketDestinoId = mapaCanalesUsuarios.get(String(destinatario).trim());
        if (socketDestinoId) {
            io.to(socketDestinoId).emit("recibir-mensaje-chat", { texto, aliasEmisor });
        }
    });

    socket.on("unirse-a-sala", (data) => {
        const { salaId, usuarioId } = data;
        socket.join(salaId);
        socket.salaActual = salaId;
        socket.to(salaId).emit("nuevo-usuario-sala", { emisor: usuarioId });
    });

    socket.on("senalizacion-grupal", (datos) => {
        const { destinatario, emisor, tipo, payload, salaId } = datos;
        if (salaId) {
            socket.to(salaId).emit("recibir-senalizacion-grupal", { emisor, tipo, payload });
        } else if (destinatario) {
            const socketDestinoId = mapaCanalesUsuarios.get(String(destinatario).trim());
            if (socketDestinoId) {
                io.to(socketDestinoId).emit("recibir-senalizacion-grupal", { emisor, tipo, payload, destinatario });
            }
        }
    });

    socket.on("finalizar-llamada", (datos) => {
        const { destinatario, salaId } = datos;
        if (salaId) {
            socket.to(salaId).emit("usuario-salio-sala", { emisor: socket.idUsuarioVobix });
            socket.leave(salaId);
        } else if (destinatario) {
            const socketDestinoId = mapaCanalesUsuarios.get(String(destinatario).trim());
            if (socketDestinoId) {
                io.to(socketDestinoId).emit("llamada-finalizada", { emisor: socket.idUsuarioVobix });
            }
        }
    });

    socket.on("disconnect", () => {
        if (socket.idUsuarioVobix) {
            mapaCanalesUsuarios.delete(socket.idUsuarioVobix);
            if (socket.salaActual) {
                socket.to(socket.salaActual).emit("usuario-salio-sala", { emisor: socket.idUsuarioVobix });
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
servidorHTTP.listen(PORT, () => {
    console.log("[SERVER] VobixChat operativo en puerto " + PORT);
});
