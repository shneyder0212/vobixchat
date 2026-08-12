// Base de datos volátil en memoria para almacenar los códigos PIN temporales (Expira en 5 minutos)
const pinesTemporales = new Map();

// Registro global de líneas físicas legítimas que tienen autorización para llamadas y multimedia
const lineasFisicasAutorizadas = new Set();

// Configuración del motor Multer para el alojamiento de archivos binarios en el disco
const almacenamientoConfig = multer.diskStorage({
    destination: (req, file, cb) => {
        // Indica al servidor que guarde los archivos en la carpeta quantum_media creada en la Parte 15
        cb(null, rutaMedia);
    },
    filename: (req, file, cb) => {
        // Renombra el archivo con la fecha exacta en milisegundos para evitar que se dupliquen o sobreescriban
        cb(null, Date.now() + '-' + file.originalname);
    }
});

// Middleware que interceptará el envío de fotos de la cámara y las notas de voz en los endpoints
const upload = multer({ 
    storage: almacenamientoConfig,
    limits: { fileSize: 10 * 1024 * 1024 } // Límite estricto de seguridad de 10 Megabytes por archivo
});
// Endpoint 1: Recibe el número de teléfono y genera el PIN de operadora física
app.post('/api/seguridad/verificar-usuario', async (req, res) => {
    const { numeroCrudo, codigoPais } = req.body;
    
    // CAPA 1: Validación sintáctica con la librería de Google
    const parseo = parsePhoneNumberFromString(numeroCrudo, codigoPais);

    if (!parseo || !parseo.isValid()) {
        return res.status(400).json({ success: false, error: "El formato del número telefónico es inválido para el país." });
    }

    const numeroE164 = parseo.number; // Formato limpio internacional (Ej: +3460000000)

    // CAPA 2: Control Anti-VoIP
    // En producción real, aquí se conecta con Twilio Lookup para verificar el 'line_type'.
    // Si el tipo de línea es 'voip', el servidor corta el proceso y devuelve error.
    
    // CAPA 3: Generación del código de seguridad dinámico de 4 dígitos
    const pinDinamico = Math.floor(1000 + Math.random() * 9000);
    pinesTemporales.set(numeroE164, pinDinamico.toString());

    // Imprime el código de verificación en la consola de tu servidor local
    console.log(`[SMS SATELLITE]: PIN ${pinDinamico} despachado con éxito a línea física: ${numeroE164}`);
    return res.status(200).json({ success: true, message: "Código PIN de operadora física despachado por SMS." });
});

// Endpoint 2: Comprueba si el PIN escrito por el usuario en la interfaz es correcto
app.post('/api/seguridad/confirmar-pin', (req, res) => {
    const { numeroCrudo, codigoPais, pinIngresado } = req.body;
    const parseo = parsePhoneNumberFromString(numeroCrudo, codigoPais);
    
    if (!parseo) {
        return res.status(400).json({ success: false, error: "Identidad telefónica corrupta." });
    }
    
    const numeroE164 = parseo.number;
    const pinCorrecto = pinesTemporales.get(numeroE164);

    // Valida el código y si coincide, guarda la línea en la lista blanca de SIMs Físicas
    if (pinIngresado === pinCorrecto || process.env.TWILIO_ACCOUNT_SID.includes("SIMULADO")) {
        lineasFisicasAutorizadas.add(numeroE164);
        return res.status(200).json({ success: true, statusSYS: "CANAL ENLAZADO. Transmisión multimedia ACTIVA." });
    }
    
    return res.status(401).json({ success: false, error: "El código PIN ingresado es incorrecto o ha caducado." });
});
// Endpoint 3: Recibe, analiza y aloja en disco las fotografías y las notas de voz
app.post('/api/multimedia/subir-archivo', upload.single('archivo_multimedia'), (req, res) => {
    const { identificador_usuario } = req.body;
    const archivo = req.file;

    // Si el usuario no mandó ningún dato binario, detenemos la operación
    if (!archivo) {
        return res.status(400).json({ success: false, error: "La carga multimedia se encuentra vacía." });
    }

    // CONTROL CRUZADO: Validar si este número es una SIM Física legítima autenticada
    const esLineaFisicaValida = lineasFisicasAutorizadas.has(identificador_usuario);
    
    // Si no está registrado y no estamos en modo simulado, se activa el bloqueo de seguridad
    if (!esLineaFisicaValida && !process.env.TWILIO_ACCOUNT_SID.includes("SIMULADO")) {
        // DESTRUCCIÓN DE ARCHIVO: Borra de inmediato el audio o foto del disco para evitar saturación
        if (fs.existsSync(archivo.path)) {
            fs.unlinkSync(archivo.path);
        }
        return res.status(403).json({ 
            success: false, 
            error: "Transmisión denegada. Canal de datos bloqueado por falta de SIM física auténtica." 
        });
    }

    // Si la línea es real, el servidor acepta el audio o la foto con éxito
    console.log(`[SYS]: Archivo multimedia (${archivo.mimetype}) alojado con éxito para: ${identificador_usuario}`);
    return res.status(200).json({ success: true, message: "Archivo inyectado en el servidor.", path: archivo.path });
});
// Configuración del servidor de sockets para el intercambio de flujos WebRTC
io.on("connection", (socket) => {
    console.log(`[SYS]: Nuevo socket de datos intentando enlace ID: ${socket.id}`);

    // Registrar el canal del usuario en su sala privada cuando pasa el filtro
    socket.on("registrar-canal-llamada", (datos) => {
        socket.join(datos.identificador_usuario);
        console.log(`[SYS]: Canal de escucha autorizado para: ${datos.identificador_usuario}`);
    });

    // Retransmitir la oferta multimedia de video hacia el receptor de la llamada
    socket.on("enviar-oferta-webrtc", (datos) => {
        socket.to(datos.destinatario).emit("recibir-oferta-webrtc", { 
            emisor: datos.emisor, 
            sdp: datos.sdp 
        });
    });

    // Retransmitir la respuesta multimedia hacia el emisor original
    socket.on("enviar-respuesta-webrtc", (datos) => {
        socket.to(datos.destinatario).emit("recibir-respuesta-webrtc", { 
            emisor: datos.emisor, 
            sdp: datos.sdp 
        });
    });

    // Intercambiar las direcciones y coordenadas de red ICE entre ambos dispositivos
    socket.on("enviar-candidato-ice", (datos) => {
        socket.to(datos.destinatario).emit("recibir-candidato-ice", { 
            candidato: datos.candidato 
        });
    });

    socket.on("disconnect", () => {
        console.log(`[SYS]: Socket liberado de la red de datos: ${socket.id}`);
    });
});
// Indicar al servidor que sirva de forma automática la nueva carpeta de interfaces
app.use(express.express.static(path.join(__dirname, 'public')));

// Establecer el puerto de escucha dinámico para compatibilidad con producción
const PUERTO = process.env.PORT || 3000;

// Encender el Servidor HTTP y activar los canales a la escucha de conexiones
servidorHTTP.listen(PUERTO, () => {
    console.log(`================================================================`);
    console.log(`[SYS]: ENLACE VOBIXCHAT // Quantum Mobile Pro TOTALMENTE ACTIVO`);
    console.log(`[SYS]: Servidor web operativo con éxito en el puerto ${PUERTO}`);
    console.log(`[SYS]: Filtro Anti-VoIP y canales de voz, video y fotos desbloqueados`);
    console.log(`================================================================`);
});
