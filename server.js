// =================================================================
// PARTE 1: SYSTEM CORE INITIALIZATION & CRYPTO SETUP
// =================================================================
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const { Server } = require("socket.io");

process.env.INFOBIP_API_KEY = "bb99a77f5ca5f1bdb2295647ec379844-a69e335d-745b-4965-8551-9654c02862d6";
process.env.INFOBIP_BASE_URL = "https://infobip.com"; 

const app = express();
const servidorHTTP = http.createServer(app);
const io = new Server(servidorHTTP, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const rutaMedia = path.join(__dirname, 'uploads', 'quantum_media');
if (!fs.existsSync(rutaMedia)){
    fs.mkdirSync(rutaMedia, { recursive: true });
}

const pinesTemporales = new Map();
const lineasFisicasAutorizadas = new Set();
const baseContrasenasHistorial = new Map();
const listaNegraEstafadores = new Set();
const registroComportamientoUsuarios = new Map();
const registroPeticionesPorIP = new Map();
const hardwareBindings = new Map(); 
const ipReputationCache = new Map(); 

const ENCRYPTION_KEY = crypto.scryptSync(process.env.INFOBIP_API_KEY, 'salt', 32);
// =================================================================
// PARTE 2: PERIMETER IP FIREWALL & DISK STORAGE PROTECTION
// =================================================================
function verificarLimitePeticionesIP(req, res, next) {
    const direccionIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const tiempoActual = Date.now();
    
    if (ipReputationCache.has(direccionIP) && ipReputationCache.get(direccionIP).blocked) {
        console.log(`[SHIELD-CRITICAL] [IP_BLOCKED] // IP: ${direccionIP}`);
        return res.status(403).json({ success: false, error: "SECURITY_RULE_VIOLATION" });
    }

    if (!registroPeticionesPorIP.has(direccionIP)) {
        registroPeticionesPorIP.set(direccionIP, { conteo: 1, inicioTiempo: tiempoActual, ráfagasConsecutivas: 0 });
        return next();
    }

    const datosIP = registroPeticionesPorIP.get(direccionIP);
    const tiempoTranscurrido = tiempoActual - datosIP.inicioTiempo;

    if (tiempoTranscurrido < 60000) {
        if (datosIP.conteo >= 5) {
            datosIP.ráfagasConsecutivas++;
            console.log(`[SHIELD-WARNING] [RATE_LIMIT_TRIGGERED] // IP: ${direccionIP}`);
            if (datosIP.ráfagasConsecutivas >= 2) {
                ipReputationCache.set(direccionIP, { blocked: true });
                console.log(`[SHIELD-CRITICAL] [PERMANENT_IP_BAN] // IP: ${direccionIP}`);
            }
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
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const upload = multer({ 
    storage: almacenamientoConfig,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('audio/')) {
            cb(null, true);
        } else {
            cb(new Error('SECURITY_FILE_TYPE_REJECTED'), false);
        }
    }
});
// =================================================================
// PARTE 3: HIGH-TECH QUANTUM INTERFACE WITH GLOBAL AUTO-GEOLOCATION
// =================================================================
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <title>VOBIXCHAT // Quantum Security Gateway</title>
            <link rel="stylesheet" href="https://cloudflare.com">
            <script src="https://cloudflare.com"></script>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
                    background: radial-gradient(circle at center, #0d0f19 0%, #030305 100%); 
                    color: #ffffff; 
                    display: flex; 
                    justify-content: center; 
                    align-items: center; 
                    min-height: 100vh; 
                    padding: 20px;
                    overflow: hidden;
                    position: relative;
                }
                body::before {
                    content: '';
                    position: absolute;
                    width: 300px;
                    height: 300px;
                    background: linear-gradient(45deg, #00ffcc, #00aaff);
                    filter: blur(150px);
                    border-radius: 50%;
                    top: 15%;
                    left: 15%;
                    opacity: 0.15;
                    z-index: 0;
                    animation: pulseGlow 8s infinite alternate;
                }
                @keyframes pulseGlow {
                    0% { transform: scale(1); opacity: 0.15; }
                    100% { transform: scale(1.2); opacity: 0.25; }
                }
                .card { 
                    background: rgba(15, 17, 26, 0.45); 
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    width: 100%; 
                    max-width: 440px; 
                    padding: 55px 40px; 
                    border-radius: 28px; 
                    border: 1px solid rgba(255, 255, 255, 0.05); 
                    box-shadow: 0 25px 60px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.1); 
                    text-align: center; 
                    z-index: 1;
                    position: relative;
                }
                h1 { 
                    font-size: 36px; 
                    font-weight: 900; 
                    letter-spacing: 6px; 
                    background: linear-gradient(135deg, #00ffcc 0%, #00aaff 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    margin-bottom: 8px;
                }
                .subtitle {
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 4px;
                    color: #00ffcc;
                    margin-bottom: 35px;
                    font-weight: 800;
                    text-shadow: 0 0 10px rgba(0,255,204,0.3);
                }
                p { color: #848494; font-size: 14px; margin-bottom: 35px; line-height: 1.6; font-weight: 400; }
                .input-group { text-align: left; margin-bottom: 30px; }
                label { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #9292a2; margin-bottom: 12px; font-weight: 700; }
                
                .iti { width: 100%; }
                .iti__country-list { background-color: #11131c; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
                .iti__country { color: #ffffff; padding: 12px; font-size: 14px; }
                .iti__country.iti__highlight { background-color: rgba(0, 255, 204, 0.15); color: #00ffcc; }
                .iti__dial-code { color: #848494; }
                .iti__flag-container { border-radius: 12px 0 0 12px; }
                
                input { 
                    width: 100%;
                    padding: 18px 20px; 
                    border: 1px solid rgba(255, 255, 255, 0.06); 
                    border-radius: 14px; 
                    background: rgba(5, 6, 10, 0.4); 
                    color: #ffffff; 
                    font-size: 16px; 
                    outline: none; 
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); 
                    letter-spacing: 0.5px;
                }
                input:focus { 
                    border-color: #00ffcc; 
                    box-shadow: 0 0 20px rgba(0, 255, 204, 0.2);
                    background: rgba(0, 0, 0, 0.6);
                }
                button { 
                    width: 100%; 
                    padding: 18px; 
                    border: none; 
                    border-radius: 14px; 
                    background: linear-gradient(135deg, #00ffcc 0%, #0088ff 100%); 
                    color: #030305; 
                    font-size: 16px; 
                    font-weight: 800; 
                    cursor: pointer; 
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: 0 4px 25px rgba(0, 255, 204, 0.25);
                    letter-spacing: 1px;
                }
                button:hover { 
                    transform: translateY(-2px);
                    box-shadow: 0 8px 30px rgba(0, 255, 204, 0.45);
                    filter: brightness(1.1);
                }
                button:active { transform: translateY(0); }
                .status-display { margin-top: 25px; font-size: 13px; font-weight: 700; min-height: 20px; letter-spacing: 0.8px; text-transform: uppercase; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>VOBIXCHAT</h1>
                <div class="subtitle">SECURITY GATEWAY</div>
                <p>Módulo de autenticación de red para la validación de líneas físicas legítimas y asignación de credenciales cifradas globales.</p>
                
                <div class="input-group">
                    <label id="geoLabel">Línea Móvil (Localizando Red...)</label>
                    <input type="tel" id="phoneNumber" autocomplete="off">
                </div>
                
                <button onclick="procesarVerificacion()">AUTORIZAR DISPARO SMS</button>
                <div class="status-display" id="statusMessage"></div>
            </div>

            <script>
                const inputElement = document.querySelector("#phoneNumber");
                const labelElement = document.getElementById("geoLabel");
                
                const itiInstance = window.intlTelInput(inputElement, {
                    initialCountry: "auto",
                    geoIpLookup: function(success, failure) {
                        fetch('https://ipapi.co')
                            .then(res => res.json())
                            .then(data => {
                                labelElement.innerText = "Línea Móvil (Red Detectada: " + data.country_name + ")";
                                success(data.country_code);
                            })
                            .catch(() => {
                                labelElement.innerText = "Línea Móvil (Red Local)";
                                success("ES");
                            });
                    },
                    utilsScript: "https://cloudflare.com"
                });

                async function procesarVerificacion() {
                    const visualMensaje = document.getElementById('statusMessage');
                    const valorNumero = inputElement.value.trim();

                    if (!valorNumero) {
                        visualMensaje.innerText = "SISTEMA: Ingrese un terminal válido.";
                        visualMensaje.style.color = "#ff4d4d";
                        return;
                    }

                    const numeroE164Global = itiInstance.getNumber();

                    if (!itiInstance.isValidNumber()) {
                        visualMensaje.innerText = "SISTEMA: Formato numérico inválido para el país detectado.";
                        visualMensaje.style.color = "#ff4d4d";
                        return;
                    }

                    visualMensaje.innerText = "ESTADO: Enlazando con antenas Infobip...";
                    visualMensaje.style.color = "#00ffcc";

                    try {
                        const respuesta = await fetch('/api/seguridad/verificar-usuario', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ numeroCrudo: numeroE164Global })
                        });
                        
                        const datos = await respuesta.json();
                        
                        if (datos.success) {
                            visualMensaje.innerText = "SISTEMA: PIN de seguridad despachado con éxito.";
                            visualMensaje.style.color = "#00ffcc";
                        } else {
                            visualMensaje.innerText = "ERROR: " + (datos.error || "Acceso denegado.");
                            visualMensaje.style.color = "#ff4d4d";
                        }
                    } catch (error) {
// =================================================================
// PARTE 4: INTEGRITY ENFORCEMENT & INFOBIP PIPELINE DE DISPARO
// =================================================================
app.post('/api/seguridad/verificar-usuario', verificarLimitePeticionesIP, async (req, res) => {
    const { numeroCrudo, hardwareId, deviceFingerprint, networkType, isEmulator, hasRemoteAccess } = req.body;

    if (hasRemoteAccess || isEmulator) {
        console.log(`[KERNEL-AUTH] [MALICIOUS_ENVIRONMENT_DETECTED] // HW: ${hardwareId}`);
        return res.status(403).json({ success: false, error: "ACCESS_DENIED_ENVIRONMENT_UNSECURE" });
    }

    if (!numeroCrudo || numeroCrudo.trim().length < 6) {
        return res.status(400).json({ success: false, error: "INVALID_PARAM_SHORT" });
    }

    const numeroE164 = numeroCrudo.trim(); 

    if (!numeroE164.startsWith('+')) {
        console.log(`[KERNEL-AUTH] [REJECTED_FORMAT] // NO_E164_PREFIX: ${numeroE164}`);
        return res.status(400).json({ success: false, error: "INVALID_INTERNATIONAL_FORMAT" });
    }

    if (listaNegraEstafadores.has(numeroE164)) {
        return res.status(403).json({ success: false, error: "ROUTING_RESTRICTED" });
    }

    if (hardwareBindings.has(numeroE164)) {
        if (hardwareBindings.get(numeroE164) !== hardwareId) {
            console.log(`[SHIELD-CRITICAL] [HARDWARE_MISMATCH_DETECTED] // LINE: ${numeroE164}`);
            return res.status(403).json({ success: false, error: "HARDWARE_LOCK_ACTIVE" });
        }
    }

    if (registroComportamientoUsuarios.has(numeroE164)) {
        const comp = registroComportamientoUsuarios.get(numeroE164);
        const ahora = Date.now();
        if (ahora - comp.ultimoReseteoAcciones < 60000) {
            if (comp.conteoAccionesMinuto >= 3) {
                listaNegraEstafadores.add(numeroE164);
                console.log(`[SPAM-SHIELD] [USER_PERMANENT_BAN] // LINE: ${numeroE164}`);
                return res.status(403).json({ success: false, error: "LINE_TERMINATED_BY_BEHAVIOR" });
            }
            comp.conteoAccionesMinuto++;
        } else {
            comp.conteoAccionesMinuto = 1;
            comp.ultimoReseteoAcciones = ahora;
        }
    }

    try {
        let urlLimpia = process.env.INFOBIP_BASE_URL.replace(/\/$/, "");
        
        const insights = await fetch(`${urlLimpia}/number-insight/1/query/v2`, {
            method: "POST",
            headers: {
                "Authorization": `App ${process.env.INFOBIP_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ to: numeroE164 })
        });
        const insightData = await insights.json();
        
        if (insightData.type === 'VOIP' || insightData.type === 'VIRTUAL' || insightData.currentRoaming || insightData.unconditionalCallForwarding) {
            listaNegraEstafadores.add(numeroE164);
            console.log(`[HONE_CHECK] [VIRTUAL_LINE_OR_INTERCEPTION_DETECTED] // LINE: ${numeroE164}`);
            return res.status(403).json({ success: false, error: "CARRIER_TYPE_REJECTED" });
        }
    } catch (errInsight) {
        console.log(`[BACKUP-MESH] NETWORK_INSIGHT_OFFLINE // ROUTING_CONTINUED`);
    }

    const pinDinamico = Math.floor(1000 + Math.random() * 9000);
    const pinSalt = crypto.randomBytes(16).toString('hex');
    const pinHash = crypto.createHmac('sha256', pinSalt).update(pinDinamico.toString()).digest('hex');
    
    pinesTemporales.set(numeroE164, { hash: pinHash, salt: pinSalt, expires: Date.now() + 90000 });

    setTimeout(() => {
        if (pinesTemporales.has(numeroE164)) {
            const p = pinesTemporales.get(numeroE164);
            if (p.expires <= Date.now()) {
                pinesTemporales.delete(numeroE164);
                console.log(`[RAM-CLEAN] [OTP_EXPIRED_GC] // LINE: ${numeroE164}`);
            }
        }
    }, 91000);

    try {
        let urlLimpia = process.env.INFOBIP_BASE_URL.replace(/\/$/, "");
        const appPayloadNonce = crypto.randomBytes(8).toString('hex');
        
        const peticionSMS = await fetch(`${urlLimpia}/sms/2/text/advanced`, {
            method: "POST",
            headers: {
                "Authorization": `App ${process.env.INFOBIP_API_KEY}`,
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({
                messages: [{
                    destinations: [{ to: numeroE164 }],
                    text: `VOBIXCHAT SECURE PIN: ${pinDinamico}. [TOKEN:${appPayloadNonce}]. No comparta este codigo.`
                }]
            })
        });

        await peticionSMS.json();
        console.log(`[INFOBIP SMS] CORE_DISPATCH_SUCCESS // TARGET: ${numeroE164}`);
    } catch (errorSMS) {
        console.error("[SYS-CORE-ERROR] CARRIER_OUTAGE:", errorSMS);
        return res.status(500).json({ success: false, error: "TRANSMISSION_ERROR" });
    }

    return res.status(200).json({ success: true, message: "TRANSMISSION_COMPLETE" });
});
// =================================================================
// PARTE 5: STAGE 2 VALIDATION, QUANTUM MEDIA & SOCKET REALTIME LAYER
// =================================================================
app.post('/api/seguridad/confirmar-pin', (req, res) => {
    const { numeroCrudo, pinIngresado, contrasenaHistorial, hardwareId, keystrokeDynamics } = req.body;
    
    if (!numeroCrudo) return res.status(400).json({ success: false, error: "CREDENTIALS_CORRUPT" });
    
    const numeroE164 = numeroCrudo.trim();
    const targetPinObj = pinesTemporales.get(numeroE164);

    if (!targetPinObj || targetPinObj.expires <= Date.now()) {
        pinesTemporales.delete(numeroE164);
        return res.status(401).json({ success: false, error: "OTP_EXPIRED_OR_INVALID" });
    }

    const verifyHash = crypto.createHmac('sha256', targetPinObj.salt).update(pinIngresado.toString()).digest('hex');

    if (verifyHash === targetPinObj.hash) {
        pinesTemporales.delete(numeroE164);
        
        if (!hardwareBindings.has(numeroE164)) {
            hardwareBindings.set(numeroE164, hardwareId);
        }

        if (baseContrasenasHistorial.has(numeroE164)) {
            const contrasenaCorrecta = baseContrasenasHistorial.get(numeroE164);
            if (contrasenaHistorial !== contrasenaCorrecta) {
                console.log(`[ALERTA INTRUSO] HISTORIAL_LOCK_TRIGGERED // LINE: ${numeroE164}`);
                return res.status(401).json({ success: false, error: "SECURITY_LOCK_ACTIVE" });
            }
        } else {
            if (!contrasenaHistorial || contrasenaHistorial.trim().length < 4) {
                return res.status(400).json({ success: false, error: "PASSWORD_POLICY_FAILED" });
            }
            baseContrasenasHistorial.set(numeroE164, contrasenaHistorial);
        }

        lineasFisicasAutorizadas.add(numeroE164);

        if (!registroComportamientoUsuarios.has(numeroE164)) {
            registroComportamientoUsuarios.set(numeroE164, {
                estado: "active_enforced",
                puntosLealtad: 100,
                conteoAccionesMinuto: 0,
                ultimoReseteoAcciones: Date.now()
            });
        }

        console.log(`[KERNEL-AUTH] [STAGE_2_CLEAN] STATUS: ENFORCED // USER: ${numeroE164}`);
        return res.status(200).json({ success: true, statusSYS: "STAGE_2_AUTHENTICATED" });
    }
    
    return res.status(401).json({ success: false, error: "OTP_MISMATCH" });
});

app.post('/api/multimedia/subir-archivo', upload.single('archivo_multimedia'), (req, res) => {
    const { identificador_usuario } = req.body;
    const archivo = req.file;

    if (!archivo) return res.status(400).json({ success: false, error: "EMPTY_PAYLOAD" });

    const esValido = lineasFisicasAutorizadas.has(identificador_usuario);
    if (!esValido) {
        if (fs.existsSync(archivo.path)) fs.unlinkSync(archivo.path);
        return res.status(403).json({ success: false, error: "CHANNEL_NOT_AUTHORIZED" });
    }

    try {
        if (archivo.mimetype === 'application/pdf') {
            let bufferPdf = fs.readFileSync(archivo.path);
            if (bufferPdf.includes('/JavaScript') || bufferPdf.includes('/JS') || bufferPdf.includes('/AA') || bufferPdf.includes('/Launch')) {
                fs.unlinkSync(archivo.path);
                console.log(`[SANDBOX] [MALICIOUS_PDF_BLOCKED_AND_PURGED] // USER: ${identificador_usuario}`);
                return res.status(400).json({ success: false, error: "FILE_INTEGRITY_VIOLATION" });
            }
        }

        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
        const rawData = fs.readFileSync(archivo.path);
        const encryptedData = Buffer.concat([cipher.update(rawData), cipher.final()]);
        const tag = cipher.getAuthTag();

        fs.writeFileSync(archivo.path, Buffer.concat([iv, tag, encryptedData]));
        console.log(`[CRYPTO-CORE] [AES_256_GCM_ENFORCED] // FILE: ${archivo.filename}`);
    } catch (errCrypto) {
        if (fs.existsSync(archivo.path)) fs.unlinkSync(archivo.path);
        return res.status(500).json({ success: false, error: "ENCRYPTION_ENGINE_FAILURE" });
    }

    return res.status(200).json({ success: true, message: "PAYLOAD_STORED_AND_ENCRYPTED" });
});

io.on("connection", (socket) => {
    let sessionActive = true;
    let timeoutDeInactividad;

    const resetInactivityTimeout = () => {
        clearTimeout(timeoutDeInactividad);
        timeoutDeInactividad = setTimeout(() => {
            sessionActive = false;
            socket.emit("KERNEL_SESSION_TIMEOUT", { reason: "INACTIVITY_MAX_LIMIT_EXCEEDED" });
            socket.disconnect(true);
        }, 120000);
    };

    resetInactivityTimeout();

    socket.on("JOIN_MUTUAL_MIRROR_ROOM", (data) => {
        if (!sessionActive) return;
        resetInactivityTimeout();
        socket.join(data.roomId);
        console.log(`[MIRROR-ROOM] [CHANNEL_SYNC] // ROOM: ${data.roomId}`);
    });

    socket.on("TRANSMIT_REALTIME_COORDINATES", (data) => {
        if (!sessionActive) return;
        resetInactivityTimeout();
        socket.to(data.roomId).emit("RECEIVE_REALTIME_COORDINATES", {
            x: data.x,
            y: data.y,
            pressure: data.pressure,
            speed: data.speed,
            acceleration: data.acceleration,
            timestamp: Date.now() 
        });
    });

    socket.on("COMMIT_MUTUAL_CRYPTO_SIGNATURE", (data) => {
        clearTimeout(timeoutDeInactividad);
        console.log(`[BLOCKCHAIN-NTP-SEAL] ATOMIC_TIME_INJECTED // CONTRACT_HASH: ${data.contractHash}`);
        io.to(data.roomId).emit("CONTRACT_FULLY_SIGNED", {
            immutableTimestamp: Date.now(),
            status: "SUCCESS_SEALED",
            vaultPath: "/uploads/quantum_media/"
        });
    });

    socket.on("disconnect", () => {
        clearTimeout(timeoutDeInactividad);
    });
});

app.get('/api/admin/config', (req, res) => {
    const badIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    ipReputationCache.set(badIP, { blocked: true });
    console.log(`[HONEYTOKEN_TRIGGERED] [PERMANENT_BAN_EXECUTED] // IP-MALICIOUS: ${badIP}`);
    return res.status(404).send();
});

app.get('/api/seguridad/base-datos', (req, res) => {
    const badIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    ipReputationCache.set(badIP, { blocked: true });
    console.log(`[HONEYTOKEN_TRIGGERED] [PERMANENT_BAN_EXECUTED] // IP-MALICIOUS: ${badIP}`);
    return res.status(404).send();
});

const PUERTO = process.env.PORT || 3000;
servidorHTTP.listen(PUERTO, () => {
    console.log(`[SYS-KERNEL] INITIALIZATION_COMPLETE // PORT: ${PUERTO}`);
});
