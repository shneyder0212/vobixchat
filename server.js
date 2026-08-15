// =================================================================
// PARTE 1: SYSTEM CORE INITIALIZATION & CRYPTO ENGINE SETUP
// =================================================================
require('dotenv').config(); // Carga de variables de entorno perimetrales (.env)
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const { Server } = require("socket.io");

// Verificación obligatoria de las variables del entorno del sistema
if (!process.env.INFOBIP_API_KEY || !process.env.INFOBIP_BASE_URL) {
    console.error("[SHIELD-CRITICAL] [ENV_FAILURE] No se han detectado las variables del sistema en el entorno.");
    process.exit(1);
}

const app = express();
const servidorHTTP = http.createServer(app);
const io = new Server(servidorHTTP, { 
    cors: { 
        origin: "*",
        methods: ["GET", "POST"]
    } 
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Generación de la ruta de almacenamiento aislado para archivos multimedia entrantes
const rutaMedia = path.join(__dirname, 'uploads', 'quantum_media');
if (!fs.existsSync(rutaMedia)){
    fs.mkdirSync(rutaMedia, { recursive: true });
}

// Inicialización de los mapas de memoria interna volátil para seguridad de red
const pinesTemporales = new Map();
const lineasFisicasAutorizadas = new Set();
const baseContrasenasHistorial = new Map();
const listaNegraEstafadores = new Set();
const registroComportamientoUsuarios = new Map();
const registroPeticionesPorIP = new Map();
const hardwareBindings = new Map(); 
const ipReputationCache = new Map(); 

// Derivación segura de clave simétrica basada en el token maestro de Infobip
const ENCRYPTION_KEY = crypto.scryptSync(process.env.INFOBIP_API_KEY, 'salt-cuantica-segura-vobix', 32);

console.log("[SHIELD-INFO] Parte 1 inicializada de forma segura. Motores criptográficos listos.");
// =================================================================
// PARTE 2: PERIMETER IP FIREWALL & DISK STORAGE PROTECTION
// =================================================================

/**
 * Middleware del Cortafuegos Perimetral: Evalúa el comportamiento de la IP entrante
 * Bloquea permanentemente en caché las IPs con patrones de abuso detectados
 */
function verificarLimitePeticionesIP(req, res, next) {
    const direccionIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const tiempoActual = Date.now();
    
    // 1. Control de Reputación de IP permanente
    if (ipReputationCache.has(direccionIP) && ipReputationCache.get(direccionIP).blocked) {
        console.log(`[SHIELD-CRITICAL] [IP_BLOCKED] Intento de acceso desde IP baneada // IP: ${direccionIP}`);
        return res.status(403).json({ success: false, error: "SECURITY_RULE_VIOLATION" });
    }

    // 2. Inicialización del registro para nuevas IPs
    if (!registroPeticionesPorIP.has(direccionIP)) {
        registroPeticionesPorIP.set(direccionIP, { conteo: 1, inicioTiempo: tiempoActual, rafagasConsecutivas: 0 });
        return next();
    }

    const datosIP = registroPeticionesPorIP.get(direccionIP);
    const tiempoTranscurrido = tiempoActual - datosIP.inicioTiempo;

    // 3. Ventana de evaluación de tráfico en ráfagas (60 segundos)
    if (tiempoTranscurrido < 60000) {
        if (datosIP.conteo >= 5) {
            datosIP.rafagasConsecutivas++;
            console.log(`[SHIELD-WARNING] [RATE_LIMIT_TRIGGERED] Umbral excedido // IP: ${direccionIP}`);
            
            // Si la IP genera ráfagas repetidas en ventanas sucesivas, se banea permanentemente
            if (datosIP.rafagasConsecutivas >= 2) {
                ipReputationCache.set(direccionIP, { blocked: true });
                console.log(`[SHIELD-CRITICAL] [PERMANENT_IP_BAN] Reputación de IP destruida permanentemente // IP: ${direccionIP}`);
            }
            return res.status(429).json({ success: false, error: "SECURITY_BURST_DENIED" });
        }
        datosIP.conteo++;
    } else {
        // Reinicio de la ventana de monitorización tras expirar el minuto
        datosIP.conteo = 1;
        datosIP.inicioTiempo = tiempoActual;
    }
    next();
}

/**
 * Configuración del almacenamiento en disco para archivos multimedia aislados
 */
const almacenamientoConfig = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, rutaMedia);
    },
    filename: (req, file, cb) => {
        // Sanitización del nombre de archivo utilizando marcas de tiempo Unix para evitar colisiones
        const nombreLimpio = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '');
        cb(null, nombreLimpio);
    }
});

/**
 * Filtro estricto Multer para la subida de archivos: Bloquea extensiones ejecutables o peligrosas
 */
const upload = multer({ 
    storage: almacenamientoConfig,
    limits: { 
        fileSize: 10 * 1024 * 1024 // Límite estricto de peso: 10 Megabytes por archivo
    },
    fileFilter: (req, file, cb) => {
        // Únicamente se permiten tipos MIME autorizados y seguros (Documentos PDF, Imágenes y Audio)
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('audio/')) {
            cb(null, true);
        } else {
            console.log(`[SHIELD-WARNING] [FILE_REJECTED] Intento de subida de archivo no seguro: ${file.mimetype}`);
            cb(new Error('SECURITY_FILE_TYPE_REJECTED'), false);
        }
    }
});

console.log("[SHIELD-INFO] Parte 2 inicializada. Cortafuegos de IP y protección de disco activos.");
// =================================================================
// PARTE 3: SECURE GLASSMORPHISM INTERFACE LAYER (REGISTRATION VIEW)
// =================================================================

app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <title>VOBIXCHAT // Portal de Registro Seguro</title>
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
                    overflow-x: hidden;
                    position: relative;
                }
                
                body::after {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; width: 100%; height: 100%;
                    background-image: linear-gradient(rgba(0, 255, 204, 0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 204, 0.02) 1px, transparent 1px);
                    background-size: 30px 30px;
                    z-index: 0;
                }

                .glow-circle {
                    position: absolute;
                    width: 400px;
                    height: 400px;
                    background: linear-gradient(135deg, rgba(0, 255, 204, 0.15), rgba(0, 136, 255, 0.15));
                    filter: blur(100px);
                    border-radius: 50%;
                    z-index: 0;
                }

                .card { 
                    background: rgba(18, 22, 35, 0.6); 
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    width: 100%; 
                    max-width: 460px; 
                    padding: 40px 35px; 
                    border-radius: 24px; 
                    border: 1px solid rgba(0, 255, 204, 0.15); 
                    box-shadow: 0 20px 50px rgba(0,0,0,0.7), inset 0 1px 1px rgba(255,255,255,0.05); 
                    text-align: center; 
                    z-index: 1;
                    position: relative;
                }
                
                h1 { 
                    font-size: 32px; 
                    font-weight: 800; 
                    letter-spacing: 4px; 
                    background: linear-gradient(135deg, #00ffcc 0%, #00bcff 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    margin-bottom: 8px;
                }
                
                .subtitle {
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 3px;
                    color: #00ffcc;
                    margin-bottom: 30px;
                    font-weight: 700;
                }
                
                .input-group { 
                    text-align: left; 
                    margin-bottom: 20px; 
                }
                
                label { 
                    display: block; 
                    font-size: 11px; 
                    text-transform: uppercase; 
                    letter-spacing: 1.5px; 
                    color: #a0a6c0; 
                    margin-bottom: 8px; 
                    font-weight: 600; 
                }
                
                input { 
                    width: 100%;
                    padding: 14px 16px; 
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    background: rgba(8, 10, 16, 0.7);
                    color: #ffffff; 
                    font-size: 15px; 
                    outline: none; 
                    transition: border-color 0.3s ease, box-shadow 0.3s ease;
                }
                
                input:focus {
                    border-color: #00ffcc;
                    box-shadow: 0 0 10px rgba(0, 255, 204, 0.2);
                }
                
                .btn-submit {
                    width: 100%;
                    padding: 16px;
                    background: linear-gradient(135deg, #00ffcc 0%, #00bcff 100%);
                    border: none;
                    border-radius: 12px;
                    color: #040508;
                    font-size: 15px;
                    font-weight: 700;
                    letter-spacing: 2px;
                    cursor: pointer;
                    transition: transform 0.2s ease, opacity 0.2s ease;
                    margin-top: 10px;
                }
                
                .btn-submit:hover {
                    opacity: 0.95;
                }
                
                .btn-submit:active {
                    transform: scale(0.98);
                }
            </style>
        </head>
        <body>
            <div class="glow-circle"></div>
            <div class="card">
                <h1>VOBIXCHAT</h1>
                <div class="subtitle">Security Gateway & Registro</div>
                
                <form action="/api/v1/auth/register" method="POST">
                    <div class="input-group">
                        <label for="username">Nombre de Usuario</label>
                        <input type="text" id="username" name="username" placeholder="Ej. usuario_quantum" required autocomplete="off">
                    </div>
                    
                    <div class="input-group">
                        <label for="telefono">Línea Móvil Internacional</label>
                        <input type="tel" id="telefono" name="telefono" placeholder="+34600000000" required autocomplete="off">
                    </div>
                    
                    <button type="submit" class="btn-submit">REGISTRAR E INICIAR SMS</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

console.log("[SHIELD-INFO] Parte 3 inicializada. Capa visual de registro inyectada correctamente.");
// =================================================================
// PARTE 4: REGISTRATION ENDPOINT & INFOBIP SMS OUTBOUND
// =================================================================

/**
 * Endpoint de Registro: Procesa el formulario, aplica seguridad IP y dispara el SMS
 */
app.post('/api/v1/auth/register', verificarLimitePeticionesIP, async (req, res) => {
    const { username, telefono } = req.body;

    // 1. Validación básica de presencia de datos obligatorios
    if (!username || !telefono) {
        console.log("[SHIELD-WARNING] [AUTH_EMPTY] Intento de registro con campos incompletos.");
        return res.status(400).json({ success: false, error: "REJECTED_EMPTY_FIELDS" });
    }

    // 2. Sanitización del número de teléfono (remueve espacios y caracteres especiales de riesgo)
    const telefonoLimpio = telefono.trim().replace(/[^a-zA-Z0-9+]/g, '');

    // 3. Verificación de seguridad: Comprobación de prefijo internacional (+)
    if (!telefonoLimpio.startsWith('+')) {
        console.log(`[SHIELD-WARNING] [AUTH_FORMAT] Número de teléfono sin código de país internacional: ${telefonoLimpio}`);
        return res.status(400).json({ success: false, error: "INVALID_INTERNATIONAL_PREFIX" });
    }

    console.log(`[SHIELD-INFO] Procesando despacho de SMS para el usuario [${username}] a la línea: ${telefonoLimpio}`);

    try {
        // 4. Construcción del payload estructurado según la documentación técnica de Infobip
        const payloadMensaje = {
            messages: [{
                destinations: [{ 
                    to: telefonoLimpio 
                }],
                from: "VobixChat",
                text: `[VOBIXCHAT] Hola ${username}, tu registro en el Security Gateway ha sido procesado de forma exitosa.`
            }]
        };

        // 5. Transmisión HTTP segura hacia el subdominio de la API de Infobip
        const respuestaInfobip = await fetch(`${process.env.INFOBIP_BASE_URL}/sms/2/text/advanced`, {
            method: 'POST',
            headers: {
                'Authorization': `App ${process.env.INFOBIP_API_KEY}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payloadMensaje)
        });

        // 6. Evaluación de la respuesta del servicio de mensajería externo
        if (!respuestaInfobip.ok) {
            const errorDetalle = await respuestaInfobip.text();
            console.error(`[SHIELD-CRITICAL] [INFOBIP_API_ERROR] Código: ${respuestaInfobip.status} - Detalle: ${errorDetalle}`);
            return res.status(respuestaInfobip.status).json({ 
                success: false, 
                error: "EXTERNAL_GATEWAY_REJECTION",
                status: respuestaInfobip.status 
            });
        }

        const datosRespuesta = await respuestaInfobip.json();
        console.log(`[SHIELD-INFO] [SMS_SUCCESS] Mensaje enviado correctamente a través del Gateway.`);
        
        // Registro del usuario en la base de líneas autorizadas internas de forma dinámica
        lineasFisicasAutorizadas.add(telefonoLimpio);

        // Respuesta limpia al cliente confirmando el envío
        return res.status(200).json({ 
            success: true, 
            message: "REGISTRATION_AND_SMS_DISPATCHED",
            trackingId: datosRespuesta.messages?.[0]?.messageId || null
        });

    } catch (error) {
        console.error("[SHIELD-CRITICAL] [TRANSMISSION_CRASH] Error crítico en la llamada de red a la API:", error);
        return res.status(500).json({ 
            success: false, 
            error: "FETCH_TRANSMISSION_FAILED" 
        });
    }
});

console.log("[SHIELD-INFO] Parte 4 inicializada. Endpoints de control y API de mensajería vinculados.");
// =================================================================
// PARTE 5: REAL-TIME WEBSOCKETS & NETWORK LIFECYCLE MANAGEMENT
// =================================================================

/**
 * Gestión del Ciclo de Vida de Sockets en Tiempo Real (Socket.io)
 * Mantiene la persistencia de datos y monitorización de flujos de usuarios activos
 */
io.on("connection", (socket) => {
    // Captura de la dirección de red remota del cliente de sockets para auditoría
    const direccionIPCliente = socket.handshake.headers['x-forwarded-for'] || socket.conn.remoteAddress;
    console.log(`[SHIELD-INFO] [SOCKET_CONNECTED] Nueva sesión en tiempo real establecida // ID: ${socket.id} // IP: ${direccionIPCliente}`);

    // Validación interna de reputación de IP antes de permitir transmisión de mensajes por sockets
    if (ipReputationCache.has(direccionIPCliente) && ipReputationCache.get(direccionIPCliente).blocked) {
        console.log(`[SHIELD-CRITICAL] [SOCKET_REJECTED] Conexión abortada por IP bloqueada en firewall // ID: ${socket.id}`);
        socket.emit("security_error", { message: "ACCESS_DENIED_BY_PERIMETER_FIREWALL" });
        return socket.disconnect(true);
    }

    // Manejador del canal de mensajería asíncrona interna
    socket.on("canal_mensaje_usuario", (datosEntrantes) => {
        try {
            // Registro inmediato del comportamiento del usuario para prevención de fraudes o inyecciones
            registroComportamientoUsuarios.set(socket.id, {
                ultimoContacto: Date.now(),
                payloadSize: JSON.stringify(datosEntrantes).length
            });

            // Retransmisión segura controlada hacia los receptores del panel
            io.emit("difusion_mensaje_servidor", {
                origen: socket.id,
                contenido: datosEntrantes.texto || "",
                timestamp: Date.now()
            });
        } catch (err) {
            console.error(`[SHIELD-WARNING] Error procesando trama de datos en socket: ${socket.id}`, err);
        }
    });

    // Manejador de desconexión: Limpieza automática de la memoria volátil
    socket.on("disconnect", (motivo) => {
        console.log(`[SHIELD-INFO] [SOCKET_DISCONNECTED] Sesión finalizada // ID: ${socket.id} // Motivo: ${motivo}`);
        registroComportamientoUsuarios.delete(socket.id);
    });
});

/**
 * Directiva de Encendido del Servidor HTTP y Gateway Cuántico
 */
const PORT = process.env.PORT || 3000;
servidorHTTP.listen(PORT, () => {
    console.log("=================================================================");
    console.log(`[SERVER-SUCCESS] QUANTUM SECURITY GATEWAY OPERATIVO`);
    console.log(`[SERVER-SUCCESS] Escuchando conexiones de red en el Puerto: ${PORT}`);
    console.log("=================================================================");
});

/**
 * MANEJADORES DE APAGADO SEGURO (GRACEFUL SHUTDOWN)
 * Evita la corrupción de archivos en disco e interrupciones abruptas de tráfico en Render
 */
function apagarServidorSeguro(senal) {
    console.log(`\n[SHIELD-CRITICAL] [SHUTDOWN_SIGNAL] Recibida señal ${senal}. Cerrando pasarela de forma segura...`);
    
    // 1. Cierre inmediato del puerto de escucha de red para rechazar nuevas peticiones
    servidorHTTP.close(() => {
        console.log("[SHIELD-INFO] Servidor HTTP cerrado correctamente. No se aceptan más conexiones.");
        
        // 2. Desconexión masiva y forzada de todos los sockets activos para liberar descriptores de archivos
        io.close(() => {
            console.log("[SHIELD-INFO] Canales WebSocket cerrados por completo.");
            
            // 3. Volcado final de logs o estados críticos si fuese necesario antes del cierre físico
            console.log("[SHIELD-SUCCESS] Pasarela cuántica liberada. Proceso finalizado sin fugas de datos.\n");
            process.exit(0);
        });
    });

    // Temporizador de seguridad: Si el servidor tarda más de 10 segundos en cerrarse, fuerza el cierre del proceso
    setTimeout(() => {
        console.error("[SHIELD-CRITICAL] Forzando salida del sistema debido a retraso en el cierre de recursos.");
        process.exit(1);
    }, 10000);
}

// Escucha activa de señales de terminación enviadas por el orquestador del servidor de la nube (Render)
process.on('SIGTERM', () => apagarServidorSeguro('SIGTERM'));
process.on('SIGINT', () => apagarServidorSeguro('SIGINT'));

// Capturador de excepciones no controladas en el bucle de eventos para evitar caídas catastróficas del hilo principal
process.on('uncaughtException', (error) => {
    console.error("[SHIELD-CRITICAL] [UNCAUGHT_EXCEPTION] Error no controlado detectado en ejecución:", error.message);
    console.error(error.stack);
    // Nota: El proceso no se detiene para mantener la resiliencia y alta disponibilidad del gateway
});

process.on('unhandledRejection', (motivo, promesa) => {
    console.error("[SHIELD-CRITICAL] [UNHANDLED_REJECTION] Promesa rechazada no controlada en:", promesa, "Motivo:", motivo);
});
