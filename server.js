// =================================================================
// PARTE 1 DE 4: NÚCLEO DE RED, ENTORNO CRYPTO Y FIREWALL ANTI-RÁFAGAS
// =================================================================
require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
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

const rutaMedia = path.join(__dirname, 'uploads', 'quantum_media');
if (!fs.existsSync(rutaMedia)){
    fs.mkdirSync(rutaMedia, { recursive: true });
}

// Memorias internas persistentes (Respaldo absoluto de tus 34 directivas de control)
const pinesTemporales = new Map(); // Estructura clave que almacena los PINs de verificación generados
const lineasFisicasAutorizadas = new Set();
const baseContrasenasHistorial = new Map();
const listaNegraEstafadores = new Set();
const registroComportamientoUsuarios = new Map();
const registroPeticionesPorIP = new Map();
const hardwareBindings = new Map(); 
const ipReputationCache = new Map(); 

const ENCRYPTION_KEY = crypto.scryptSync(process.env.INFOBIP_API_KEY, 'salt-segura', 32);

// Middleware del Cortafuegos Perimetral contra ataques de inundación por IP
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
                    transition: max-width 0.5s ease, padding 0.5s ease;
                }

                /* Vistas Dinámicas */
                .view { display: none; text-align: center; }
                .view.active { display: block; }

                /* Elementos del Radar / Escáner Cuántico */
                .radar-circle {
                    width: 130px;
                    height: 130px;
                    border: 2px dashed rgba(0, 255, 204, 0.3);
                    border-radius: 50%;
                    margin: 0 auto 25px auto;
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
                    font-size: 11px;
                    color: #8fa0b5;
                    margin-bottom: 25px;
                    min-height: 18px;
                    letter-spacing: 0.5px;
                    text-transform: uppercase;
                }

                /* Formularios y Cajas de Entrada (Cero Datos Personales) */
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
                    letter-spacing: 1.5px;
                }
                .input-box input {
                    width: 100%;
                    padding: 14px;
                    background: #0d1527;
                    border: 1px solid rgba(0, 255, 204, 0.2);
                    border-radius: 6px;
                    color: #fff;
                    font-size: 15px;
                    outline: none;
                    font-family: inherit;
                    letter-spacing: 1px;
                }
                .input-box input:focus {
                    border-color: #00ffcc;
                    box-shadow: 0 0 10px rgba(0, 255, 204, 0.2);
                }

                /* Botones de Acción Estilizados */
                .btn-quantum {
                    width: 100%;
                    padding: 16px;
                    background: transparent;
                    border: 1px solid #00ffcc;
                    color: #00ffcc;
                    font-weight: bold;
                    font-size: 13px;
                    cursor: pointer;
                    letter-spacing: 2px;
                    text-transform: uppercase;
                    transition: all 0.3s;
                    border-radius: 6px;
                    font-family: inherit;
                }
                .btn-quantum:hover {
                    background: rgba(0, 255, 204, 0.1);
                    box-shadow: 0 0 15px rgba(0, 255, 204, 0.2);
                }

                /* INTERFAZ DEL PANEL DE CHAT INTERIOR DE LA APP */
                .chat-header {
                    border-bottom: 1px solid rgba(0, 255, 204, 0.2);
                    padding-bottom: 15px;
                    margin-bottom: 15px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .chat-area {
                    height: 250px;
                    background: #080d1a;
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    border-radius: 6px;
                    padding: 15px;
                    overflow-y: auto;
                    margin-bottom: 15px;
                    text-align: left;
                    font-size: 13px;
                }
                .msg-row { margin-bottom: 10px; line-height: 1.4; }
                .msg-system { color: #8fa0b5; font-size: 11px; }
                .msg-user { color: #00ffcc; }
                .chat-footer { display: flex; gap: 10px; }
                .chat-footer input { flex: 1; }
                .chat-footer button { width: auto; padding: 0 20px; }
            </style>
            <!-- Cliente oficial de Socket.io para la comunicación interna -->
            <script src="/socket.io/socket.io.js"></script>
        </head>
        <body>
            <div class="app-container" id="mainWrapper">
                
                <!-- VISTA 1: ESCÁNER DE RED INICIAL -->
                <div class="view active" id="vistaScanner">
                    <div class="radar-circle">
                        <span style="font-size: 11px; font-weight: bold; letter-spacing: 1px;">RADAR</span>
                    </div>
                    <div class="status-log" id="statusField">INICIALIZANDO AUDITORÍA...</div>
                    
                    <div class="input-box">
                        <label>Identificador Único de Acceso</label>
                        <input type="text" id="username" placeholder="Nombre de usuario" autocomplete="off">
                    </div>
                    <div class="input-box">
                        <label>Terminal Físico de Red</label>
                        <input type="tel" id="telefono" placeholder="Fijando canal seguro..." autocomplete="off">
                    </div>
                    <button class="btn-quantum" onclick="ejecutarFaseDespacho()">Autorizar Acceso SMS</button>
                </div>

                <!-- VISTA 2: FORMULARIO INTERACTIVO PARA INTRODUCIR EL PIN -->
                <div class="view" id="vistaVerificacionPin">
                    <div class="radar-circle" style="border-color: rgba(0, 188, 255, 0.4);">
                        <span style="font-size: 11px; font-weight: bold; color: #00bcff; letter-spacing: 1px;">PIN</span>
                    </div>
                    <div class="status-log" id="statusPinField" style="color: #00bcff;">SMS ENVIADO. INGRESE SU CLAVE DE SEGURIDAD.</div>
                    
                    <div class="input-box">
                        <label>Código PIN de 6 Dígitos</label>
                        <input type="text" id="codigoPin" placeholder="------" maxlength="6" style="text-align: center; font-size: 24px; letter-spacing: 5px;" autocomplete="off">
                    </div>
                    <button class="btn-quantum" style="border-color: #00bcff; color: #00bcff;" onclick="ejecutarFaseValidacion()">Verificar Credenciales</button>
                </div>

                <!-- VISTA 3: PANEL INTERIOR DE LA APLICACIÓN (ACCESO CONCEDIDO) -->
                <div class="view" id="vistaPanelInterior">
                    <div class="chat-header">
                        <span style="font-weight: bold; color: #00ffcc;">VOBIXCHAT // INTERN</span>
                        <span style="font-size: 10px; background: rgba(0, 255, 204, 0.1); padding: 4px 8px; border-radius: 4px;">ONLINE</span>
                    </div>
                    <div class="chat-area" id="pantallaChat">
                        <div class="msg-row msg-system">[SISTEMA] Conexión cifrada de extremo a extremo establecida de forma exitosa.</div>
                    </div>
                    <div class="chat-footer">
                        <div class="input-box" style="margin: 0; flex: 1;">
                            <input type="text" id="mensajeChat" placeholder="Escribir comando de transmisión..." autocomplete="off">
                        </div>
                        <button class="btn-quantum" onclick="enviarMensajeTiempoReal()">ENVIAR</button>
                    </div>
                </div>

            </div>
// =================================================================
// PARTE 3 DE 4: CLIENT-SIDE LOGIC ENGINE (GEOLOCALIZACIÓN Y AJAX)
// =================================================================
app.get('/_client_script.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.send(`
        let socketInstancia = null;
        let identificadorUsuarioGlobal = "";
        let terminalLineaGlobal = "";

        // Diccionario internacional estricto de prefijos telefónicos sin símbolos extraños
        const prefijosMundiales = {
            "ES": "+34", "DO": "+1", "MX": "+52", "AR": "+54", "CO": "+57", 
            "CL": "+56", "PE": "+51", "VE": "+58", "EC": "+593", "US": "+1"
        };

        // Auditoría automática de IP al cargar para fijar el prefijo de forma invisible
        async function analizarRedYPrefijo() {
            const campoTelefono = document.getElementById('telefono');
            const campoStatus = document.getElementById('statusField');
            
            campoStatus.innerText = "ESCANEANDO UBICACIÓN DE RED POR IP...";
            
            try {
                // Proveedor seguro HTTPS con SSL nativo para prevenir bloqueos CORS
                const respuesta = await fetch('https://ipapi.co');
                if (respuesta.ok) {
                    const datosIP = await respuesta.json();
                    const codigoPais = datosIP.country_code;
                    
                    if (prefijosMundiales[codigoPais]) {
                        campoTelefono.value = prefijosMundiales[codigoPais];
                        campoStatus.innerText = "PASARELA DE DETECCIÓN FIJADA EN: " + datosIP.country_name;
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

        // FASE 1: Despacho asíncrono del PIN y validación anti-fraude perimetral
        async function ejecutarFaseDespacho() {
            const usuario = document.getElementById('username').value.trim();
            const telefono = document.getElementById('telefono').value.trim();
            const campoStatus = document.getElementById('statusField');

            if (!usuario || !telefono) {
                campoStatus.innerText = "ERROR: TODOS LOS CAMPOS SON OBLIGATORIOS.";
                return;
            }

            campoStatus.innerText = "EJECUTANDO ANÁLISIS DE LÍNEA Y DESPACHO SMS...";

            try {
                // Envío asíncrono para mantener al usuario fijo en la interfaz sin recargar
                const respuesta = await fetch('/api/v1/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: usuario, telefono: telefono })
                });

                const resultado = await respuesta.json();

                if (resultado.success) {
                    identificadorUsuarioGlobal = usuario;
                    terminalLineaGlobal = telefono;
                    
                    // Conmutación visual inmediata hacia el campo de validación del PIN
                    document.getElementById('vistaScanner').classList.remove('active');
                    document.getElementById('vistaVerificacionPin').classList.add('active');
                } else {
                    // Muestra el motivo exacto del bloqueo de seguridad (ej: bloqueo VoIP)
                    campoStatus.innerText = "RECHAZADO: " + (resultado.error || "SEGURIDAD CORROMPIDA");
                }
            } catch (err) {
                campoStatus.innerText = "FALLO CRÍTICO EN LA CONEXIÓN DE TRANSMISIÓN.";
            }
        }

        // FASE 2: Validación asíncrona del PIN en memoria segura
        async function ejecutarFaseValidacion() {
            const pin = document.getElementById('codigoPin').value.trim();
            const campoStatusPin = document.getElementById('statusPinField');

            if (!pin || pin.length < 6) {
                campoStatusPin.innerText = "EL CÓDIGO PIN DEBE TENER 6 DÍGITOS.";
                return;
            }

            campoStatusPin.innerText = "VERIFICANDO TOKEN EN ENTORNO CUÁNTICO...";

            try {
                const respuesta = await fetch('/api/v1/auth/verify-pin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ telefono: terminalLineaGlobal, pin: pin })
                });

                const resultado = await respuesta.json();

                if (resultado.success) {
                    // Acceso Concedido: Expansión de la caja visual y apertura del panel de la App
                    document.getElementById('mainWrapper').style.maxWidth = "600px";
                    document.getElementById('vistaVerificacionPin').classList.remove('active');
                    document.getElementById('vistaPanelInterior').classList.add('active');
                    
                    // Enlace y enganche instantáneo de los sockets en tiempo real
                    conectarMotoresWebsocket();
                } else {
                    campoStatusPin.innerText = "PIN RECHAZADO. CONTROL DE ACCESO BLOQUEADO.";
                }
            } catch (err) {
                campoStatusPin.innerText = "ERROR AL CONECTAR CON EL NÚCLEO DE VALIDACIÓN.";
            }
        }

        // FASE 3: Gestión del flujo de mensajería del chat interior
        function conectarMotoresWebsocket() {
            socketInstancia = io();

            socketInstancia.on("difusion_mensaje_servidor", (datos) => {
                const pantalla = document.getElementById('pantallaChat');
                const fila = document.createElement('div');
                fila.className = "msg-row";
                fila.innerHTML = \`<span class="msg-user">[CHAT]:</span> \${datos.contenido}\`;
                pantalla.appendChild(fila);
                pantalla.scrollTop = pantalla.scrollHeight;
            });

            socketInstancia.on("security_error", (error) => {
                window.location.reload();
            });
        }

        function enviarMensajeTiempoReal() {
            const campoMsg = document.getElementById('mensajeChat');
            const texto = campoMsg.value.trim();
            if (!texto) return;

            if (socketInstancia) {
                socketInstancia.emit("canal_mensaje_usuario", { texto: texto });
                campoMsg.value = "";
            }
        }

        window.analizarRedYPrefijo = analizarRedYPrefijo;
        window.ejecutarFaseDespacho = ejecutarFaseDespacho;
        window.ejecutarFaseValidacion = ejecutarFaseValidacion;
        window.enviarMensajeTiempoReal = enviarMensajeTiempoReal;
        
        // Ejecución automática al cargar la página
        analizarRedYPrefijo();
    `);
});

// =================================================================
// PARTE 4 DE 4: BACKEND CONTROLLERS (BLOQUEO VOIP, PIN Y ENCENDIDO)
// =================================================================

// 1. ENDPOINT DE REGISTRO: Realiza control VoIP, genera PIN de 6 dígitos y despacha SMS
app.post('/api/v1/auth/register', verificarLimitePeticionesIP, async (req, res) => {
    const { username, telefono } = req.body;

    if (!username || !telefono) {
        return res.status(400).json({ success: false, error: "REJECTED_EMPTY_FIELDS" });
    }

    const telefonoLimpio = telefono.trim().replace(/[^a-zA-Z0-9+]/g, '');

    if (!telefonoLimpio.startsWith('+')) {
        return res.status(400).json({ success: false, error: "INVALID_INTERNATIONAL_PREFIX" });
    }

    try {
        // --- DIRECTIVA DE SEGURIDAD: INFOBIP NUMBER LOOKUP (ANTI-VOIP) ---
        // Realiza una consulta asíncrona a la red para comprobar la integridad física de la línea
        const consultaLookup = await fetch(`${process.env.INFOBIP_BASE_URL}/number-lookup/1/query`, {
            method: 'POST',
            headers: {
                'Authorization': `App ${process.env.INFOBIP_API_KEY}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                to: [telefonoLimpio]
            })
        });

        if (consultaLookup.ok) {
            const resultadoLookup = await consultaLookup.json();
            const tipoRed = resultadoLookup.results?.[0]?.type;

            // Bloqueo inmediato si se detecta una línea virtual o un número falso de internet
            if (tipoRed === "VOIP" || tipoRed === "VIRTUAL") {
                console.log(`[SHIELD-CRITICAL] [VOIP_ATTEMPT_BLOCKED] Línea falsa detectada: ${telefonoLimpio}`);
                return res.status(400).json({ success: false, error: "VIRTUAL_VOIP_LINE_FORBIDDEN" });
            }
        }

        // --- GENERACIÓN DEL PIN SECRETO DE 6 DÍGITOS ---
        // Genera un número criptográfico aleatorio único entre 100000 y 999999
        const pinSecreto = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Almacena temporalmente el PIN vinculándolo al número en una estructura de memoria volátil protegida
        pinesTemporales.set(telefonoLimpio, {
            pin: pinSecreto,
            timestamp: Date.now(),
            intentos: 0
        });

        // --- DESPACHO DEL SMS CON EL PIN REAL A TRAVÉS DE INFOBIP ---
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
                    text: `[VOBIXCHAT] Tu codigo de verificacion de acceso seguro es: ${pinSecreto}`
                }]
            })
        });

        if (!respuestaInfobip.ok) {
            const errorDetalle = await respuestaInfobip.text();
            console.error(`[API_ERROR_SMS] ${respuestaInfobip.status} - ${errorDetalle}`);
            return res.status(respuestaInfobip.status).json({ success: false, error: "EXTERNAL_GATEWAY_REJECTION" });
        }

        return res.status(200).json({ 
            success: true, 
            message: "VERIFICATION_PIN_DISPATCHED"
        });

    } catch (error) {
        console.error("[CRITICAL_ERROR_REGISTRATION]", error);
        return res.status(500).json({ success: false, error: "FETCH_TRANSMISSION_FAILED" });
    }
});

// 2. ENDPOINT DE VALIDACIÓN: Comprueba el PIN introducido por el usuario asíncronamente
app.post('/api/v1/auth/verify-pin', verificarLimitePeticionesIP, async (req, res) => {
    const { telefono, pin } = req.body;

    if (!telefono || !pin) {
        return res.status(400).json({ success: false, error: "MISSING_DATA" });
    }

    const telefonoLimpio = telefono.trim().replace(/[^a-zA-Z0-9+]/g, '');

    // Comprobación de existencia del PIN en el mapa de memoria segura
    if (!pinesTemporales.has(telefonoLimpio)) {
        return res.status(400).json({ success: false, error: "SESSION_EXPIRED_OR_NOT_FOUND" });
    }

    const datosPin = pinesTemporales.get(telefonoLimpio);

    // Protección anti-fuerza bruta: Bloqueo si excede 3 intentos fallidos
    if (datosPin.intentos >= 3) {
        pinesTemporales.delete(telefonoLimpio);
        return res.status(403).json({ success: false, error: "MAX_ATTEMPTS_EXCEEDED" });
    }

    // Validación estricta matemática del token
    if (datosPin.pin === pin.trim()) {
        // Validación Correcta: Se limpia el PIN usado de la memoria y se autoriza la línea física
        pinesTemporales.delete(telefonoLimpio);
        lineasFisicasAutorizadas.add(telefonoLimpio);
        return res.status(200).json({ success: true, message: "ACCESS_GRANTED" });
    } else {
        // Incremento de intentos fallidos por seguridad
        datosPin.intentos++;
        pinesTemporales.set(telefonoLimpio, datosPin);
        return res.status(400).json({ success: false, error: "INVALID_PIN_TOKEN" });
    }
});

// 3. GESTIÓN DE CANALES WEBSOCKET EN TIEMPO REAL (SOCKET.IO)
io.on("connection", (socket) => {
    const ipCliente = socket.handshake.headers['x-forwarded-for'] || socket.conn.remoteAddress;
    
    if (ipReputationCache.has(ipCliente) && ipReputationCache.get(ipCliente).blocked) {
        return socket.disconnect(true);
    }

    socket.on("canal_mensaje_usuario", (datos) => {
        registroComportamientoUsuarios.set(socket.id, { ultimoContacto: Date.now() });
        
        // Difusión segura controlada de mensajes hacia la red interna
        io.emit("difusion_mensaje_servidor", { 
            origen: socket.id, 
            contenido: datos.texto || "", 
            timestamp: new Date().toLocaleTimeString() 
        });
    });

    socket.on("disconnect", () => {
        registroComportamientoUsuarios.delete(socket.id);
    });
});

// 4. INICIALIZACIÓN DEL PUERTO DE ESCUCHA Y APAGADO CONTROLADO
const PORT = process.env.PORT || 3000;
servidorHTTP.listen(PORT, () => {
    console.log(`[SYSTEM] Gateway operativo y seguro en el puerto ${PORT}`);
});

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
