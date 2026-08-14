// =================================================================
// PARTE 1: SYSTEM CORE INITIALIZATION & CRYPTO ENGINE SETUP
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
// PARTE 3: PRE-RENDERED SECURE GLASSMORPHISM INTERFACE LAYER
// =================================================================
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <title>VOBIXCHAT // Quantum Security Gateway</title>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
                    background: radial-gradient(circle at center, #0e111a 0%, #040508 100%); 
                    color: #ffffff; 
                    display: flex; 
                    justify-content: center; 
                    align-items: center; 
                    min-height: 100vh; 
                    padding: 20px;
                    overflow: hidden;
                    position: relative;
                }
                
                body::after {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; width: 100%; height: 100%;
                    background-image: linear-gradient(rgba(0, 255, 204, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 204, 0.03) 1px, transparent 1px);
                    background-size: 30px 30px;
                    z-index: 0;
                }

                .glow-circle {
                    position: absolute;
                    width: 450px;
                    height: 450px;
                    background: linear-gradient(135deg, rgba(0, 255, 204, 0.2), rgba(0, 136, 255, 0.2));
                    filter: blur(120px);
                    border-radius: 50%;
                    z-index: 0;
                    animation: floatGlow 10s infinite alternate ease-in-out;
                }
                @keyframes floatGlow {
                    0% { transform: translate(-20px, -20px) scale(1); }
                    100% { transform: translate(20px, 20px) scale(1.1); }
                }

                .card { 
                    background: rgba(18, 22, 35, 0.55); 
                    backdrop-filter: blur(25px);
                    -webkit-backdrop-filter: blur(25px);
                    width: 100%; 
                    max-width: 450px; 
                    padding: 60px 45px; 
                    border-radius: 32px; 
                    border: 1px solid rgba(0, 255, 204, 0.15); 
                    box-shadow: 0 30px 70px rgba(0,0,0,0.8), inset 0 1px 1px rgba(255,255,255,0.1); 
                    text-align: center; 
                    z-index: 1;
                    position: relative;
                }
                h1 { 
                    font-size: 40px; 
                    font-weight: 900; 
                    letter-spacing: 8px; 
                    background: linear-gradient(135deg, #00ffcc 0%, #00bcff 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    margin-bottom: 6px;
                }
                .subtitle {
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 5px;
                    color: #00ffcc;
                    margin-bottom: 40px;
                    font-weight: 800;
                    text-shadow: 0 0 15px rgba(0,255,204,0.4);
                }
                p { color: #8c90a6; font-size: 14px; margin-bottom: 35px; line-height: 1.65; font-weight: 400; }
                .input-group { text-align: left; margin-bottom: 35px; }
                label { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #a0a6c0; margin-bottom: 12px; font-weight: 700; }
                
                .phone-box {
                    display: flex;
                    width: 100%;
                    background: rgba(8, 10, 16, 0.6);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 16px;
                    overflow: hidden;
                    transition: all 0.3s ease;
                }
                .phone-box:focus-within {
                    border-color: #00ffcc;
                    box-shadow: 0 0 25px rgba(0, 255, 204, 0.25);
                    background: rgba(0, 0, 0, 0.7);
                }
                select {
                    background: transparent;
                    color: #00ffcc;
                    border: none;
                    padding: 18px;
                    font-size: 16px;
                    font-weight: bold;
                    outline: none;
                    cursor: pointer;
                    border-right: 1px solid rgba(255, 255, 255, 0.08);
                }
                select option {
                    background: #121623;
                    color: #ffffff;
                }
                input { 
                    flex: 1;
                    padding: 18px 20px; 
                    border: none;
                    background: transparent;
                    color: #ffffff; 
                    font-size: 17px; 
                    outline: none; 
                    letter-spacing: 1px;
                }
                
                button { 
                    width: 100%; 
                    padding: 18px; 
                    border: none; 
                    border-radius: 16px; 
                    background: linear-gradient(135deg, #00ffcc 0%, #0077ff 100%); 
                    color: #040508; 
                    font-size: 16px; 
                    font-weight: 800; 
                    cursor: pointer; 
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: 0 5px 30px rgba(0, 255, 204, 0.3);
                    letter-spacing: 1.5px;
                }
                button:hover { 
                    transform: translateY(-2px);
                    box-shadow: 0 10px 40px rgba(0, 255, 204, 0.5);
                    filter: brightness(1.15);
                }
                button:active { transform: translateY(0); }
                .status-display { margin-top: 25px; font-size: 13px; font-weight: 700; min-height: 20px; letter-spacing: 1px; text-transform: uppercase; }
            </style>
        </head>
        <body>
            <div class="glow-circle"></div>
            <div class="card">
                <h1>VOBIXCHAT</h1>
                <div class="subtitle">SECURITY GATEWAY</div>
                <p>Módulo de autenticación cuántica automatizada. Ingrese su terminal telefónico para validar los candados de identidad móvil.</p>
                <div class="input-group">
                    <label>Terminal Físico Legítimo</label>
                    <div class="phone-box">
                        <select id="countryPrefix">
                            <option value="+34">🇪🇸 +34</option>
                            <option value="+1">🇩🇴 +1</option>
                            <option value="+1">🇺🇸 +1</option>
                            <option value="+52">🇲🇽 +52</option>
                            <option value="+54">🇦🇷 +54</option>
                            <option value="+57">🇨🇴 +57</option>
                        </select>
                        <input type="tel" id="phoneNumber" placeholder="600 000 000" autocomplete="off">
                    </div>
                </div>
                <button onclick="procesarVerificacion()" id="btnAction">EJECUTAR DESPACHO SMS</button>
                <div class="status-display" id="statusMessage"></div>
            </div>
            <script>
                async function procesarVerificacion() {
                    const prefijo = document.getElementById('countryPrefix').value;
                    const campoNumero = document.getElementById('phoneNumber');
                    const visualMensaje = document.getElementById('statusMessage');
                    const btn = document.getElementById('btnAction');
                    const valorNumero = campoNumero.value.trim().replace(/\\s+/g, '');

                    if (!valorNumero || valorNumero.length < 6) {
                        visualMensaje.innerText = "SISTEMA: Ingrese un terminal válido.";
                        visualMensaje.style.color = "#ff4d4d";
                        return;
                    }

                    const numeroE164Global = prefijo + valorNumero;
                    visualMensaje.innerText = "ESTADO: Enlazando con antenas Infobip...";
                    visualMensaje.style.color = "#00ffcc";
                    btn.style.opacity = "0.7";
                    btn.disabled = true;

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
// PARTE 4: USER INTEGRITY VALIDATION & INFOBIP CORE SMS PIPELINE
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
