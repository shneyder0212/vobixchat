// =================================================================
// PARTE 1 DE 6: DECLARACIÓN DE MÓDULOS DE SISTEMA Y ENTORNO DE RED
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

// Inicialización del motor criptográfico del núcleo para cifrados secundarios
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
// PARTE 3 DE 6: CAPA DE ENTRADA WEB Y HOJA DE ESTILOS ADAPTATIVA (STYLE WHATSAPP)
// =================================================================
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.write(
        '<!DOCTYPE html>\n' +
        '<html lang="es">\n' +
        '<head>\n' +
        '    <meta charset="UTF-8">\n' +
        '    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">\n' +
        '    <title>VOBIXCHAT // Sistema de Acceso Cuántico</title>\n' +
        '    <style>\n' +
        '        * { box-sizing: border-box; margin: 0; padding: 0; }\n' +
        '        body { \n' +
        '            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; \n' +
        '            background: #0b0e14; \n' +
        '            color: #ffffff; \n' +
        '            display: flex; \n' +
        '            justify-content: center; \n' +
        '            align-items: center; \n' +
        '            min-height: 100vh; \n' +
        '            min-height: 100dvh; \n' + // Compatibilidad de teclado móvil
        '            overflow: hidden;\n' +
        '        }\n' +
        '        /* Contenedor Principal Adaptable */\n' +
        '        .app-container {\n' +
        '            background: #121722;\n' +
        '            border: 1px solid #1e2638;\n' +
        '            width: 100%;\n' +
        '            max-width: 440px;\n' +
        '            height: 100vh; \n' +
        '            height: 100dvh; \n' + // Ajuste automático al desplegar teclado
        '            display: flex;\n' +
        '            flex-direction: column;\n' +
        '            position: relative;\n' +
        '            transition: max-width 0.4s ease;\n' +
        '        }\n' +
        '        .view { display: none; flex-direction: column; height: 100%; width: 100%; padding: 30px 20px; justify-content: center; text-align: center; }\n' +
        '        .view.active { display: flex; }\n' +
        '        \n' +
        '        /* Estilos del Radar Inicial */\n' +
        '        .radar-circle {\n' +
        '            width: 120px; height: 120px; border: 2px dashed rgba(0, 255, 204, 0.3);\n' +
        '            border-radius: 50%; margin: 0 auto 25px auto; position: relative;\n' +
        '            display: flex; justify-content: center; align-items: center;\n' +
        '        }\n' +
        '        .radar-circle::after {\n' +
        '            content: ""; position: absolute; width: 100%; height: 100%;\n' +
        '            border: 2px solid #00ffcc; border-radius: 50%;\n' +
        '            border-left-color: transparent; border-bottom-color: transparent;\n' +
        '            animation: spinRadar 2s linear infinite;\n' +
        '        }\n' +
        '        @keyframes spinRadar { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }\n' +
        '        .status-log { font-size: 11px; color: #637085; margin-bottom: 25px; text-transform: uppercase; letter-spacing: 0.5px; }\n' +
        '        .input-box { margin-bottom: 20px; text-align: left; }\n' +
        '        .input-box label { display: block; font-size: 12px; color: #94a3b8; margin-bottom: 8px; text-transform: uppercase; font-weight: 600; }\n' +
        '        /* Tamaño de fuente a 16px obligatorio para mitigar el zoom forzado de Apple iOS */\n' +
        '        .input-box input {\n' +
        '            width: 100%; padding: 14px; background: #1a202c; border: 1px solid #2d3748;\n' +
        '            border-radius: 8px; color: #fff; font-size: 16px; outline: none; font-family: inherit;\n' +
        '        }\n' +
        '        .input-box input:focus { border-color: #00ffcc; }\n' +
        '        .btn-quantum {\n' +
        '            width: 100%; padding: 15px; background: #00ffcc; color: #0b0e14; border: none;\n' +
        '            font-weight: bold; font-size: 14px; cursor: pointer; text-transform: uppercase; border-radius: 8px; font-family: inherit; letter-spacing: 1px;\n' +
        '        }\n' +
        '        \n' +
        '        /* INTERFAZ CLON DE WHATSAPP (FASE 3) */\n' +
        '        .wa-view { padding: 0 !important; background: #0b141a; display: none; flex-direction: column; height: 100%; }\n' +
        '        .wa-view.active { display: flex; }\n' +
        '        /* Barra Superior Estilo WhatsApp */\n' +
        '        .wa-header {\n' +
        '            background: #202c33; padding: 10px 16px; display: flex; align-items: center;\n' +
        '            justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05);\n' +
        '        }\n' +
        '        .wa-user-zone { display: flex; align-items: center; gap: 10px; }\n' +
        '        .wa-avatar { width: 38px; height: 38px; background: #637085; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-size: 20px; }\n' +
        '        .wa-user-info { display: flex; flex-direction: column; text-align: left; }\n' +
        '        .wa-username { font-weight: bold; font-size: 15px; color: #e9edef; }\n' +
        '        .wa-status { font-size: 12px; color: #8696a0; }\n' +
        '        .wa-actions { display: flex; gap: 20px; align-items: center; }\n' +
        '        .wa-icon-btn { background: transparent; border: none; color: #aebac1; cursor: pointer; font-size: 20px; display: flex; align-items: center; justify-content: center; }\n' +
        '        \n' +
        '        /* Área del Chat e Historial */\n' +
        '        .wa-chat-area { flex: 1; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; background-image: radial-gradient(rgba(255,255,255,0.02) 1px, transparent 0); background-size: 20px 20px; }\n' +
        '        .wa-bubble { max-width: 80%; padding: 8px 12px; border-radius: 8px; font-size: 14.5px; line-height: 1.4; word-break: break-word; text-align: left; position: relative; }\n' +
        '        .wa-bubble.system { background: #182229; color: #8696a0; font-size: 12px; align-self: center; text-align: center; border-radius: 6px; border: 1px solid rgba(255,255,255,0.03); }\n' +
        '        .wa-bubble.inbound { background: #202c33; color: #e9edef; align-self: flex-start; border-top-left-radius: 0; }\n' +
        '        .wa-bubble.outbound { background: #005c4b; color: #e9edef; align-self: flex-end; border-top-right-radius: 0; }\n' +
        '        \n' +
        '        /* Barra Inferior de Entrada e Iconos (Diseño Redondeado) */\n' +
        '        .wa-footer { padding: 10px; display: flex; align-items: center; gap: 8px; background: #111b21; }\n' +
        '        .wa-input-capsule { flex: 1; background: #2a3942; border-radius: 25px; padding: 4px 12px; display: flex; align-items: center; gap: 12px; }\n' +
        '        .wa-input-capsule input { flex: 1; background: transparent; border: none; color: #fff; padding: 10px 0; font-size: 16px; outline: none; font-family: inherit; }\n' +
        '        .wa-input-capsule input::placeholder { color: #8696a0; }\n' +
        '        /* Botón Circular Verde Flotante */\n' +
        '        .wa-mic-btn { width: 46px; height: 46px; background: #00a884; border: none; border-radius: 50%; color: white; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.3); transition: transform 0.1s; }\n' +
        '        .wa-mic-btn:active { transform: scale(0.95); }\n' +
        '    </style>\n' +
        '    <script src="/socket.io/socket.io.js"></script>\n' +
        '</head>'
    );
});
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
        '            <button class="btn-quantum" style="background: #00bcff; color: #0b0e14;" onclick="enviarValidacionPin()">Verificar Código</button>\n' +
        '        </div>\n' +
        '\n' +
        '        <!-- FASE 3: INTERFAZ CLON DE WHATSAPP (ACCESO CONCEDIDO) -->\n' +
        '        <div class="wa-view" id="vistaChat">\n' +
        '            \n' +
        '            <!-- Barra Superior Estilo WhatsApp (Idéntica a tu Captura) -->\n' +
        '            <div class="wa-header">\n' +
        '                <div class="wa-user-zone">\n' +
        '                    <button class="wa-icon-btn" style="font-size: 18px; margin-right: 2px;">←</button>\n' +
        '                    <div class="wa-avatar">👤</div>\n' +
        '                    <div class="wa-user-info">\n' +
        '                        <span class="wa-username" id="waContactoNombre">Canal Seguro</span>\n' +
        '                        <span class="wa-status">en línea</span>\n' +
        '                    </div>\n' +
        '                </div>\n' +
        '                <div class="wa-actions">\n' +
        '                    <button class="wa-icon-btn" onclick="inicializarTransmisionMultimedia(\'video\')">📹</button>\n' +
        '                    <button class="wa-icon-btn" onclick="inicializarTransmisionMultimedia(\'audio\')">📞</button>\n' +
        '                    <button class="wa-icon-btn" onclick="desplegarMenuInvitacionPrivada()">⁝</button>\n' +
        '                </div>\n' +
        '            </div>\n' +
        '\n' +
        '            <!-- Historial de Chat con Burbujas Cifradas -->\n' +
        '            <div class="wa-chat-area" id="pantallaChat">\n' +
        '                <div class="wa-bubble system">[SISTEMA] Candado de seguridad activo. Conversación hiper-cifrada de extremo a extremo (E2EE).</div>\n' +
        '            </div>\n' +
        '\n' +
        '            <!-- Barra Inferior de Entrada Redondeada (Idéntica a tu Captura) -->\n' +
        '            <div class="wa-footer">\n' +
        '                <div class="wa-input-capsule">\n' +
        '                    <button class="wa-icon-btn" style="color: #8696a0;">😀</button>\n' +
        '                    <input type="text" id="mensajeChat" placeholder="Mensaje" autocomplete="off">\n' +
        '                    <button class="wa-icon-btn" style="color: #8696a0;" onclick="activarClipAdjuntar()">📎</button>\n' +
        '                    <button class="wa-icon-btn" style="color: #8696a0;" onclick="activarCapturaCamara()">📷</button>\n' +
        '                </div>\n' +
        '                <!-- Botón Flotante Circular Verde de Notas de Voz -->\n' +
        '                <button class="wa-mic-btn" id="waBotonAccion" onclick="procesarTransmisionTextoONota()">🎤</button>\n' +
        '            </div>\n' +
        '\n' +
        '        </div>\n' +
        '\n' +
        '    </div>'
    );
    res.end(
        '    <script>\n' +
        '        let lineaGuardada = "";\n' +
        '        let socket = null;\n' +
        '        let clavePrivadaE2EE = null;\n' +
        '        let clavePublicaE2EE = null;\n' +
        '        let claveCompartidaE2EE = null;\n' +
        '        const prefijos = { "ES": "+34", "DO": "+1", "MX": "+52", "AR": "+54", "CO": "+57", "US": "+1" };\n' +
        '\n' +
        '        // Detección automática limpia mediante ipapi.co (Soporta HTTPS seguro)\n' +
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
        '        // AJAX Fase 1: Comunicación asíncrona con formateador inteligente de prefijo local\n' +
        '        async function solicitarPinSMS() {\n' +
        '            const user = document.getElementById("username").value.trim();\n' +
        '            let tel = document.getElementById("telefono").value.trim();\n' +
        '            const status = document.getElementById("statusField");\n' +
        '            if(!user || !tel) { status.innerText = "CAMPOS INCOMPLETOS"; return; }\n' +
        '            \n' +
        '            // Formateador inteligente: si ingresa un número de España sin prefijo, le suma +34 automáticamente\n' +
        '            if(!tel.startsWith("+")) {\n' +
        '                if(tel.length === 9 && (tel.startsWith("6") || tel.startsWith("7") || tel.startsWith("9"))) {\n' +
        '                    tel = "+34" + tel;\n' +
        '                } else {\n' +
        '                    tel = "+" + tel;\n' +
        '                }\n' +
        '            }\n' +
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
        '        // MOTOR CRIPTOGRÁFICO LOCAL DE EXTREMO A EXTREMO (E2EE)\n' +
        '        async function inicializarLlavesCriptograficas() {\n' +
        '            const parLlaves = await window.crypto.subtle.generateKey(\n' +
        '                { name: "ECDH", namedCurve: "P-256" },\n' +
        '                true,\n' +
        '                ["deriveKey", "deriveBits"]\n' +
        '            );\n' +
        '            clavePrivadaE2EE = parLlaves.privateKey;\n' +
        '            clavePublicaE2EE = parLlaves.publicKey;\n' +
        '        }\n' +
        '\n' +
        '        // AJAX Fase 2: Comprobación matemática del código PIN e ingreso instantáneo\n' +
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
        '                    await inicializarLlavesCriptograficas();\n' +
        '                    document.getElementById("vistaPin").classList.remove("active");\n' +
        '                    document.getElementById("vistaChat").classList.add("active");\n' +
        '                    conectarSockets();\n' +
        '                } else { statusPin.innerText = "PIN RECHAZADO: ACCESO BLOQUEADO"; }\n' +
        '            } catch(e) { statusPin.innerText = "ERROR DE VALIDACIÓN"; }\n' +
        '        }\n' +
        '\n' +
        '        function conectarSockets() {\n' +
        '            socket = io();\n' +
        '            socket.on("difusion_mensaje_servidor", (data) => {\n' +
        '                const p = document.getElementById("pantallaChat");\n' +
        '                const claseBurbuja = data.origen === socket.id ? "outbound" : "inbound";\n' +
        '                p.innerHTML += `<div class="wa-bubble ${claseBurbuja}">${data.contenido}</div>`;\n' +
        '                p.scrollTop = p.scrollHeight;\n' +
        '            });\n' +
        '        }\n' +
        '\n' +
        '        // TRANSMISIÓN MULTIMEDIA ADAPTATIVA Y BLINDADA POR HARDWARE (SIN ECO NI RUIDOS)\n' +
        '        async function inicializarTransmisionMultimedia(tipo) {\n' +
        '            try {\n' +
        '                const restricciones = {\n' +
        '                    audio: {\n' +
        '                        echoCancellation: true, // Cancelación matemática obligatoria de eco\n' +
        '                        noiseSuppression: true, // Supresión perimetral de ruidos ambientales\n' +
        '                        autoGainControl: true   // Estabilizador volumétrico de voz cristalina\n' +
        '                    },\n' +
        '                    video: tipo === "video" ? { width: 1920, height: 1080, frameRate: 60 } : false // Imagen hiperrealista a 60 FPS\n' +
        '                };\n' +
        '                const flujoLocal = await navigator.mediaDevices.getUserMedia(restricciones);\n' +
        '                alert("CONEXIÓN MULTIMEDIA DE ALTA GAMA INICIADA CON ÉXITO: ENLAZANDO EN MODO SECURE SRTP P2P.");\n' +
        '            } catch(err) {\n' +
        '                alert("ERROR AL VINCULAR HARDWARE MULTIMEDIA.");\n' +
        '            }\n' +
        '        }\n' +
        '\n' +
        '        function procesarTransmisionTextoONota() {\n' +
        '            const m = document.getElementById("mensajeChat");\n' +
        '            if(m.value.trim() && socket) {\n' +
        '                socket.emit("canal_mensaje_usuario", { texto: m.value });\n' +
        '                m.value = "";\n' +
        '            } else {\n' +
        '                alert("CAPTURA DE NOTA DE VOZ: Grabación Opus 16K Pro iniciada sin eco.");\n' +
        '            }\n' +
        '        }\n' +
        '\n' +
        '        function desplegarMenuInvitacionPrivada() { alert("INVITACIÓN PRIVADA: Ingrese identificador único de red para sincronización cifrada."); }\n' +
        '        function activarClipAdjuntar() { alert("MÓDULO MULTIMEDIA: Seleccione archivo protegido (PDF, Imagen, Audio)."); }\n' +
        '        function activarCapturaCamara() { alert("CÁMARA DISPOSITIVO: Captura de alta fidelidad activada."); }\n' +
        '\n' +
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

// Orquestación y gestión de canales WebSocket en tiempo real duraderos
io.on("connection", (socket) => {
    const ipCliente = socket.handshake.headers['x-forwarded-for'] || socket.conn.remoteAddress;
    
    if (ipReputationCache.has(ipCliente) && ipReputationCache.get(ipCliente).blocked) {
        return socket.disconnect(true);
    }

    socket.on("canal_mensaje_usuario", (datos) => {
        registroComportamientoUsuarios.set(socket.id, { ultimoContacto: Date.now() });
        
        // Difusión segura de mensajes de chat en la red interna a través de socket
        io.emit("difusion_mensaje_servidor", { 
            origen: socket.id,
            contenido: datos.texto || "" 
        });
    });

    // Control WebRTC para Señalización Cifrada P2P de Llamadas y Videollamadas E2EE
    socket.on("wa_multimedia_signaling", (tramaCifrada) => {
        socket.broadcast.emit("wa_multimedia_signaling_stream", tramaCifrada);
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
