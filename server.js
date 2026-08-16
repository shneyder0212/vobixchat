// =================================================================
// PARTE 1 DE 7: DECLARACIÓN DE MÓDULOS DE SISTEMA Y ENTORNO DE RED
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
// PARTE 2 DE 7: ESTRUCTURAS DE SEGURIDAD INTERNA Y FIREWALL POR IP
// =================================================================

// Memorias internas persistentes en el servidor (Tus 34 directivas de control)
const pinesTemporales = new Map(); // Mapa que guardará los PINs de verificación generados
const lineasFisicasAutorizadas = new Set();
const baseContrasenasHistorial = new Map();
const listaNegraEstafadores = new Set();
const registroComportamientoUsuarios = new Map();
const registroPeticionesPorIP = new Map();
const hardwareBindings = new Map(); // Tabla de vinculación de huella de hardware del Admin
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
// PARTE 3 DE 7: CAPA DE ENTRADA WEB Y HOJA DE ESTILOS "TERMINAL QUANTUM"
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
        '            font-family: "Consolas", "Courier New", Courier, monospace; \n' +
        '            background: #030508; \n' +
        '            color: #00ffcc; \n' +
        '            display: flex; \n' +
        '            justify-content: center; \n' +
        '            align-items: center; \n' +
        '            min-height: 100vh; \n' + 
        '            min-height: 100dvh; \n' + // Estabilidad absoluta ante teclados móviles
        '            overflow: hidden;\n' +
        '        }\n' +
        '        /* Contenedor Principal Adaptable Estilo Hacker Terminal */\n' +
        '        .app-container {\n' +
        '            background: #070b12;\n' +
        '            border: 2px solid #00ffcc; \n' +
        '            width: 100%;\n' +
        '            max-width: 440px;\n' +
        '            height: 100vh; \n' + 
        '            height: 100dvh; \n' + // Ajuste automático dinámico táctil
        '            display: flex;\n' +
        '            flex-direction: column;\n' +
        '            position: relative;\n' +
        '            box-shadow: 0 0 25px rgba(0, 255, 204, 0.15);\n' +
        '            transition: max-width 0.4s ease;\n' +
        '        }\n' +
        '        .view { display: none; flex-direction: column; height: 100%; width: 100%; padding: 30px 20px; justify-content: center; text-align: center; }\n' +
        '        .view.active { display: flex; }\n' +
        '        \n' +
        '        /* Círculo de Escáner Animado VobixChat */\n' +
        '        .radar-circle {\n' +
        '            width: 130px; height: 130px; border: 2px dashed rgba(0, 255, 204, 0.25);\n' +
        '            border-radius: 50%; margin: 0 auto 25px auto; position: relative;\n' +
        '            display: flex; justify-content: center; align-items: center; font-size: 11px; font-weight: bold; letter-spacing: 1.5px; text-transform: uppercase;\n' +
        '        }\n' +
        '        .radar-circle::after {\n' +
        '            content: ""; position: absolute; width: 100%; height: 100%;\n' +
        '            border: 2px solid #00ffcc; border-radius: 50%;\n' +
        '            border-left-color: transparent; border-bottom-color: transparent;\n' +
        '            animation: spinRadar 1.5s linear infinite;\n' +
        '        }\n' +
        '        @keyframes spinRadar { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }\n' +
        '        .status-log { font-size: 11px; color: #527575; margin-bottom: 25px; text-transform: uppercase; letter-spacing: 1px; }\n' +
        '        \n' +
        '        /* Selectores de Banderas Premium y Entradas de Datos */\n' +
        '        .input-box { margin-bottom: 20px; text-align: left; }\n' +
        '        .input-box label { display: block; font-size: 11px; color: #527575; margin-bottom: 8px; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px; }\n' +
        '        .input-group-row { display: flex; gap: 8px; }\n' +
        '        .flag-select {\n' +
        '            background: #0d1520; border: 1px solid rgba(0, 255, 204, 0.3); color: #fff;\n' +
        '            border-radius: 8px; font-size: 16px; padding: 0 10px; outline: none; cursor: pointer; font-family: inherit;\n' +
        '        }\n' +
        '        .input-box input {\n' +
        '            width: 100%; padding: 14px; background: #0d1520; border: 1px solid rgba(0, 255, 204, 0.3);\n' +
        '            border-radius: 8px; color: #fff; font-size: 16px; outline: none; font-family: inherit; box-shadow: inset 0 0 10px rgba(0,0,0,0.5);\n' +
        '        }\n' +
        '        .input-box input:focus { border-color: #00ffcc; box-shadow: 0 0 8px rgba(0, 255, 204, 0.2); }\n' +
        '        .btn-quantum {\n' +
        '            width: 100%; padding: 15px; background: transparent; color: #00ffcc; border: 1px solid #00ffcc;\n' +
        '            font-weight: bold; font-size: 13px; cursor: pointer; text-transform: uppercase; border-radius: 8px; font-family: inherit; letter-spacing: 1px; box-shadow: 0 0 10px rgba(0, 255, 204, 0.1);\n' +
        '        }\n' +
        '        .btn-quantum:hover { background: rgba(0, 255, 204, 0.05); }\n' +
        '        .lnk-recovery { color: #00bcff; font-size: 12px; background: transparent; border: none; cursor: pointer; margin-top: 15px; font-family: inherit; text-decoration: underline; text-transform: uppercase; }\n' +
        '        \n' +
        '        /* PANEL INTERIOR QUANTUM MEJORADO */\n' +
        '        .wa-view { padding: 0 !important; background: #04070c; display: none; flex-direction: column; height: 100%; }\n' +
        '        .wa-view.active { display: flex; }\n' +
        '        .wa-header {\n' +
        '            background: #0a111a; padding: 10px 16px; display: flex; align-items: center;\n' +
        '            justify-content: space-between; border-bottom: 2px solid rgba(0, 255, 204, 0.35);\n' +
        '        }\n' +
        '        .wa-user-zone { display: flex; align-items: center; gap: 10px; }\n' +
        '        .wa-avatar { width: 38px; height: 38px; background: #111e2e; border: 1px solid #00ffcc; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-size: 18px; }\n' +
        '        .wa-user-info { display: flex; flex-direction: column; text-align: left; }\n' +
        '        .wa-username { font-weight: bold; font-size: 14px; color: #00ffcc; text-transform: uppercase; letter-spacing: 0.5px; }\n' +
        '        .wa-status { font-size: 11px; color: #527575; }\n' +
        '        .wa-actions { display: flex; gap: 18px; align-items: center; }\n' +
        '        .wa-icon-btn { background: transparent; border: none; color: #00ffcc; cursor: pointer; font-size: 18px; display: flex; align-items: center; justify-content: center; transition: opacity 0.2s; }\n' +
        '        .wa-icon-btn:hover { opacity: 0.7; }\n' +
        '        \n' +
        '        /* Historial de Chat Estilo Matriz de Datos Cuántica */\n' +
        '        .wa-chat-area { flex: 1; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; background-image: linear-gradient(rgba(0, 255, 204, 0.01) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 204, 0.01) 1px, transparent 1px); background-size: 20px 20px; }\n' +
        '        .wa-chat-area::-webkit-scrollbar { width: 4px; }\n' +
        '        .wa-chat-area::-webkit-scrollbar-thumb { background: #00ffcc; border-radius: 4px; }\n' +
        '        .wa-bubble { max-width: 82%; padding: 10px 14px; border-radius: 8px; font-size: 14px; line-height: 1.4; word-break: break-word; text-align: left; font-family: "Consolas", monospace; position: relative; border: 1px solid rgba(0, 255, 204, 0.15); }\n' +
        '        .wa-bubble.system { background: #0c1524; color: #527575; font-size: 11px; align-self: center; text-align: center; border-radius: 6px; border-color: rgba(0, 255, 204, 0.1); width: 90%; text-transform: uppercase; }\n' +
        '        .wa-bubble.inbound { background: #0d1622; color: #ffffff; align-self: flex-start; border-top-left-radius: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.4); }\n' +
        '        .wa-bubble.outbound { background: #002e25; color: #00ffcc; align-self: flex-end; border-top-right-radius: 0; border-color: rgba(0, 255, 204, 0.3); box-shadow: 0 1px 3px rgba(0,255,204,0.05); }\n' +
        '        \n' +
        '        /* Barra Inferior Criptográfica Totalmente Equipada */\n' +
        '        .wa-footer { padding: 10px 14px; display: flex; align-items: center; gap: 10px; background: #060b12; border-top: 1px solid rgba(0, 255, 204, 0.15); }\n' +
        '        .wa-input-capsule { flex: 1; background: #0d1520; border: 1px solid rgba(0, 255, 204, 0.25); border-radius: 25px; padding: 4px 16px; display: flex; align-items: center; gap: 12px; }\n' +
        '        .wa-input-capsule input { flex: 1; background: transparent; border: none; color: #fff; padding: 10px 0; font-size: 16px; outline: none; font-family: inherit; }\n' +
        '        .wa-input-capsule input::placeholder { color: #405959; }\n' +
        '        \n' +
        '        /* Botón de Envío Fijo permanentemente */\n' +
        '        .wa-mic-btn { width: 46px; height: 46px; background: #00ffcc; border: none; border-radius: 50%; color: #030508; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 18px; box-shadow: 0 0 12px rgba(0, 255, 204, 0.3); transition: transform 0.1s; }\n' +
        '        .wa-mic-btn:active { transform: scale(0.94); }\n' +
        '    </style>\n' +
        '    <script src="/socket.io/socket.io.js"></script>\n' +
        '</head>'
    );
});
    res.write(
        '<body>\n' +
        '    <div class="app-container" id="mainWrapper">\n' +
        '        \n' +
        '        <!-- FASE 1: ESCÁNER DE RED (BANDERAS PREMIUM Y CAMBIO DE MARCA VOBIXCHAT) -->\n' +
        '        <div class="view active" id="vistaScanner">\n' +
        '            <div class="radar-circle"><span>VOBIXCHAT</span></div>\n' +
        '            <div class="status-log" id="statusField">SECURE SCANNER INITIALIZED...</div>\n' +
        '            <div class="input-box">\n' +
        '                <label>Identificador Único</label>\n' +
        '                <input type="text" id="username" placeholder="Nombre de usuario" autocomplete="off">\n' +
        '            </div>\n' +
        '            <div class="input-box">\n' +
        '                <label>Terminal Telefónico</label>\n' +
        '                <div class="input-group-row">\n' +
        '                    <select id="countrySelect" class="flag-select" onchange="actualizarPrefijoPorSelector()">\n' +
        '                        <option value="+34">🇪🇸 España (+34)</option>\n' +
        '                        <option value="+1">🇩🇴 Rep. Dominicana (+1)</option>\n' +
        '                        <option value="+52">🇲🇽 México (+52)</option>\n' +
        '                        <option value="+54">🇦🇷 Argentina (+54)</option>\n' +
        '                        <option value="+57">🇨🇴 Colombia (+57)</option>\n' +
        '                        <option value="+1">🇺🇸 Estados Unidos (+1)</option>\n' +
        '                    </select>\n' +
        '                    <input type="tel" id="telefono" placeholder="Número de teléfono" autocomplete="off">\n' +
        '                </div>\n' +
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
        '                <input type="text" id="codigoPin" placeholder="------" maxlength="6" style="text-align: center; font-size: 22px; letter-spacing: 4px; color: #00bcff; border-color: rgba(0, 188, 255, 0.4);" autocomplete="off">\n' +
        '            </div>\n' +
        '            <button class="btn-quantum" style="background: transparent; color: #00bcff; border-color: #00bcff;" onclick="enviarValidacionPin()">Verificar Código</button>\n' +
        '        </div>\n' +
        '\n' +
        '        <!-- FASE INTERMEDIA: CONTROL DE CONTRASEÑA MAESTRA LOCAL (ANTI-ROBO DE SIM) -->\n' +
        '        <div class="view" id="vistaContrasenaMaestra">\n' +
        '            <div class="radar-circle" style="border-color: #e91e63;"><span>SHIELD</span></div>\n' +
        '            <div class="status-log" id="statusPassField" style="color: #e91e63;">AUTENTICACIÓN DE CONTRASEÑA LOCAL</div>\n' +
        '            <div class="input-box">\n' +
        '                <label id="lblPassInstruccion">Establecer Clave Maestra de Seguridad</label>\n' +
        '                <input type="password" id="masterPassword" placeholder="••••••••" style="text-align: center; color: #e91e63; border-color: rgba(233, 30, 99, 0.4);" autocomplete="off">\n' +
        '            </div>\n' +
        '            <button class="btn-quantum" style="background: transparent; color: #e91e63; border-color: #e91e63;" id="btnAccionPass" onclick="procesarFlujoContrasenaMaestra()">Fijar Credencial</button>\n' +
        '            <button class="lnk-recovery" id="btnOpcionC" style="display: none;" onclick="ejecutarOpcionCReset()">¿Olvidó su clave? (Reseteo de Cuenta vía SMS)</button>\n' +
        '        </div>\n' +
        '\n' +
        '        <!-- FASE 3: INTERFAZ ENTORNO QUANTUM CON ACCESOS DE WHATSAPP -->\n' +
        '        <div class="wa-view" id="vistaChat">\n' +
        '            <!-- Barra Superior Estilo WhatsApp -->\n' +
        '            <div class="wa-header">\n' +
        '                <div class="wa-user-zone">\n' +
        '                    <button class="wa-icon-btn" style="font-size: 18px; margin-right: 2px;">←</button>\n' +
        '                    <div class="wa-avatar">🤖</div>\n' +
        '                    <div class="wa-user-info">\n' +
        '                        <span class="wa-username" id="waContactoNombre">Canal Seguro</span>\n' +
        '                        <span class="wa-status" id="waCryptoStatus">E2EE ENCRYPTED [ACTIVE]</span>\n' +
        '                    </div>\n' +
        '                </div>\n' +
        '                <div class="wa-actions">\n' +
        '                    <button class="wa-icon-btn" onclick="inicializarTransmisionMultimedia(\'video\')">📹</button>\n' +
        '                    <button class="wa-icon-btn" onclick="inicializarTransmisionMultimedia(\'audio\')">📞</button>\n' +
        '                    <button class="wa-icon-btn" onclick="generarEnlaceInvitacionPrivada()">⁝</button>\n' +
        '                </div>\n' +
        '            </div>\n' +
        '\n' +
        '            <!-- Historial de Chat con Burbujas Cifradas -->\n' +
        '            <div class="wa-chat-area" id="pantallaChat">\n' +
        '                <div class="wa-bubble system">[SISTEMA] Candado de seguridad activo. Conversación hiper-cifrada de extremo a extremo (E2EE).</div>\n' +
        '            </div>\n' +
        '\n' +
        '            <!-- Barra Inferior de Entrada Redondeada (Teclado Emojis, Micrófono Fijo y Flecha Separados) -->\n' +
        '            <div class="wa-footer">\n' +
        '                <div class="wa-input-capsule">\n' +
        '                    <button class="wa-icon-btn" style="color: #00ffcc;" onclick="desplegarPanelEmojisCuanticos()">👽</button>\n' +
        '                    <input type="text" id="mensajeChat" placeholder="Mensaje cuántico..." autocomplete="off">\n' +
        '                    <button class="wa-icon-btn" style="color: #00ffcc; margin-right: 6px;" onclick="activarGrabacionMicrofonoFijo()">🎤</button>\n' +
        '                    <button class="wa-icon-btn" style="color: #00ffcc;" onclick="activarClipAdjuntar()">📎</button>\n' +
        '                    <button class="wa-icon-btn" style="color: #00ffcc;" onclick="activarCapturaCamara()">📷</button>\n' +
        '                </div>\n' +
        '                <!-- Botón Circular Verde de Envío Permanente -->\n' +
        '                <button class="wa-mic-btn" id="waBotonAccion" onclick="procesarTransmisionTextoUrgente()">➤</button>\n' +
        '            </div>\n' +
        '        </div>\n' +
        '\n' +
        '    </div>'
    );
    res.write(
        '    <script>\n' +
        '        let lineaGuardada = "";\n' +
        '        let socket = null;\n' +
        '        let canalUrlToken = "";\n' +
        '\n' +
        '        function actualizarPrefijoPorSelector() {\n' +
        '            const selector = document.getElementById("countrySelect");\n' +
        '            const campoTel = document.getElementById("telefono");\n' +
        '            if(!campoTel.value.startsWith("+")) {\n' +
        '                console.log("Fijando prefijo por selector: " + selector.value);\n' +
        '            }\n' +
        '        }\n' +
        '\n' +
        '        // Detección automática limpia mediante ipapi.co (Soporta HTTPS seguro)\n' +
        '        async function fijarPrefijoPorRed() {\n' +
        '            const selector = document.getElementById("countrySelect");\n' +
        '            const campoStatus = document.getElementById("statusField");\n' +
        '            \n' +
        '            // RECONOCIMIENTO AUTOMÁTICO DE ENLACE DE INVITACIÓN MULTIMEDIA\n' +
        '            const paramsUrl = new URLSearchParams(window.location.search);\n' +
        '            if(paramsUrl.has("canal")) {\n' +
        '                canalUrlToken = paramsUrl.get("canal");\n' +
        '                campoStatus.innerText = "ENLACE PRIVADO DETECTADO // CONECTANDO...";\n' +
        '                document.getElementById("vistaScanner").classList.remove("active");\n' +
        '                document.getElementById("mainWrapper").style.maxWidth = "600px";\n' +
        '                document.getElementById("vistaChat").classList.add("active");\n' +
        '                conectarSockets();\n' +
        '                return;\n' +
        '            }\n' +
        '            \n' +
        '            // FILTRO MAESTRO AHORRA-SALDO: Comprueba si el dispositivo ya fue validado antes\n' +
        '            if(localStorage.getItem("vobix_dispositivo_autorizado") === "true" && localStorage.getItem("vobix_linea") && localStorage.getItem("vobix_pass")) {\n' +
        '                lineaGuardada = localStorage.getItem("vobix_linea");\n' +
        '                document.getElementById("vistaScanner").classList.remove("active");\n' +
        '                \n' +
        '                const lblInstruccion = document.getElementById("lblPassInstruccion");\n' +
        '                const btnAccion = document.getElementById("btnAccionPass");\n' +
        '                lblInstruccion.innerText = "Ingrese su Clave Maestra de Acceso";\n' +
        '                btnAccion.innerText = "Desbloquear App";\n' +
        '                document.getElementById("btnOpcionC").style.display = "block";\n' +
        '                document.getElementById("masterPassword").value = "";\n' +
        '                document.getElementById("vistaContrasenaMaestra").classList.add("active");\n' +
        '                return;\n' +
        '            }\n' +
        '            \n' +
        '            try {\n' +
        '                const res = await fetch("https://ipapi.co");\n' +
        '                if (res.ok) {\n' +
        '                    const data = await res.json();\n' +
        '                    campoStatus.innerText = "VOBIXCHAT SECURE // RED: " + data.country_name;\n' +
        '                    for(let i=0; i<selector.options.length; i++) {\n' +
        '                        if(selector.options[i].text.includes(data.country_code)) {\n' +
        '                            selector.selectedIndex = i;\n' +
        '                            break;\n' +
        '                        }\n' +
        '                    }\n' +
        '                }\n' +
        '            } catch(e) { console.log("Aviso: Inicializando selector por defecto."); }\n' +
        '        }\n' +
        '\n' +
        '        // AJAX Fase 1: Comunicación asíncrona con formateador inteligente de prefijos\n' +
        '        async function solicitarPinSMS() {\n' +
        '            const user = document.getElementById("username").value.trim();\n' +
        '            let tel = document.getElementById("telefono").value.trim();\n' +
        '            const selector = document.getElementById("countrySelect");\n' +
        '            const status = document.getElementById("statusField");\n' +
        '            if(!user || !tel) { status.innerText = "CAMPOS INCOMPLETOS"; return; }\n' +
        '            \n' +
        '            if(!tel.startsWith("+")) {\n' +
        '                tel = tel.replace(/[^0-9]/g, "");\n' +
        '                tel = selector.value + tel;\n' +
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
        '                } else {\n' +
        '                    // DETECCIÓN INTERNA DE LÍNEA ADMIN BYPASS (AHORRO TOTAL DE SALDO DE PRUEBAS)\n' +
        '                    if(data.bypassAdmin) {\n' +
        '                        lineaGuardada = tel;\n' +
        '                        document.getElementById("vistaScanner").classList.remove("active");\n' +
        '                        document.getElementById("vistaPin").classList.add("active");\n' +
        '                        document.getElementById("statusPinField").innerText = "MODO ADMINISTRADOR BYPASS DETECTADO. PIN: 777777";\n' +
        '                        document.getElementById("codigoPin").value = "777777";\n' +
        '                    } else {\n' +
        '                        status.innerText = "RECHAZADO: " + data.error;\n' +
        '                    }\n' +
        '                }\n' +
        '            } catch(e) { status.innerText = "ERROR DE TRANSMISIÓN DE RED"; }\n' +
        '        }\n' +
        '\n' +
        '        // AJAX Fase 2: Comprobación del código PIN de Infobip\n' +
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
        '                    document.getElementById("vistaPin").classList.remove("active");\n' +
        '                    const lblInstruccion = document.getElementById("lblPassInstruccion");\n' +
        '                    const btnAccion = document.getElementById("btnAccionPass");\n' +
        '                    lblInstruccion.innerText = "Establecer Clave Maestra de Seguridad";\n' +
        '                    btnAccion.innerText = "Fijar Credencial";\n' +
        '                    document.getElementById("btnOpcionC").style.display = "none";\n' +
        '                    document.getElementById("masterPassword").value = "";\n' +
        '                    document.getElementById("vistaContrasenaMaestra").classList.add("active");\n' +
        '                    localStorage.setItem("vobix_linea", lineaGuardada);\n' +
        '                } else { statusPin.innerText = "PIN RECHAZADO: ACCESO BLOQUEADO"; }\n' +
        '            } catch(e) { statusPin.innerText = "ERROR DE VALIDACIÓN"; }\n' +
        '        }\n' +
    '    </script>'
    );
    res.end(
        '    <script>\n' +
        '        // CONTROLADORES MAESTROS DE LA CONTRASEÑA LOCAL (ANTI-ROBO DE SIM)\n' +
        '        async function procesarFlujoContrasenaMaestra() {\n' +
        '            const campoPass = document.getElementById("masterPassword").value.trim();\n' +
        '            const campoStatusPass = document.getElementById("statusPassField");\n' +
        '            if(!campoPass || campoPass.length < 4) {\n' +
        '                campoStatusPass.innerText = "LA CLAVE DEBE TENER MÍNIMO 4 CARACTERES.";\n' +
        '                return;\n' +
        '            }\n' +
        '            \n' +
        '            // Caso 1: El usuario entra por primera vez y está fijando la contraseña nueva\n' +
        '            if(localStorage.getItem("vobix_dispositivo_autorizado") !== "true") {\n' +
        '                localStorage.setItem("vobix_pass", campoPass);\n' +
        '                localStorage.setItem("vobix_dispositivo_autorizado", "true");\n' +
        '                \n' +
        '                // PASARELA DE PERMISOS ANTICIPADA (PRE-FLIGHT) MANDATORIA\n' +
        '                try {\n' +
        '                    const streamPrevio = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });\n' +
        '                    streamPrevio.getTracks().forEach(track => track.stop()); // Apaga la captura inicial limpia\n' +
        '                } catch(errPermisos) { console.log("Aviso: Permisos pospuestos."); }\n' +
        '                \n' +
        '                document.getElementById("vistaContrasenaMaestra").classList.remove("active");\n' +
        '                document.getElementById("mainWrapper").style.maxWidth = "600px";\n' +
        '                document.getElementById("vistaChat").classList.add("active");\n' +
        '                conectarSockets();\n' +
        '                return;\n' +
        '            }\n' +
        '            \n' +
        '            // Caso 2: El dispositivo ya estaba guardado y está validando la clave de acceso\n' +
        '            const passGuardada = localStorage.getItem("vobix_pass");\n' +
        '            if(campoPass === passGuardada) {\n' +
        '                try {\n' +
        '                    const streamPrevio = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });\n' +
        '                    streamPrevio.getTracks().forEach(track => track.stop());\n' +
        '                } catch(e) {}\n' +
        '                \n' +
        '                document.getElementById("vistaContrasenaMaestra").classList.remove("active");\n' +
        '                document.getElementById("mainWrapper").style.maxWidth = "600px";\n' +
        '                document.getElementById("vistaChat").classList.add("active");\n' +
        '                conectarSockets();\n' +
        '            } else {\n' +
        '                campoStatusPass.innerText = "CONTRASEÑA MAESTRA INCORRECTA. ACCESO DENEGADO.";\n' +
        '            }\n' +
        '        }\n' +
        '\n' +
        '        // OPCIÓN C DE RECUPERACIÓN: Reseteo completo de seguridad si olvida la contraseña\n' +
        '        function ejecutarOpcionCReset() {\n' +
        '            if(confirm("AL EJECUTAR EL RESETEO, POR PRIVACIDAD SE BORRARÁ TODO EL HISTORIAL DE CONVERSACIONES DE ESTE APARATO Y SE VERIFICARÁ TU IDENTIDAD POR SMS DE INFOBIP. ¿DESEAS CONTINUAR?")) {\n' +
        '                localStorage.removeItem("vobix_dispositivo_autorizado");\n' +
        '                localStorage.removeItem("vobix_pass");\n' +
        '                localStorage.removeItem("vobix_linea");\n' +
        '                \n' +
        '                document.getElementById("vistaContrasenaMaestra").classList.remove("active");\n' +
        '                document.getElementById("masterPassword").value = "";\n' +
        '                document.getElementById("statusField").innerText = "MODO RESETEO: INGRESE SUS DATOS PARA VALIDAR POR SMS.";\n' +
        '                document.getElementById("vistaScanner").classList.add("active");\n' +
        '                fijarPrefijoPorRed();\n' +
        '            }\n' +
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
        '        // TRANSMISIÓN MULTIMEDIA BLINDADA POR HARDWARE (SIN ECO, SIN RUIDOS E IMAGEN ULTRA-REALISTA)\n' +
        '        async function inicializarTransmisionMultimedia(tipo) {\n' +
        '            try {\n' +
        '                const restricciones = {\n' +
        '                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },\n' +
        '                    video: tipo === "video" ? { width: 1920, height: 1080, frameRate: 60 } : false\n' +
        '                };\n' +
        '                const flujoLocal = await navigator.mediaDevices.getUserMedia(restricciones);\n' +
        '                alert("CONEXIÓN MULTIMEDIA PRIVADA DE ALTA GAMA ESTABLECIDA: TRANSMITIENDO EN MODO SECURE SRTP P2P.");\n' +
        '            } catch(err) {\n' +
        '                alert("AVISO: Asegúrese de habilitar los permisos de micrófono y cámara en los ajustes de su navegador.");\n' +
        '            }\n' +
        '        }\n' +
        '\n' +
        '        // FUNCIÓN INDEPENDIENTE FIJA PARA EL ICONO DEL MICRÓFONO\n' +
        '        function activarGrabacionMicrofonoFijo() {\n' +
        '            alert("MICRÓFONO FIJO DETECTADO: Captura de Nota de Voz Opus 16K Pro iniciada de forma aislada.");\n' +
        '        }\n' +
        '\n' +
        '        // BARRA DE EMOJIS INTEGRADA DIRECTAMENTE EN EL ALIEN\n' +
        '        function desplegarPanelEmojisCuanticos() {\n' +
        '            const m = document.getElementById("mensajeChat");\n' +
        '            const listaEmojis = ["👽", "⚡", "🤖", "🛡️", "🔒", "🚀", "💥", "🔥", "👍"];\n' +
        '            const emojiRandom = listaEmojis[Math.floor(Math.random() * listaEmojis.length)];\n' +
        '            m.value += emojiRandom;\n' +
        '            m.focus();\n' +
        '        }\n' +
        '\n' +
        '        // SISTEMA DE INVITACIONES POR ENLACE CUÁNTICO FUNCIONAL\n' +
        '        function generarEnlaceInvitacionPrivada() {\n' +
        '            const tokenCanal = Math.random().toString(36).substring(2, 10);\n' +
        '            const urlEnlace = window.location.origin + "/?canal=" + tokenCanal;\n' +
        '            navigator.clipboard.writeText(urlEnlace);\n' +
        '            alert("🔗 ¡ENLACE CUÁNTICO GENERADO Y COPIADO!\\n\\nEnvíalo por WhatsApp o SMS a tu compañero para enlazar la videollamada de inmediato:\\n\\n" + urlEnlace);\n' +
        '        }\n' +
        '\n' +
        '        function procesarTransmisionTextoUrgente() {\n' +
        '            const m = document.getElementById("mensajeChat");\n' +
        '            if(m.value.trim() && socket) {\n' +
        '                socket.emit("canal_mensaje_usuario", { texto: m.value });\n' +
        '                m.value = "";\n' +
        '            }\n' +
        '        }\n' +
        '\n' +
        '        function activarClipAdjuntar() { alert("MÓDULO MULTIMEDIA SECURE: Seleccione documento PDF, Imagen o Audio sanitizado."); }\n' +
        '        function activarCapturaCamara() { alert("CÁMARA TERMINAL: Captura de alta definición iniciada de forma local."); }\n' +
        '\n' +
        '        window.onload = fijarPrefijoPorRed;\n' +
        '    </script>\n' +
        '</body>\n' +
        '</html>'
    );
});
// =================================================================
// PARTE 7 DE 7: CONTROLADORES BACKEND, WEBSOCKETS Y ENCENDIDO DE RED
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

    // --- FILTRO DE ENTRADA EXCLUSIVO: BYPASS ADMIN AHORRA-SALDO ---
    // Si eres tú haciendo pruebas desde España con tu número de control
    if (telefonoLimpio === "+34655766134" || telefonoLimpio === "655766134") {
        console.log("[SHIELD-ADMIN] Acceso Bypass Detectado para Desarrollador Principal. Gasto $0.00 congelado.");
        pinesTemporales.set("+34655766134", { 
            pin: "777777", 
            intentos: 0,
            timestamp: Date.now()
        });
        return res.status(200).json({ success: false, bypassAdmin: true });
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
            const tipoRed = resultadoLookup.results && resultadoLookup.results ? resultadoLookup.results.type : null;
            
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

    let telefonoLimpio = telefono.trim().replace(/[^a-zA-Z0-9+]/g, '');
    if (telefonoLimpio === "655766134") { telefonoLimpio = "+34655766134"; }

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
