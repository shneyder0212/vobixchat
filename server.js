// =================================================================
// PARTE 1 DE 3: CONFIGURACIÓN DEL NÚCLEO, ARCHIVOS Y FIREWALL por IP
// =================================================================
require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const { Server } = require("socket.io");

// Verificación de seguridad de variables de entorno
if (!process.env.INFOBIP_API_KEY || !process.env.INFOBIP_BASE_URL) {
    console.error("[SHIELD-CRITICAL] Falta configurar las variables de entorno de Infobip.");
    process.exit(1);
}

const app = express();
const servidorHTTP = http.createServer(app);
const io = new Server(servidorHTTP, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Crear directorio seguro para almacenamiento de multimedia
const rutaMedia = path.join(__dirname, 'uploads', 'quantum_media');
if (!fs.existsSync(rutaMedia)){
    fs.mkdirSync(rutaMedia, { recursive: true });
}

// Memorias internas para control de seguridad perimetral
const registroPeticionesPorIP = new Map();
const ipReputationCache = new Map(); 
const lineasFisicasAutorizadas = new Set();
const registroComportamientoUsuarios = new Map();

// Clave criptográfica interna del sistema
const ENCRYPTION_KEY = crypto.scryptSync(process.env.INFOBIP_API_KEY, 'salt-segura', 32);

// Middleware del Cortafuegos Perimetral contra ataques e inundación de peticiones
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
        if (datosIP.conteo >= 5) {
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

// Configuración del disco para almacenamiento seguro
const almacenamientoConfig = multer.diskStorage({
    destination: (req, file, cb) => cb(null, rutaMedia),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, ''))
});

const upload = multer({ 
    storage: almacenamientoConfig,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/') || file.mimetype.startsWith('audio/')) {
            cb(null, true);
        } else {
            cb(new Error('SECURITY_FILE_TYPE_REJECTED'), false);
        }
    }
});
// =================================================================
// PARTE 2 DE 3: NUEVA INTERFAZ VISUAL DE REGISTRO (DISEÑO PREMIUM OSCURO)
// =================================================================
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>VOBIXCHAT // Registro Avanzado</title>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { 
                    font-family: 'Segoe UI', Roboto, sans-serif; 
                    background: #0b0e14; 
                    color: #ffffff; 
                    display: flex; 
                    justify-content: center; 
                    align-items: center; 
                    min-height: 100vh;
                }
                .register-container {
                    background: #121722;
                    border: 1px solid #1e2638;
                    width: 100%;
                    max-width: 420px;
                    padding: 40px 30px;
                    border-radius: 16px;
                    box-shadow: 0 15px 35px rgba(0,0,0,0.5);
                }
                .header-zone {
                    text-align: center;
                    margin-bottom: 35px;
                }
                .header-zone h1 {
                    font-size: 28px;
                    color: #00ffcc;
                    letter-spacing: 2px;
                    margin-bottom: 5px;
                }
                .header-zone p {
                    color: #637085;
                    font-size: 13px;
                }
                .form-group {
                    margin-bottom: 22px;
                }
                .form-group label {
                    display: block;
                    font-size: 12px;
                    color: #94a3b8;
                    margin-bottom: 8px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                .form-group input {
                    width: 100%;
                    padding: 14px;
                    background: #1a202c;
                    border: 1px solid #2d3748;
                    border-radius: 8px;
                    color: #fff;
                    font-size: 15px;
                    outline: none;
                    transition: border-color 0.2s;
                }
                .form-group input:focus {
                    border-color: #00ffcc;
                }
                .btn-action {
                    width: 100%;
                    padding: 15px;
                    background: #00ffcc;
                    color: #0b0e14;
                    border: none;
                    border-radius: 8px;
                    font-size: 15px;
                    font-weight: 700;
                    cursor: pointer;
                    transition: background 0.2s;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                .btn-action:hover {
                    background: #00e6b8;
                }
            </style>
        </head>
        <body>
            <div class="register-container">
                <div class="header-zone">
                    <h1>VOBIXCHAT</h1>
                    <p>Inscripción segura al canal de comunicaciones</p>
                </div>
                <form action="/api/v1/auth/register" method="POST">
                    <div class="form-group">
                        <label>Nombre de Usuario</label>
                        <input type="text" name="username" placeholder="Ej. alex_quantum" required autocomplete="off">
                    </div>
                    <div class="form-group">
                        <label>Línea Telefónica Móvil</label>
                        <input type="tel" name="telefono" placeholder="+34655766134" required autocomplete="off">
                    </div>
                    <button type="submit" class="btn-action">Verificar y Registrar</button>
                </form>
            </div>
        </body>
        </html>
    `);
});
// =================================================================
// PARTE 3 DE 3: PROCESAMIENTO DE INFOBIP, WEBSOCKETS Y ENCENDIDO FINAL
// =================================================================

// Endpoint de Procesamiento de Registro e Integración con Infobip SMS
app.post('/api/v1/auth/register', verificarLimitePeticionesIP, async (req, res) => {
    const { username, telefono } = req.body;

    if (!username || !telefono) {
        return res.status(400).json({ success: false, error: "REJECTED_EMPTY_FIELDS" });
    }

    // Limpieza de caracteres inválidos en el número de teléfono
    const telefonoLimpio = telefono.trim().replace(/[^a-zA-Z0-9+]/g, '');

    if (!telefonoLimpio.startsWith('+')) {
        return res.status(400).json({ success: false, error: "INVALID_INTERNATIONAL_PREFIX" });
    }

    try {
        // Petición de transmisión hacia la API de Infobip utilizando tus variables de entorno fijadas en Render
        const respuestaInfobip = await fetch(`${process.env.INFOBIP_BASE_URL}/sms/2/text/advanced`, {
            method: 'POST',
            headers: {
                'Authorization': `App ${process.env.INFOBIP_API_KEY}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                messages: [{
                    destinations: [{ to: telefonoLimpio }],
                    from: "VobixChat",
                    text: `[VOBIXCHAT] Hola ${username}, tu cuenta ha sido registrada correctamente en el sistema de seguridad.`
                }]
            })
        });

        if (!respuestaInfobip.ok) {
            const errorDetalle = await respuestaInfobip.text();
            console.error(`[API_ERROR] ${respuestaInfobip.status} - ${errorDetalle}`);
            return res.status(respuestaInfobip.status).json({ success: false, error: "EXTERNAL_GATEWAY_REJECTION" });
        }

        const datosRespuesta = await respuestaInfobip.json();
        lineasFisicasAutorizadas.add(telefonoLimpio);

        return res.status(200).json({ 
            success: true, 
            message: "REGISTRATION_AND_SMS_DISPATCHED",
            messageId: datosRespuesta.messages?.[0]?.messageId || null
        });

    } catch (error) {
        console.error("[CRITICAL_ERROR]", error);
        return res.status(500).json({ success: false, error: "FETCH_TRANSMISSION_FAILED" });
    }
});

// Gestión de conexiones websockets en tiempo real duraderas
io.on("connection", (socket) => {
    const ipCliente = socket.handshake.headers['x-forwarded-for'] || socket.conn.remoteAddress;
    
    if (ipReputationCache.has(ipCliente) && ipReputationCache.get(ipCliente).blocked) {
        return socket.disconnect(true);
    }

    socket.on("canal_mensaje_usuario", (datos) => {
        registroComportamientoUsuarios.set(socket.id, { ultimoContacto: Date.now() });
        io.emit("difusion_mensaje_servidor", { origen: socket.id, contenido: datos.texto || "", timestamp: Date.now() });
    });

    socket.on("disconnect", () => {
        registroComportamientoUsuarios.delete(socket.id);
    });
});

// Inicialización del puerto y encendido definitivo del servidor
const PORT = process.env.PORT || 3000;
servidorHTTP.listen(PORT, () => {
    console.log(`[SYSTEM] Servidor operativo y seguro en el puerto ${PORT}`);
});

// Captura de apagado controlado del proceso para evitar corrupción de datos
function apagarServidor(senal) {
    servidorHTTP.close(() => {
        io.close(() => {
            process.exit(0);
        });
    });
}
process.on('SIGTERM', () => apagarServidor('SIGTERM'));
process.on('SIGINT', () => apagarServidor('SIGINT'));
process.on('uncaughtException', (err) => console.error("[UNCAUGHT_ERR]", err.message));
