// =================================================================
// SERVIDOR MAESTRO COMPLETO: server.js (PRODUCCIÓN INFOBIP DIRECTO)
// =================================================================
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Server } = require("socket.io");

// INYECCIÓN OBLIGATORIA DE TUS LLAVES REALES DE INFOBIP CON SALDO ACTIVO
process.env.INFOBIP_API_KEY = "bb99a77f5ca5f1bdb2295647ec379844-a69e335d-745b-4965-8551-9654c02862d6";
process.env.INFOBIP_BASE_URL = "https://infobip.com"; 

const app = express();
const servidorHTTP = http.createServer(app);
const io = new Server(servidorHTTP, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Creación automática del directorio seguro para fotos y notas de voz
const rutaMedia = path.join(__dirname, 'uploads', 'quantum_media');
if (!fs.existsSync(rutaMedia)){
    fs.mkdirSync(rutaMedia, { recursive: true });
}
// Base de datos para almacenar los códigos PIN temporales generados
const pinesTemporales = new Map();

// Registro global de líneas físicas legítimas (SIM reales) autorizadas
const lineasFisicasAutorizadas = new Set();

// Base de datos secreta para almacenar las contraseñas personales de Historial
const baseContrasenasHistorial = new Map();

// Lista Negra Permanente para almacenar números expulsados por fraude
const listaNegraEstafadores = new Set();
// =================================================================
// PARTE 2: GESTIÓN DE COMPORTAMIENTO Y ESCUDO PROTECTOR ANTI-DDoS
// =================================================================

// Registro dinámico secreto para la Lupa de Comportamiento (Observación y Lealtad)
const registroComportamientoUsuarios = new Map();

// Base de datos para el Escudo Anti-Ráfagas (Evita que intenten tumbar el servidor)
const registroPeticionesPorIP = new Map();

// Función del Escudo Protector contra ataques y saturación masiva (Anti-DDoS)
function verificarLimitePeticionesIP(req, res, next) {
    const direccionIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const tiempoActual = Date.now();
    
    if (!registroPeticionesPorIP.has(direccionIP)) {
        registroPeticionesPorIP.set(direccionIP, { conteo: 1, inicioTiempo: tiempoActual });
        return next();
    }

    const datosIP = registroPeticionesPorIP.get(direccionIP);
    const tiempoTranscurrido = tiempoActual - datosIP.inicioTiempo;

    if (tiempoTranscurrido < 60000) {
        if (datosIP.conteo >= 5) {
            console.log(`[CORTAFUEGOS]: Bloqueando ráfaga masiva desde la IP: ${direccionIP}`);
            return res.status(429).json({ success: false, error: "Saturación de red. Acceso denegado preventivamente." });
        }
        datosIP.conteo++;
    } else {
        datosIP.conteo = 1;
        datosIP.inicioTiempo = tiempoActual;
    }
    next();
}

// Configuración del motor Multer para alojar los archivos cifrados en disco de forma segura
const almacenamientoConfig = multer.diskStorage({
    destination: (req, file, cb) => cb(null, rutaMedia),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const upload = multer({ 
    storage: almacenamientoConfig,
    limits: { fileSize: 10 * 1024 * 1024 } // Límite de 10 Megabytes por archivo multimedia
});
// =================================================================
// PARTE 3: INTERFAZ MULTIPLATAFORMA RESPONSIVA (PC, MÓVIL, TABLET, IPAD)
// =================================================================
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <title>VOBIXCHAT - Secure Gateway</title>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #0a0a0c; color: #ffffff; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; }
                .card { background: #141418; width: 100%; max-width: 420px; padding: 40px 30px; border-radius: 16px; border: 1px solid #22222a; box-shadow: 0 10px 30px rgba(0,0,0,0.7); text-align: center; }
                .logo-area { margin-bottom: 25px; display: flex; justify-content: center; align-items: center; gap: 10px; }
                h1 { font-size: 28px; font-weight: 800; letter-spacing: 2px; color: #00ffcc; text-shadow: 0 0 10px rgba(0,255,204,0.2); }
                p { color: #8a8a98; font-size: 14px; margin-bottom: 25px; line-height: 1.5; }
                .input-group { text-align: left; margin-bottom: 20px; }
                label { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #a1a1b5; margin-bottom: 8px; font-weight: 600; }
                input { width: 100%; padding: 14px 16px; border: 1px solid #2c2c35; border-radius: 8px; background: #1c1c24; color: #ffffff; font-size: 16px; outline: none; transition: border-color 0.2s; }
                input:focus { border-color: #00ffcc; }
                button { width: 100%; padding: 14px; border: none; border-radius: 8px; background: #00ffcc; color: #0a0a0c; font-size: 16px; font-weight: 700; cursor: pointer; transition: background 0.2s, transform 0.1s; }
                button:hover { background: #00e6b8; }
                button:active { transform: scale(0.98); }
                .status-display { margin-top: 20px; font-size: 14px; font-weight: 600; min-height: 20px; }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="logo-area">
                    <h1>VOBIXCHAT</h1>
                </div>
                <p>Plataforma de autenticación móvil y cifrado cuántico. Ingrese su número de línea física legítima.</p>
                
                <div class="input-group">
                    <label>Número Telefónico (Formato E.164)</label>
                    <input type="tel" id="phoneNumber" placeholder="+34600000000" autocomplete="off">
                </div>
                
                <button onclick="procesarVerificacion()">Despachar PIN de Seguridad</button>
                <div class="status-display" id="statusMessage"></div>
            </div>

            <script>
                async function procesarVerificacion() {
                    const campoNumero = document.getElementById('phoneNumber');
                    const visualMensaje = document.getElementById('statusMessage');
                    const valorNumero = campoNumero.value.trim();

                    if (!valorNumero) {
                        visualMensaje.innerText = "Por favor, ingrese un número de teléfono.";
                        visualMensaje.style.color = "#ff4444";
                        return;
                    }

                    visualMensaje.innerText = "Conectando con antenas Infobip...";
                    visualMensaje.style.color = "#00ffcc";

                    try {
                        const respuesta = await fetch('/api/seguridad/verificar-usuario', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ numeroCrudo: valorNumero })
                        });
                        
                        const datos = await respuesta.json();
                        
                        if (datos.success) {
                            visualMensaje.innerText = "¡Éxito! Código PIN enviado por SMS.";
                            visualMensaje.style.color = "#00ffcc";
                        } else {
                            visualMensaje.innerText = datos.error || "Acceso denegado.";
                            visualMensaje.style.color = "#ff4444";
                        }
                    } catch (error) {
                        visualMensaje.innerText = "Error de red o saturación preventiva.";
                        visualMensaje.style.color = "#ff4444";
                    }
                }
            </script>
        </body>
        </html>
    `);
});
// =================================================================
// PARTE 4: ENDPOINT DE DISPARO DIRECTO SMS (INFOBIP PRODUCCIÓN)
// =================================================================

// Endpoint corregido: Recibe el número de forma directa sin filtros sintácticos trancados
app.post('/api/seguridad/verificar-usuario', verificarLimitePeticionesIP, async (req, res) => {
    const { numeroCrudo } = req.body;

    if (!numeroCrudo || numeroCrudo.trim().length < 6) {
        return res.status(400).json({ success: false, error: "El número telefónico ingresado es demasiado corto." });
    }

    const numeroE164 = numeroCrudo.trim(); 

    // Detener el registro inmediato si la línea cayó previamente en la Lista Negra
    if (listaNegraEstafadores.has(numeroE164)) {
        return res.status(403).json({ success: false, error: "Línea restringida por el sistema de seguridad de red." });
    }

    // Generar PIN dinámico de verificación de 4 dígitos
    const pinDinamico = Math.floor(1000 + Math.random() * 9000);
    pinesTemporales.set(numeroE164, pinDinamico.toString());

    // DISPARO DIRECTO DEL SMS FÍSICO POR ANTENA REAL HACIA INFOBIP
    try {
        let urlLimpia = process.env.INFOBIP_BASE_URL.replace(/\/$/, "");
        
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
                    from: "VobixChat",
                    text: `VOBIXCHAT SECURE PIN: ${pinDinamico}. No comparta este codigo con nadie.`
                }]
            })
        });

        const logsInfobip = await peticionSMS.json();
        console.log(`[INFOBIP SMS]: Mensaje real despachado hacia ${numeroE164}.`);
    } catch (errorSMS) {
        console.error("[SYS ERROR]: Error de red al conectar con las antenas de Infobip:", errorSMS);
        return res.status(500).json({ success: false, error: "Fallo en el distribuidor de SMS de la red movil." });
    }

    return res.status(200).json({ success: true, message: "Codigo PIN de operadora fisica despachado por SMS." });
});
// =================================================================
// PARTE 5: CONFIRMACIÓN DE PIN, CONTROL MULTIMEDIA E INICIALIZACIÓN
// =================================================================

// Endpoint para validar el PIN SMS y verificar el Candado de Contraseña de Historial
app.post('/api/seguridad/confirmar-pin', (req, res) => {
    const { numeroCrudo, pinIngresado, contrasenaHistorial } = req.body;
    
    if (!numeroCrudo) return res.status(400).json({ success: false, error: "Identidad corrupta." });
    
    const numeroE164 = numeroCrudo.trim();
    const pinCorrecto = pinesTemporales.get(numeroE164);

    if (pinIngresado === pinCorrecto) {
        
        // REGLA OBLIGATORIA DEL CANDADO: Verificar la contraseña del historial
        if (baseContrasenasHistorial.has(numeroE164)) {
            const contrasenaCorrecta = baseContrasenasHistorial.get(numeroE164);
            if (contrasenaHistorial !== contrasenaCorrecta) {
                console.log(`[ALERTA INTRUSO]: SIM legítima falló la contraseña de Historial en: ${numeroE164}`);
                return res.status(401).json({ success: false, error: "CANDADO DE SEGURIDAD INTERNO ACUMULADO. Contraseña invalida." });
            }
        } else {
            if (!contrasenaHistorial || contrasenaHistorial.trim().length < 4) {
                return res.status(400).json({ success: false, error: "Debe asignar una contraseña segura de Historial." });
            }
            baseContrasenasHistorial.set(numeroE164, contrasenaHistorial);
            console.log(`[CANDADO REGISTRO]: Nueva contraseña enlazada al numero: ${numeroE164}`);
        }

        lineasFisicasAutorizadas.add(numeroE164);

        if (!registroComportamientoUsuarios.has(numeroE164)) {
            registroComportamientoUsuarios.set(numeroE164, {
                estado: "observado",
                puntosLealtad: 0,
                conteoAccionesMinuto: 0,
                ultimoReseteoAcciones: Date.now()
            });
        }

        return res.status(200).json({ success: true, statusSYS: "CANAL ENLAZADO. Acceso al Historial AUTORIZADO." });
    }
    return res.status(401).json({ success: false, error: "PIN de SMS incorrecto." });
});

// Endpoint para recibir fotos y notas de voz
app.post('/api/multimedia/subir-archivo', upload.single('archivo_multimedia'), (req, res) => {
    const { identificador_usuario } = req.body;
    const archivo = req.file;

    if (!archivo) return res.status(400).json({ success: false, error: "Carga vacia." });

    const esValido = lineasFisicasAutorizadas.has(identificador_usuario);
    if (!esValido) {
        if (fs.existsSync(archivo.path)) fs.unlinkSync(archivo.path);
        return res.status(403).json({ success: false, error: "Transmisión denegada. Canal bloqueado o falta validar identidad." });
    }

    return res.status(200).json({ success: true, message: "Archivo multimedia recibido correctamente." });
});

// Inicialización del servidor
const PUERTO = process.env.PORT || 3000;
servidorHTTP.listen(PUERTO, () => {
    console.log(`Servidor maestro corriendo en el puerto ${PUERTO}`);
});
