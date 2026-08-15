// =================================================================
// PARTE 1 DE 3: MÓDULOS DEL NÚCLEO, FIREWALL ANTI-RÁFAGAS Y CONTROL CRIPTOGRÁFICO
// =================================================================
require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const { Server } = require("socket.io");

// Validación perimetral de credenciales del sistema en Render
if (!process.env.INFOBIP_API_KEY || !process.env.INFOBIP_BASE_URL) {
    console.error("[SHIELD-CRITICAL] Falta configurar las variables de entorno de Infobip.");
    process.exit(1);
}

const app = express();
const servidorHTTP = http.createServer(app);
const io = new Server(servidorHTTP, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Repositorio de almacenamiento seguro para archivos multimedia aislados
const rutaMedia = path.join(__dirname, 'uploads', 'quantum_media');
if (!fs.existsSync(rutaMedia)){
    fs.mkdirSync(rutaMedia, { recursive: true });
}

// Memorias persistentes en tiempo de ejecución (Directivas obligatorias de control)
const pinesTemporales = new Map();
const lineasFisicasAutorizadas = new Set();
const baseContrasenasHistorial = new Map();
const listaNegraEstafadores = new Set();
const registroComportamientoUsuarios = new Map();
const registroPeticionesPorIP = new Map();
const hardwareBindings = new Map(); 
const ipReputationCache = new Map(); 

// Inicialización del motor criptográfico del servidor
const ENCRYPTION_KEY = crypto.scryptSync(process.env.INFOBIP_API_KEY, 'salt-segura', 32);

// Filtro perimetral del Firewall por IP: Bloquea intentos de inundación (DDoS)
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

// Configuración de almacenamiento en disco protegido
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
// PARTE 2 DE 3: INTERFAZ VISUAL "QUANTUM SCANNER" CON DETECCIÓN AUTOMÁTICA POR IP
// =================================================================
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>VOBIXCHAT // Escáner de Red</title>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { 
                    font-family: 'Consolas', monospace, sans-serif; 
                    background: #060913; 
                    color: #00ffcc; 
                    display: flex; 
                    justify-content: center; 
                    align-items: center; 
                    min-height: 100vh;
                    overflow: hidden;
                }
                .scanner-frame {
                    background: rgba(10, 16, 30, 0.85);
                    border: 1px solid rgba(0, 255, 204, 0.3);
                    width: 100%;
                    max-width: 440px;
                    padding: 40px;
                    border-radius: 20px;
                    box-shadow: 0 0 40px rgba(0, 255, 204, 0.1);
                    text-align: center;
                    position: relative;
                }
                .radar-circle {
                    width: 140px;
                    height: 140px;
                    border: 2px dashed rgba(0, 255, 204, 0.4);
                    border-radius: 50%;
                    margin: 0 auto 30px auto;
                    position: relative;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    box-shadow: inset 0 0 20px rgba(0, 255, 204, 0.05);
                }
                .radar-circle::after {
                    content: '';
                    position: absolute;
                    width: 100%;
                    height: 100%;
                    border: 2px solid #00ffcc;
                    border-radius: 50%;
                    border-left-color: transparent;
                    border-bottom-color: transparent;
                    animation: spinRadar 2s linear infinite;
                }
                @keyframes spinRadar {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .status-log {
                    font-size: 12px;
                    color: #8fa0b5;
                    margin-bottom: 25px;
                    height: 18px;
                    letter-spacing: 1px;
                }
                .input-box {
                    margin-bottom: 20px;
                    text-align: left;
                }
                .input-box label {
                    display: block;
                    font-size: 11px;
                    color: #566f8a;
                    margin-bottom: 8px;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                }
                .input-box input {
                    width: 100%;
                    padding: 14px;
                    background: #0d1527;
                    border: 1px solid rgba(0, 255, 204, 0.2);
                    border-radius: 6px;
                    color: #fff;
                    font-size: 16px;
                    outline: none;
                    font-family: inherit;
                    letter-spacing: 1px;
                }
                .input-box input:focus {
                    border-color: #00ffcc;
                    box-shadow: 0 0 10px rgba(0, 255, 204, 0.2);
                }
                .btn-scan {
                    width: 100%;
                    padding: 16px;
                    background: transparent;
                    border: 1px solid #00ffcc;
                    color: #00ffcc;
                    font-weight: bold;
                    font-size: 14px;
                    cursor: pointer;
                    letter-spacing: 2px;
                    text-transform: uppercase;
                    transition: all 0.3s;
                    border-radius: 6px;
                    font-family: inherit;
                }
                .btn-scan:hover {
                    background: rgba(0, 255, 204, 0.1);
                    box-shadow: 0 0 15px rgba(0, 255, 204, 0.2);
                }
            </style>
        </head>
        <body>
            <div class="scanner-frame">
                <div class="radar-circle">
                    <span style="font-size: 11px; font-weight: bold; letter-spacing: 1px;">SECURE</span>
                </div>
                <div class="status-log" id="statusField">SISTEMA INICIALIZADO...</div>
                
                <form action="/api/v1/auth/register" method="POST">
                    <div class="input-box">
                        <label>Identificador Único</label>
                        <input type="text" name="username" placeholder="Nombre de usuario" required autocomplete="off">
                    </div>
                    <div class="input-box">
                        <label>Terminal Físico (Línea)</label>
                        <input type="tel" id="telefono" name="telefono" placeholder="Cargando pasarela..." required autocomplete="off">
                    </div>
                    <button type="submit" class="btn-scan">Autorizar Acceso SMS</button>
                </form>
            </div>

            <script>
                // Mapeo dinámico de prefijos sin banderas
                const prefijosMundiales = {
                    "ES": "+34", "DO": "+1", "MX": "+52", "AR": "+54", "CO": "+57", 
                    "CL": "+56", "PE": "+51", "VE": "+58", "EC": "+593", "US": "+1"
                };

                async function analizarRedYPrefijo() {
                    const campoTelefono = document.getElementById('telefono');
                    const campoStatus = document.getElementById('statusField');
                    
                    campoStatus.innerText = "ESCANEANDO UBICACIÓN DE RED POR IP...";
                    
                    try {
                        const respuesta = await fetch('https://ip-api.com');
                        if (respuesta.ok) {
                            const datosIP = await respuesta.json();
                            const codigoPais = datosIP.countryCode;
                            
                            if (prefijosMundiales[codigoPais]) {
                                campoTelefono.value = prefijosMundiales[codigoPais];
                                campoStatus.innerText = "PASARELA DE DETECCIÓN FIJADA EN: " + datosIP.country;
                            } else {
                                campoTelefono.value = "+";
                                campoStatus.innerText = "ZONA GLOBAL DETECTADA - PASARELA LISTA";
                            }
                        } else {
                            campoTelefono.value = "+";
                            campoStatus.innerText = "MODO CONTINGENCIA ACTIVO - INGRESE PREFIJO";
                        }
                    } catch (error) {
                        campoTelefono.value = "+";
                        campoStatus.innerText = "MODO CONTINGENCIA ACTIVO - INGRESE PREFIJO";
                    }
                }
                window.onload = analizarRedYPrefijo;
            </script>
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
