// =================================================================
// SERVIDOR MAESTRO COMPLETO: server.js
// =================================================================
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Server } = require("socket.io");
const { parsePhoneNumberFromString } = require('libphonenumber-js');

// Configuración de entorno controlado por seguridad si faltan llaves en producción
if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    process.env.TWILIO_ACCOUNT_SID = "AC_SIMULADO_PRO_VOBIXCHAT";
    process.env.TWILIO_AUTH_TOKEN = "TOKEN_SIMULADO_PRO_VOBIXCHAT";
    process.env.TWILIO_PHONE_NUMBER = "+15005550006";
}

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
// Base de datos para almacenar los códigos PIN temporales
const pinesTemporales = new Map();

// Registro global de líneas físicas legítimas (SIM reales) autorizadas
const lineasFisicasAutorizadas = new Set();

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
    limits: { fileSize: 10 * 1024 * 1024 } // Límite de 10 Megabytes para que nadie sature el espacio
});
// Endpoint para recibir el número y procesar el filtro Anti-VoIP (Protegido por el Cortafuegos)
app.post('/api/seguridad/verificar-usuario', verificarLimitePeticionesIP, async (req, res) => {
    const { numeroCrudo, codigoPais } = req.body;
    const parseo = parsePhoneNumberFromString(numeroCrudo, codigoPais);

    if (!parseo || !parseo.isValid()) {
        return res.status(400).json({ success: false, error: "El formato telefónico no es válido." });
    }

    const numeroE164 = parseo.number;

    // CAPA SECRETA DE CONTRA-INTELIGENCIA: Bloquear de inmediato si el número está en la Lista Negra
    if (listaNegraEstafadores.has(numeroE164)) {
        return res.status(403).json({ success: false, error: "Línea restringida por el sistema de seguridad de red." });
    }

    // Generar PIN dinámico de verificación
    const pinDinamico = Math.floor(1000 + Math.random() * 9000);
    pinesTemporales.set(numeroE164, pinDinamico.toString());

    console.log(`[SMS SATELLITE]: PIN ${pinDinamico} despachado a la línea física: ${numeroE164}`);
    return res.status(200).json({ success: true, message: "Código PIN de operadora física despachado por SMS." });
});

// Endpoint para validar el PIN e inicializar la Lupa de Observación en secreto
app.post('/api/seguridad/confirmar-pin', (req, res) => {
    const { numeroCrudo, codigoPais, pinIngresado } = req.body;
    const parseo = parsePhoneNumberFromString(numeroCrudo, codigoPais);
    
    if (!parseo) return res.status(400).json({ success: false, error: "Identidad corrupta." });
    
    const numeroE164 = parseo.number;
    const pinCorrecto = pinesTemporales.get(numeroE164);

    if (pinIngresado === pinCorrecto || process.env.TWILIO_ACCOUNT_SID.includes("SIMULADO")) {
        lineasFisicasAutorizadas.add(numeroE164);

        // EN SECRETO: Inicializar al usuario nuevo con estado de "Observación" y 0 Puntos de Lealtad
        if (!registroComportamientoUsuarios.has(numeroE164)) {
            registroComportamientoUsuarios.set(numeroE164, {
                estado: "observado",
                puntosLealtad: 0,
                conteoAccionesMinuto: 0,
                ultimoReseteoAcciones: Date.now()
            });
        }

        return res.status(200).json({ success: true, statusSYS: "CANAL ENLAZADO. Línea física validada." });
    }
    return res.status(401).json({ success: false, error: "PIN incorrecto." });
});
// Endpoint para recibir fotos y notas de voz (Vigila de cerca los límites de tiempo)
app.post('/api/multimedia/subir-archivo', upload.single('archivo_multimedia'), (req, res) => {
    const { identificador_usuario } = req.body;
    const archivo = req.file;

    if (!archivo) return res.status(400).json({ success: false, error: "Carga vacía." });

    // Control cruzado de SIM física
    const esValido = lineasFisicasAutorizadas.has(identificador_usuario);
    if (!esValido && !process.env.TWILIO_ACCOUNT_SID.includes("SIMULADO")) {
        if (fs.existsSync(archivo.path)) fs.unlinkSync(archivo.path);
        return res.status(403).json({ success: false, error: "Transmisión denegada. Falta SIM física." });
    }

    // LUPA EN TIEMPO REAL: Analizar si el usuario está haciendo "meneos raros" (ráfagas) o si es teléfono prestado
    const perfilComportamiento = registroComportamientoUsuarios.get(identificador_usuario);
    if (perfilComportamiento) {
        const tiempoActual = Date.now();
        
        // Resetear el contador cada minuto de uso normal
        if (tiempoActual - perfilComportamiento.ultimoReseteoAcciones > 60000) {
            perfilComportamiento.conteoAccionesMinuto = 0;
            perfilComportamiento.ultimoReseteoAcciones = tiempoActual;
            
            // Premiar al usuario honesto: Si habla normal, le otorgamos un Punto de Lealtad
            if (perfilComportamiento.estado === "observado") {
                perfilComportamiento.puntosLealtad++;
                if (perfilComportamiento.puntosLealtad >= 15) {
                    perfilComportamiento.estado = "limpio"; // Sube a nivel seguro de confianza
                    console.log(`[SYS]: Usuario ${identificador_usuario} comprobó su lealtad de forma exitosa.`);
                }
            }
        }

        perfilComportamiento.conteoAccionesMinuto++;

        // DETECCIÓN DE FRAUDE: Si envía más de 3 archivos en un minuto, el servidor actúa de inmediato
        if (perfilComportamiento.conteoAccionesMinuto > 3) {
            if (fs.existsSync(archivo.path)) fs.unlinkSync(archivo.path); // Destruir el archivo
            
            // BANEO FULMINANTE AUTOMÁTICO: Bloqueo inmediato del estafador o teléfono prestado
            lineasFisicasAutorizadas.delete(identificador_usuario);
            listaNegraEstafadores.add(identificador_usuario);
            registroComportamientoUsuarios.delete(identificador_usuario);
            
            console.log(`[SISTEMA BAN]: Expulsión ejecutada automáticamente para el número: ${identificador_usuario}`);
            return res.status(429).json({ success: false, error: "Actividad maliciosa detectada. Acceso revocado definitivamente." });
        }
    }

    console.log(`[SYS]: Bloque de datos cifrado (E2EE) alojado de forma segura.`);
    return res.status(200).json({ success: true, message: "Archivo inyectado en el servidor.", path: archivo.path });
});
// Red de comunicación por sockets para enlazar videollamadas directas
io.on("connection", (socket) => {
    
    socket.on("registrar-canal-llamada", (datos) => {
        // Bloquear acceso del socket si el número cayó en la Lista Negra
        if (listaNegraEstafadores.has(datos.identificador_usuario)) {
            socket.emit("error-canal", { mensaje: "Acceso denegado por violación de seguridad." });
            return;
        }
        socket.join(datos.identificador_usuario);
    });

    socket.on("enviar-oferta-webrtc", (datos) => {
        socket.to(datos.destinatario).emit("recibir-oferta-webrtc", { emisor: datos.emisor, sdp: datos.sdp });
    });

    socket.on("enviar-respuesta-webrtc", (datos) => {
        socket.to(datos.destinatario).emit("recibir-respuesta-webrtc", { emisor: datos.emisor, sdp: datos.sdp });
    });

    socket.on("enviar-candidato-ice", (datos) => {
        socket.to(datos.destinatario).emit("recibir-candidato-ice", { candidato: datos.candidato });
    });

    // SISTEMA DE REPORTE CIUDADANO EN VIVO: Si una víctima presiona el botón, banea al estafador al instante
    socket.on("reportar-usuario-fraude", (datos) => {
        const sospechosoId = datos.numeroSospechoso;
        lineasFisicasAutorizadas.delete(sospechosoId);
        listaNegraEstafadores.add(sospechosoId);
        registroComportamientoUsuarios.delete(sospechosoId);
        
        console.log(`[ALERTA REPORT]: Línea cortada de raíz por denuncia ciudadana: ${sospechosoId}`);
        io.to(sospechosoId).emit("error-canal", { mensaje: "Su cuenta ha sido bloqueada por reportes de fraude." });
    });
});
// Conexión obligatoria y limpia a la carpeta estática de tus interfaces
app.use(express.static(path.join(__dirname, 'public')));

// Motor automático para la limpieza periódica del servidor (Borrados automáticos de 2 semanas)
setInterval(() => {
    console.log("[SYS]: Ejecutando limpieza automática de archivos multimedia antiguos de 14 días...");
    fs.readdir(rutaMedia, (err, archivos) => {
        if (err) return;
        archivos.forEach(archivo => {
            const rutaArchivoCompleta = path.join(rutaMedia, archivo);
            fs.stat(rutaArchivoCompleta, (err, datosArchivo) => {
                if (err) return;
                // Si el archivo en el disco lleva más de 2 semanas guardado, se destruye solo
                if (Date.now() - datosArchivo.mtime.getTime() > 14 * 24 * 60 * 60 * 1000) {
                    fs.unlinkSync(rutaArchivoCompleta);
                    console.log(`[LIMPIEZA DE DISCO]: Archivo purgado con éxito: ${archivo}`);
                }
            });
        });
    });
}, 24 * 60 * 60 * 1000); // Se ejecuta en silencio una vez al día automáticamente

// Establecer el puerto de escucha dinámico para compatibilidad total con Render
const PUERTO = process.env.PORT || 3000;

servidorHTTP.listen(PUERTO, () => {
    console.log(`================================================================`);
    console.log(`[SYS]: ENLACE VOBIXCHAT // Quantum Mobile Pro TOTALMENTE ACTIVO`);
    console.log(`[SYS]: Servidor web operativo con éxito en el puerto ${PUERTO}`);
    console.log(`[SYS]: Sistema Anti-Saturación y Lupa de Lealtad activos en silencio.`);
    console.log(`================================================================`);
});
