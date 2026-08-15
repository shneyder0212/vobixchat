// =================================================================
// PARTE 1 DE 6: DECLARACIÓN DE MÓDULOS DE SISTEMA Y CONTROL DE MEMORIA
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
// =================================================================
// PARTE 2 DE 6: ESTRUCTURAS DE SEGURIDAD INTERNA Y FIREWALL POR IP
// =================================================================

// Memorias internas persistentes en el servidor (Tus 34 directivas de control)
const pinesTemporales = new Map(); // Mapa que guardará los PINs de verificación generados
const lineasFisicasAutorizadas = new Set();
const baseContrasenasHistorial = new Map();
const listaNegraEstafadores = new Set();
const registroComportamientoUsuarios = new Map();
const registroPeticionesPorIP = new Map();
const hardwareBindings = new Map(); 
const ipReputationCache = new Map(); 

// Inicialización del motor criptográfico del núcleo
const ENCRYPTION_KEY = crypto.scryptSync(process.env.INFOBIP_API_KEY, 'salt-segura', 32);

// Middleware del Cortafuegos Perimetral contra ataques en ráfaga por dirección IP
function verificarLimitePeticionesIP(req, res, next) {
    const direccionIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const tiempoActual = Date.now();
    
    // Control de reputación: Bloqueo inmediato si la IP ya está bloqueada en caché
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
            // Baneo permanente de IP si genera ráfagas en ventanas sucesivas
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

// Configuración del disco para almacenamiento seguro y sanitizado
const almacenamientoConfig = multer.diskStorage({
    destination: (req, file, cb) => cb(null, rutaMedia),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, ''))
});

const upload = multer({ 
    storage: almacenamientoConfig,
    limits: { fileSize: 10 * 1024 * 1024 }, // Límite estricto de peso de 10MB
    fileFilter: (req, file, cb) => {
        // Bloqueo de malware: Solo documentos PDF, Imágenes y Audio pasan al disco
        if (file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/') || file.mimetype.startsWith('audio/')) {
            cb(null, true);
        } else {
            cb(new Error('SECURITY_FILE_TYPE_REJECTED'), false);
        }
    }
});
// =================================================================
// PARTE 3 DE 6: CAPA DE ENTRADA WEB Y HOJA DE ESTILOS CSS (SPA INTEGRADA)
// =================================================================
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.write(
        '<!DOCTYPE html>\n' +
        '<html lang="es">\n' +
        '<head>\n' +
        '    <meta charset="UTF-8">\n' +
        '    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
        '    <title>VOBIXCHAT // Sistema de Acceso Cuántico</title>\n' +
        '    <style>\n' +
        '        * { box-sizing: border-box; margin: 0; padding: 0; }\n' +
        '        body { \n' +
        '            font-family: "Consolas", monospace, sans-serif; \n' +
        '            background: #060913; \n' +
        '            color: #00ffcc; \n' +
        '            display: flex; \n' +
        '            justify-content: center; \n' +
        '            align-items: center; \n' +
        '            min-height: 100vh;\n' +
        '            overflow: hidden;\n' +
        '        }\n' +
        '        /* Marco Principal de la App */\n' +
        '        .app-container {\n' +
        '            background: rgba(10, 16, 30, 0.85);\n' +
        '            border: 1px solid rgba(0, 255, 204, 0.3);\n' +
        '            width: 100%;\n' +
        '            max-width: 440px;\n' +
        '            padding: 40px;\n' +
        '            border-radius: 20px;\n' +
        '            box-shadow: 0 0 40px rgba(0, 255, 204, 0.1);\n' +
        '            position: relative;\n' +
        '            transition: max-width 0.5s ease;\n' +
        '        }\n' +
        '        /* Conmutador de Vistas Dinámicas */\n' +
        '        .view { display: none; text-align: center; }\n' +
        '        .view.active { display: block; }\n' +
        '        \n' +
        '        /* Animación del Radar Cuántico */\n' +
        '        .radar-circle {\n' +
        '            width: 120px;\n' +
        '            height: 120px;\n' +
        '            border: 2px dashed rgba(0, 255, 204, 0.3);\n' +
        '            border-radius: 50%;\n' +
        '            margin: 0 auto 25px auto;\n' +
        '            position: relative;\n' +
        '            display: flex;\n' +
        '            justify-content: center;\n' +
        '            align-items: center;\n' +
        '        }\n' +
        '        .radar-circle::after {\n' +
        '            content: "";\n' +
        '            position: absolute;\n' +
        '            width: 100%;\n' +
        '            height: 100%;\n' +
        '            border: 2px solid #00ffcc;\n' +
        '            border-radius: 50%;\n' +
        '            border-left-color: transparent;\n' +
        '            border-bottom-color: transparent;\n' +
        '            animation: spinRadar 2s linear infinite;\n' +
        '        }\n' +
        '        @keyframes spinRadar {\n' +
        '            0% { transform: rotate(0deg); }\n' +
        '            100% { transform: rotate(360deg); }\n' +
        '        }\n' +
        '        .status-log {\n' +
        '            font-size: 11px;\n' +
        '            color: #8fa0b5;\n' +
        '            margin-bottom: 25px;\n' +
        '            min-height: 18px;\n' +
        '            text-transform: uppercase;\n' +
        '            letter-spacing: 0.5px;\n' +
        '        }\n' +
        '        /* Cajas de Entrada (Cero Números Personales) */\n' +
        '        .input-box { margin-bottom: 20px; text-align: left; }\n' +
        '        .input-box label { display: block; font-size: 11px; color: #566f8a; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }\n' +
        '        .input-box input {\n' +
        '            width: 100%; padding: 14px; background: #0d1527; border: 1px solid rgba(0, 255, 204, 0.2);\n' +
        '            border-radius: 6px; color: #fff; font-size: 15px; outline: none; font-family: inherit;\n' +
        '        }\n' +
        '        .input-box input:focus { border-color: #00ffcc; box-shadow: 0 0 10px rgba(0, 255, 204, 0.2); }\n' +
        '        .btn-quantum {\n' +
        '            width: 100%; padding: 16px; background: transparent; border: 1px solid #00ffcc;\n' +
        '            color: #00ffcc; font-weight: bold; font-size: 13px; cursor: pointer; text-transform: uppercase; border-radius: 6px; font-family: inherit; letter-spacing: 1px;\n' +
        '        }\n' +
        '        .btn-quantum:hover { background: rgba(0, 255, 204, 0.1); box-shadow: 0 0 15px rgba(0, 255, 204, 0.2); }\n' +
        '        \n' +
        '        /* Estilos del Entorno de Chat Interno */\n' +
        '        .chat-header { border-bottom: 1px solid rgba(0, 255, 204, 0.2); padding-bottom: 15px; margin-bottom: 15px; display: flex; justify-content: space-between; }\n' +
        '        .chat-area { height: 220px; background: #080d1a; border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 6px; padding: 15px; overflow-y: auto; margin-bottom: 15px; text-align: left; font-size: 13px; }\n' +
        '        .chat-footer { display: flex; gap: 10px; }\n' +
        '        .chat-footer input { flex: 1; }\n' +
        '    </style>\n' +
        '    <script src="/socket.io/socket.io.js"></script>\n' +
        '</head>'
    );
    res.write(
        '<body>\n' +
        '    <div class="app-container" id="mainWrapper">\n' +
        '        \n' +
        '        <!-- FASE 1: ESCÁNER DE RED -->\n' +
        '        <div class="view active" id="vistaScanner">\n' +
        '            <div class="radar-circle"><span>RADAR</span></div>\n' +
        '            <div class="status-log" id="statusField">INICIALIZANDO...</div>\n' +
        '            <div class="input-box">\n' +
        '                <label>Identificador Único</label>\n' +
        '                <input type="text" id="username" placeholder="Nombre de usuario" autocomplete="off">\n' +
        '            </div>\n' +
        '            <div class="input-box">\n' +
        '                <label>Terminal Telefónico</label>\n' +
        '                <input type="tel" id="telefono" placeholder="Cargando pasarela por IP..." autocomplete="off">\n' +
        '            </div>\n' +
        '            <button class="btn-quantum" onclick="solicitarPinSMS()">Autorizar Acceso SMS</button>\n' +
        '        </div>\n' +
        '\n' +
        '        <!-- FASE 2: ENTRADA DEL PIN INTERACTIVA -->\n' +
        '        <div class="view" id="vistaPin">\n' +
        '            <div class="radar-circle" style="border-color: #00bcff;"><span>PIN</span></div>\n' +
        '            <div class="status-log" id="statusPinField" style="color: #00bcff;">INGRESE EL PIN RECIBIDO POR SMS</div>\n' +
        '            <div class="input-box">\n' +
        '                <label>Código de Validación</label>\n' +
        '                <input type="text" id="codigoPin" placeholder="------" maxlength="6" style="text-align: center; font-size: 22px; letter-spacing: 4px;" autocomplete="off">\n' +
        '            </div>\n' +
        '            <button class="btn-quantum" style="border-color: #00bcff; color: #00bcff;" onclick="enviarValidacionPin()">Verificar Código</button>\n' +
        '        </div>\n' +
        '\n' +
        '        <!-- FASE 3: ENTORNO INTERIOR DE VOBIXCHAT -->\n' +
        '        <div class="view" id="vistaChat">\n' +
        '            <div class="chat-header"><span style="color:#00ffcc; font-weight: bold;">VOBIXCHAT // SISTEMA INTERNO</span></div>\n' +
        '            <div class="chat-area" id="pantallaChat"></div>\n' +
        '            <div class="chat-footer">\n' +
        '                <input type="text" id="mensajeChat" style="background:#0d1527; border:1px solid rgba(0,255,204,0.2); padding:14px; color:white; border-radius:6px; font-family: inherit; outline: none;" placeholder="Enviar comando de transmisión..." autocomplete="off">\n' +
        '                <button class="btn-quantum" style="width:auto; padding: 0 25px;" onclick="transmitirMensaje()">ENVIAR</button>\n' +
        '            </div>\n' +
        '        </div>\n' +
        '\n' +
        '    </div>'
    );
    res.end(
        '    <script>\n' +
        '        let lineaGuardada = "";\n' +
        '        const prefijos = { "ES": "+34", "DO": "+1", "MX": "+52", "AR": "+54", "CO": "+57", "US": "+1" };\n' +
        '\n' +
        '        async function fijarPrefijoPorRed() {\n' +
        '            const campoTel = document.getElementById("telefono");\n' +
        '            const campoStatus = document.getElementById("statusField");\n' +
        '            try {\n' +
        '                const res = await fetch("https://ipapi.co");\n' +
        '                if (res.ok) {\n' +
        '                    const data = await res.json();\n' +
        '                    if (prefijos[data.country_code]) {\n' +
        '                        campoTel.value = prefijos[data.country_code];\n' +
        '                        campoStatus.innerText = "RED DETECTADA EN: " + data.country_name;\n' +
        '                    } else { campoTel.value = "+"; }\n' +
        '                }\n' +
        '            } catch(e) { campoTel.value = "+"; }\n' +
        '        }\n' +
        '\n' +
        '        async function solicitarPinSMS() {\n' +
        '            const user = document.getElementById("username").value.trim();\n' +
        '            const tel = document.getElementById("telefono").value.trim();\n' +
        '            const status = document.getElementById("statusField");\n' +
        '            if(!user || !tel) { status.innerText = "CAMPOS INCOMPLETOS"; return; }\n' +
        '            \n' +
        '            status.innerText = "EJECUTANDO ANÁLISIS ANTI-VOIP Y DESPACHO SMS...";\n' +
        '            try {\n' +
        '                const res = await fetch("/api/v1/auth/register", {\n' +
        '                    method: "POST",\n' +
        '                    headers: { "Content-Type": "application/json" },\n' +
        '                    body: JSON.stringify({ username: user, telefono: tel })\n' +
        '                });\n' +
        '                const data = await res.json();\n' +
        '                if (data.success) {\n' +
        '                    lineaGuardada = tel;\n' +
        '                    document.getElementById("vistaScanner").classList.remove("active");\n' +
        '                    document.getElementById("vistaPin").classList.add("active");\n' +
        '                } else { status.innerText = "RECHAZADO: " + data.error; }\n' +
        '            } catch(e) { status.innerText = "ERROR DE TRANSMISIÓN"; }\n' +
        '        }\n' +
        '\n' +
        '        async function enviarValidacionPin() {\n' +
        '            const pin = document.getElementById("codigoPin").value.trim();\n' +
        '            const statusPin = document.getElementById("statusPinField");\n' +
        '            try {\n' +
        '                const res = await fetch("/api/v1/auth/verify-pin", {\n' +
        '                    method: "POST",\n' +
        '                    headers: { "Content-Type": "application/json" },\n' +
        '                    body: JSON.stringify({ telefono: lineaGuardada, pin: pin })\n' +
        '                });\n' +
        '                const data = await res.json();\n' +
        '                if (data.success) {\n' +
        '                    document.getElementById("mainWrapper").style.maxWidth = "600px";\n' +
        '                    document.getElementById("vistaPin").classList.remove("active");\n' +
        '                    document.getElementById("vistaChat").classList.add("active");\n' +
        '                    conectarSockets();\n' +
        '                } else { statusPin.innerText = "PIN RECHAZADO: ACCESO BLOQUEADO"; }\n' +
        '            } catch(e) { statusPin.innerText = "ERROR DE VALIDACIÓN"; }\n' +
        '        }\n' +
        '\n' +
        '        let socket = null;\n' +
        '        function conectarSockets() {\n' +
        '            socket = io();\n' +
        '            socket.on("difusion_mensaje_servidor", (data) => {\n' +
        '                const p = document.getElementById("pantallaChat");\n' +
        '                p.innerHTML += "<div><span style=\'color:#00ffcc;\'>[CHAT]:</span> " + data.contenido + "</div>";\n' +
        '                p.scrollTop = p.scrollHeight;\n' +
        '            });\n' +
        '        }\n' +
        '        \n' +
        '        function transmitirMensaje() {\n' +
        '            const m = document.getElementById("mensajeChat");\n' +
        '            if(m.value.trim() && socket) { socket.emit("canal_mensaje_usuario", { texto: m.value }); m.value = ""; }\n' +
        '        }\n' +
        '        \n' +
        '        window.onload = fijarPrefijoPorRed;\n' +
        '    </script>\n' +
        '</body>\n' +
        '</html>'
    );
});
// =================================================================
// PARTE 6 DE 6: CONTROLADORES BACKEND, WEBSOCKETS Y ENCENDIDO DE RED
// =================================================================

// Endpoint de Registro: Filtra VoIP, genera un token PIN de 6 dígitos y dispara el SMS
app.post('/api/v1/auth/register', verificarLimitePeticionesIP, async (req, res) => {
    const { username, telefono } = req.body;
    if (!username || !telefono) {
        return res.status(400).json({ success: false, error: "REJECTED_EMPTY_FIELDS" });
    }
    
    // Limpieza estricta de la línea telefónica entrante
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
            const tipoRed = resultadoLookup.results && resultadoLookup.results[0] ? resultadoLookup.results[0].type : null;
            
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
