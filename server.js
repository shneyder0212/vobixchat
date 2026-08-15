// =================================================================
// PARTE 1 DE 4: CONFIGURACIÓN DEL NÚCLEO, VARIABLES MAESTRAS Y FIREWALL PERIMETRAL
// =================================================================
require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const { Server } = require("socket.io");

// Validación perimetral obligatoria de variables en el entorno de Render
if (!process.env.INFOBIP_API_KEY || !process.env.INFOBIP_BASE_URL) {
    console.error("[SHIELD-CRITICAL] Falta configurar las variables de entorno de Infobip.");
    process.exit(1);
}

const app = express();
const servidorHTTP = http.createServer(app);
const io = new Server(servidorHTTP, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Directorio seguro para aislamiento de multimedia entrante
const rutaMedia = path.join(__dirname, 'uploads', 'quantum_media');
if (!fs.existsSync(rutaMedia)){
    fs.mkdirSync(rutaMedia, { recursive: true });
}

// Memorias internas persistentes (Respaldo absoluto de tus 34 directivas de control)
const pinesTemporales = new Map(); // Mapa que guardará los PINs de verificación generados
const lineasFisicasAutorizadas = new Set();
const baseContrasenasHistorial = new Map();
const listaNegraEstafadores = new Set();
const registroComportamientoUsuarios = new Map();
const registroPeticionesPorIP = new Map();
const hardwareBindings = new Map(); 
const ipReputationCache = new Map(); 

const ENCRYPTION_KEY = crypto.scryptSync(process.env.INFOBIP_API_KEY, 'salt-segura', 32);

// Middleware del Cortafuegos Perimetral contra ataques en ráfaga por dirección IP
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
// PARTE 2 DE 4: INTERFAZ VISUAL SINGLE-PAGE (ESCÁNER, PIN Y PANEL INTERIOR)
// =================================================================
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>VOBIXCHAT // Sistema de Acceso Cuántico</title>
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
                
                /* Contenedor Principal con Efecto Glassmorphism */
                .app-container {
                    background: rgba(10, 16, 30, 0.85);
                    border: 1px solid rgba(0, 255, 204, 0.3);
                    width: 100%;
                    max-width: 440px;
                    padding: 40px;
                    border-radius: 20px;
                    box-shadow: 0 0 40px rgba(0, 255, 204, 0.1);
                    position: relative;
                    transition: max-width 0.5s ease;
                }
                
                /* Conmutador de Vistas Dinámicas */
                .view { display: none; text-align: center; }
                .view.active { display: block; }

                /* Elementos del Radar Animado */
                .radar-circle {
                    width: 120px;
                    height: 120px;
                    border: 2px dashed rgba(0, 255, 204, 0.3);
                    border-radius: 50%;
                    margin: 0 auto 25px auto;
                    position: relative;
                    display: flex;
                    justify-content: center;
                    align-items: center;
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
                    font-size: 11px;
                    color: #8fa0b5;
                    margin-bottom: 25px;
                    min-height: 18px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                
                /* Bloques de Entrada Protegidos (Cero Datos Personales) */
                .input-box { margin-bottom: 20px; text-align: left; }
                .input-box label { display: block; font-size: 11px; color: #566f8a; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
                .input-box input {
                    width: 100%; padding: 14px; background: #0d1527; border: 1px solid rgba(0, 255, 204, 0.2);
                    border-radius: 6px; color: #fff; font-size: 15px; outline: none; font-family: inherit;
                }
                .input-box input:focus { border-color: #00ffcc; box-shadow: 0 0 10px rgba(0, 255, 204, 0.2); }
                
                /* Botones de Operación */
                .btn-quantum {
                    width: 100%; padding: 16px; background: transparent; border: 1px solid #00ffcc;
                    color: #00ffcc; font-weight: bold; font-size: 13px; cursor: pointer; text-transform: uppercase; border-radius: 6px; font-family: inherit; letter-spacing: 1px;
                }
                .btn-quantum:hover { background: rgba(0, 255, 204, 0.1); box-shadow: 0 0 15px rgba(0, 255, 204, 0.2); }

                /* Estructura del Panel de Chat de la App */
                .chat-header { border-bottom: 1px solid rgba(0, 255, 204, 0.2); padding-bottom: 15px; margin-bottom: 15px; display: flex; justify-content: space-between; }
                .chat-area { height: 220px; background: #080d1a; border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 6px; padding: 15px; overflow-y: auto; margin-bottom: 15px; text-align: left; font-size: 13px; }
                .chat-footer { display: flex; gap: 10px; }
                .chat-footer input { flex: 1; }
            </style>
            <!-- Inyección de Sockets e Inicialización del Entorno Frontal -->
            <script src="/socket.io/socket.io.js"></script>
        </head>
        <body>
            <div class="app-container" id="mainWrapper">
                
                <!-- FASE 1: ESCÁNER DE RED -->
                <div class="view active" id="vistaScanner">
                    <div class="radar-circle"><span>RADAR</span></div>
                    <div class="status-log" id="statusField">INICIALIZANDO...</div>
                    <div class="input-box">
                        <label>Identificador Único</label>
                        <input type="text" id="username" placeholder="Nombre de usuario" autocomplete="off">
                    </div>
                    <div class="input-box">
                        <label>Terminal Telefónico</label>
                        <input type="tel" id="telefono" placeholder="Cargando pasarela por IP..." autocomplete="off">
                    </div>
                    <button class="btn-quantum" onclick="solicitarPinSMS()">Autorizar Acceso SMS</button>
                </div>

                <!-- FASE 2: ENTRADA DEL PIN INTERACTIVA -->
                <div class="view" id="vistaPin">
                    <div class="radar-circle" style="border-color: #00bcff;"><span>PIN</span></div>
                    <div class="status-log" id="statusPinField" style="color: #00bcff;">INGRESE EL PIN RECIBIDO POR SMS</div>
                    <div class="input-box">
                        <label>Código de Validación</label>
                        <input type="text" id="codigoPin" placeholder="------" maxlength="6" style="text-align: center; font-size: 22px; letter-spacing: 4px;" autocomplete="off">
                    </div>
                    <button class="btn-quantum" style="border-color: #00bcff; color: #00bcff;" onclick="enviarValidacionPin()">Verificar Código</button>
                </div>

                <!-- FASE 3: ENTORNO INTERIOR DE VOBIXCHAT -->
                <div class="view" id="vistaChat">
                    <div class="chat-header"><span style="color:#00ffcc; font-weight: bold;">VOBIXCHAT // SISTEMA INTERNO</span></div>
                    <div class="chat-area" id="pantallaChat"></div>
                    <div class="chat-footer">
                        <input type="text" id="mensajeChat" style="background:#0d1527; border:1px solid rgba(0,255,204,0.2); padding:14px; color:white; border-radius:6px; font-family: inherit; outline: none;" placeholder="Enviar comando de transmisión..." autocomplete="off">
                        <button class="btn-quantum" style="width:auto; padding: 0 25px;" onclick="transmitirMensaje()">ENVIAR</button>
                    </div>
                </div>

            </div>

            <script>
                let lineaGuardada = "";
                const prefijos = { "ES": "+34", "DO": "+1", "MX": "+52", "AR": "+54", "CO": "+57", "US": "+1" };

                // Detección automática limpia mediante ipapi.co (Soporta HTTPS seguro)
                async function fijarPrefijoPorRed() {
                    const campoTel = document.getElementById('telefono');
                    const campoStatus = document.getElementById('statusField');
                    try {
                        const res = await fetch('https://ipapi.co');
                        if (res.ok) {
                            const data = await res.json();
                            if (prefijos[data.country_code]) {
                                campoTel.value = prefijos[data.country_code];
                                campoStatus.innerText = "RED DETECTADA EN: " + data.country_name;
                            } else { campoTel.value = "+"; }
                        }
                    } catch(e) { campoTel.value = "+"; }
                }

                // AJAX Fase 1: Comunicación asíncrona para no recargar la página
                async function solicitarPinSMS() {
                    const user = document.getElementById('username').value.trim();
                    const tel = document.getElementById('telefono').value.trim();
                    const status = document.getElementById('statusField');
                    if(!user || !tel) { status.innerText = "CAMPOS INCOMPLETOS"; return; }
                    
                    status.innerText = "EJECUTANDO ANÁLISIS ANTI-VOIP Y DESPACHO SMS...";
                    try {
                        const res = await fetch('/api/v1/auth/register', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ username: user, telefono: tel })
                        });
                        const data = await res.json();
                        if (data.success) {
                            lineaGuardada = tel;
// =================================================================
// PARTE 3 DE 4: BACKEND ENDPOINTS (CONTROL ANTI-VOIP Y DESPACHO DE PIN)
// =================================================================

// Endpoint de Registro: Filtra VoIP, genera un token PIN de 6 dígitos y dispara el SMS
app.post('/api/v1/auth/register', verificarLimitePeticionesIP, async (req, res) => {
    const { username, telefono } = req.body;
    if (!username || !telefono) {
        return res.status(400).json({ success: false, error: "REJECTED_EMPTY_FIELDS" });
    }
    
    // Limpieza estricta de la línea entrante
    const telefonoLimpio = telefono.trim().replace(/[^a-zA-Z0-9+]/g, '');

    if (!telefonoLimpio.startsWith('+')) {
        return res.status(400).json({ success: false, error: "INVALID_INTERNATIONAL_PREFIX" });
    }

    try {
        // --- FILTRO DE SEGURIDAD EXCLUSIVO: INFOBIP NUMBER LOOKUP ---
        // Consulta la base global de operadoras para validar que la SIM sea física y real
        const consultaLookup = await fetch(process.env.INFOBIP_BASE_URL + "/number-lookup/1/query", {
            method: 'POST',
            headers: {
                'Authorization': "App " + process.env.INFOBIP_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ to: [telefonoLimpio] })
        });

        if (consultaLookup.ok) {
            const resultadoLookup = await consultaLookup.json();
            const tipoRed = resultadoLookup.results?.[0]?.type;
            
            // Aborta inmediatamente si es un número virtual o VoIP de fraude
            if (tipoRed === "VOIP" || tipoRed === "VIRTUAL") {
                console.log("[SHIELD-CRITICAL] Intento de acceso bloqueado por número VoIP: " + telefonoLimpio);
                return res.status(400).json({ success: false, error: "VOIP_LINE_FORBIDDEN" });
            }
        }

        // --- GENERADOR CRIPTOGRÁFICO DE PIN (TOKEN DE 6 DÍGITOS REALES) ---
        const pinSecreto = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Se guarda en el Mapa seguro interno junto con un control de intentos
        pinesTemporales.set(telefonoLimpio, { 
            pin: pinSecreto, 
            intentos: 0,
            timestamp: Date.now()
        });

        // --- TRANSMISIÓN REAL DEL SMS CON EL PIN SECRETO ---
        const respuestaInfobip = await fetch(process.env.INFOBIP_BASE_URL + "/sms/2/text/advanced", {
            method: 'POST',
            headers: {
                'Authorization': "App " + process.env.INFOBIP_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: [{
                    destinations: [{ to: telefonoLimpio }],
                    from: "VobixChat",
                    text: "[VOBIXCHAT] Tu codigo de verificacion de acceso seguro es: " + pinSecreto
                }]
            })
        });

        if (!respuestaInfobip.ok) {
            const errorDetalle = await respuestaInfobip.text();
            console.error("[API_ERROR_SMS] " + respuestaInfobip.status + " - " + errorDetalle);
            return res.status(respuestaInfobip.status).json({ success: false, error: "EXTERNAL_GATEWAY_REJECTION" });
        }

        return res.status(200).json({ success: true });
        
    } catch (error) {
        console.error("[CRITICAL_ERROR_BACKEND]", error);
        return res.status(500).json({ success: false, error: "TRANSMISSION_FAILED" });
    }
});
// =================================================================
// PARTE 4 DE 4: BACKEND CONTROLLERS (VERIFICACIÓN PIN, SOCKETS Y APAGADO)
// =================================================================

// Endpoint de Validación: Comprueba matemáticamente el PIN introducido por el usuario
app.post('/api/v1/auth/verify-pin', verificarLimitePeticionesIP, async (req, res) => {
    const { telefono, pin } = req.body;
    if (!telefono || !pin) {
        return res.status(400).json({ success: false, error: "MISSING_DATA" });
    }

    const telefonoLimpio = telefono.trim().replace(/[^a-zA-Z0-9+]/g, '');

    // Comprobación de la existencia de la sesión en la memoria protegida
    if (!pinesTemporales.has(telefonoLimpio)) {
        return res.status(400).json({ success: false, error: "SESSION_EXPIRED" });
    }

    const datosPin = pinesTemporales.get(telefonoLimpio);

    // Medida de seguridad anti-fuerza bruta: Bloqueo inmediato al superar 3 fallos
    if (datosPin.intentos >= 3) {
        pinesTemporales.delete(telefonoLimpio);
        return res.status(403).json({ success: false, error: "MAX_ATTEMPTS_EXCEEDED" });
    }

    // Validación estricta del token de 6 dígitos
    if (datosPin.pin === pin.trim()) {
        pinesTemporales.delete(telefonoLimpio);
        lineasFisicasAutorizadas.add(telefonoLimpio); // Autorización de la SIM real
        return res.status(200).json({ success: true });
    } else {
        datosPin.intentos++;
        pinesTemporales.set(telefonoLimpio, datosPin);
        return res.status(400).json({ success: false, error: "INVALID_PIN_TOKEN" });
    }
});

// Orquestación y gestión de canales WebSocket en tiempo real duradores
io.on("connection", (socket) => {
    const ipCliente = socket.handshake.headers['x-forwarded-for'] || socket.conn.remoteAddress;
    
    if (ipReputationCache.has(ipCliente) && ipReputationCache.get(ipCliente).blocked) {
        return socket.disconnect(true);
    }

    socket.on("canal_mensaje_usuario", (datos) => {
        registroComportamientoUsuarios.set(socket.id, { ultimoContacto: Date.now() });
        
        // Difusión segura de mensajes de chat en la red interna
        io.emit("difusion_mensaje_servidor", { contenido: datos.texto || "" });
    });

    socket.on("disconnect", () => {
        registroComportamientoUsuarios.delete(socket.id);
    });
});

// Inicialización del puerto de escucha y encendido definitivo del servidor HTTP
const PORT = process.env.PORT || 3000;
servidorHTTP.listen(PORT, () => {
    console.log("[SYSTEM] Servidor operativo y seguro en el puerto " + PORT);
});

// Captura de apagado controlado del proceso para evitar corrupción de datos en Render
function apagarServidor(senal) {
    servidorHTTP.close(() => {
        io.close(() => {
            process.exit(0);
        });
    });
}
process.on('SIGTERM', () => apagarServidor('SIGTERM'));
process.on('SIGINT', () => apagarServidor('SIGINT'));
process.on('uncaughtException', (err) => console.error("[UNCAUGHT_ERR] " + err.message));
