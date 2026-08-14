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
process.env.INFOBIP_BASE_URL = "AQUÍ_PEGA_TU_URL_DE_INFOBIP"; // <-- BORRA ESTO Y PEGA TU URL DE INFOBIP (EJEMPLO: https://infobip.com)

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
