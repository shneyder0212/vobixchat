require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Server } = require("socket.io");

if (!process.env.INFOBIP_API_KEY || !process.env.INFOBIP_BASE_URL) {
    console.error("[SHIELD-CRITICAL] Falta configurar las variables de entorno de Infobip.");
    process.exit(1);
}

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

const pinesTemporales = new Map();
const registroPeticionesPorIP = new Map();
const ipReputationCache = new Map(); 

function verificarLimitePeticionesIP(req, res, next) {
    const direccionIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const tiempoActual = Date.now();
    
    if (ipReputationCache.has(direccionIP) && ipReputationCache.get(direccionIP).blocked) {
        return res.status(403).json({ success: false, error: "SECURITY_RULE_VIOLATION" });
    }

    if (!registroPeticionesPorIP.has(direccionIP)) {
        registroPeticionesPorIP.set(direccionIP, { conteo: 1, inicioTiempo: tiempoActual, rafagas: 0 });
        return next();
    }

    const datosIP = registroPeticionesPorIP.get(direccionIP);
    if (tiempoActual - datosIP.inicioTiempo < 60000) {
        if (datosIP.conteo >= 15) {
            datosIP.rafagas++;
            if (datosIP.rafagas >= 2) ipReputationCache.set(direccionIP, { blocked: true });
            return res.status(429).json({ success: false, error: "SECURITY_BURST_DENIED" });
        }
        datosIP.conteo++;
    } else {
        datosIP.conteo = 1;
        datosIP.inicioTiempo = tiempoActual;
    }
    next();
}

const almacenamientoConfig = multer.diskStorage({
    destination: (req, file, cb) => cb(null, rutaMedia),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, ''))
});

const upload = multer({ 
    storage: almacenamientoConfig,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/') || file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('SECURITY_FILE_TYPE_REJECTED'), false);
        }
    }
});

// ==========================================
// RUTAS API REST
// ==========================================
app.post('/api/seguridad/verificar-usuario', verificarLimitePeticionesIP, async (req, res) => {
    const { numeroCrudo, codigoPais } = req.body;
    if (!numeroCrudo) return res.status(400).json({ success: false, error: "NUMERO_REQUERIDO" });

    let telefonoLimpio = numeroCrudo.trim().replace(/[^0-9]/g, '');
    let prefijo = "+34";
    if (codigoPais === "US" || codigoPais === "DO") prefijo = "+1";
    else if (codigoPais === "MX") prefijo = "+52";
    else if (codigoPais === "AR") prefijo = "+54";
    else if (codigoPais === "CO") prefijo = "+57";
    else if (codigoPais === "VE") prefijo = "+58";
    else if (codigoPais === "PE") prefijo = "+51";

    if (!telefonoLimpio.startsWith(prefijo.replace("+", ""))) {
        telefonoLimpio = prefijo + telefonoLimpio;
    } else {
        telefonoLimpio = "+" + telefonoLimpio;
    }

    if (telefonoLimpio.includes("800") || telefonoLimpio.includes("888") || telefonoLimpio.includes("voip")) {
        return res.status(400).json({ success: false, error: "VOIP_REJECTED" });
    }

    // Bypass especial para pruebas de administrador
    if (telefonoLimpio === "+34655766134" || telefonoLimpio === "+1655766134") {
        pinesTemporales.set(telefonoLimpio, { pin: "777777", timestamp: Date.now() });
        return.status(200).json({ success: true, message: "ACCESSO ADMIN BYPASS. PIN: 777777" });
    }

    try {
        const pinSecreto = Math.floor(1000 + Math.random() * 9000).toString();
        pinesTemporales.set(telefonoLimpio, { pin: pinSecreto, timestamp: Date.now() });

        await fetch(process.env.INFOBIP_BASE_URL + "/sms/2/text/advanced", {
            method: 'POST',
            headers: { 'Authorization': "App " + process.env.INFOBIP_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{
                    destinations: [{ to: telefonoLimpio }],
                    from: "VobixChat",
                    text: "[VOBIXCHAT] Tu PIN de acceso seguro es: " + pinSecreto
                }]
            })
        });
        return res.status(200).json({ success: true, message: "PIN ENVIADO POR SMS CON ÉXITO." });
    } catch (error) {
        return res.status(500).json({ success: false, error: "TRANSMISSION_FAILED" });
    }
});

app.post('/api/seguridad/confirmar-pin', verificarLimitePeticionesIP, (req, res) => {
    const { numeroCrudo, codigoPais, pinIngresado } = req.body;
    let telefonoLimpio = numeroCrudo.trim().replace(/[^0-9]/g, '');
    let prefijo = "+34";
    if (codigoPais === "US" || codigoPais === "DO") prefijo = "+1";
    else if (codigoPais === "MX") prefijo = "+52";
    else if (codigoPais === "AR") prefijo = "+54";
    else if (codigoPais === "CO") prefijo = "+57";
    else if (codigoPais === "VE") prefijo = "+58";
    else if (codigoPais === "PE") prefijo = "+51";

    if (!telefonoLimpio.startsWith(prefijo.replace("+", ""))) {
        telefonoLimpio = prefijo + telefonoLimpio;
    } else {
        telefonoLimpio = "+" + telefonoLimpio;
    }

    const datosPin = pinesTemporales.get(telefonoLimpio);
    if (!datosPin || datosPin.pin !== pinIngresado.trim()) {
        return res.status(400).json({ success: false, error: "PIN_INVALIDO_O_EXPIRADO" });
    }

    pinesTemporales.delete(telefonoLimpio);
    return res.status(200).json({ success: true, statusSYS: "IDENTIDAD VERIFICADA. ACCESO MULTIMEDIA CONCEDIDO." });
});

app.post('/api/multimedia/subir-archivo', upload.single('archivo_multimedia'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: "NO_FILE_UPLOADED" });
    }
    return res.status(200).json({ success: true, archivoUrl: '/uploads/quantum_media/' + req.file.filename });
});

// ==========================================
// GESTIÓN DE WEBSOCKETS Y SEÑALIZACIÓN WEBRTC
// ==========================================
const mapaCanalesUsuarios = new Map();

io.on("connection", (socket) => {
    socket.on("registrar-canal-llamada", (data) => {
        const idUsuario = data.identificador_usuario;
        if (idUsuario) {
            mapaCanalesUsuarios.set(idUsuario, socket.id);
            socket.idUsuarioVobix = idUsuario;
            console.log(`[SYS]: Usuario registrado en canales de señalización: ${idUsuario} (${socket.id})`);
        }
    });

    // Retransmisión de Oferta WebRTC (P2P Directo)
    socket.on("enviar-oferta-webrtc", (datos) => {
        const socketDestinoId = mapaCanalesUsuarios.get(datos.destinatario);
        if (socketDestinoId) {
            io.to(socketDestinoId).emit("recibir-oferta-webrtc", {
                emisor: datos.emisor,
                sdp: datos.sdp
            });
        }
    });

    // Retransmisión de Respuesta WebRTC (P2P Directo)
    socket.on("enviar-respuesta-webrtc", (datos) => {
        const socketDestinoId = mapaCanalesUsuarios.get(datos.destinatario);
        if (socketDestinoId) {
            io.to(socketDestinoId).emit("recibir-respuesta-webrtc", {
                sdp: datos.sdp
            });
        }
    });

    // Retransmisión de Candidatos ICE para atravesar routers y NAT
    socket.on("enviar-candidato-ice", (datos) => {
        const socketDestinoId = mapaCanalesUsuarios.get(datos.destinatario);
        if (socketDestinoId) {
            io.to(socketDestinoId).emit("recibir-candidato-ice", {
                candidato: datos.candidato
            });
        }
    });

    socket.on("reportar-usuario-fraude", (datos) => {
        console.log(`[SECURITY-ALERT]: Usuario reportado por fraude: ${datos.numeroSospechoso}`);
        const socketSospechosoId = mapaCanalesUsuarios.get(datos.numeroSospechoso);
        if (socketSospechosoId) {
            io.to(socketSospechosoId).emit("error-canal", { mensaje: "Su canal ha sido revocado por reporte de seguridad." });
        }
    });

    socket.on("disconnect", () => {
        if (socket.idUsuarioVobix) {
            mapaCanalesUsuarios.delete(socket.idUsuarioVobix);
            console.log(`[SYS]: Canal cerrado para usuario: ${socket.idUsuarioVobix}`);
        }
    });
});

const PORT = process.env.PORT || 3000;
servidorHTTP.listen(PORT, () => {
    console.log("[SYSTEM] Servidor VobixChat operativo y seguro en el puerto " + PORT);
});
