// =================================================================
// ARCHIVO: cliente-comunicaciones.js (SECCIÓN 1 - VERIFICADO)
// =================================================================

// Función para enviar el número de teléfono móvil al servidor backend
async function enviarIdentidadUsuario() {
    const codigoPais = document.getElementById('country-code').value;
    const numeroCrudo = document.getElementById('phone-number').value.trim();
    const statusText = document.getElementById('sys-status');

    // Validación básica en el navegador antes de consumir recursos de red
    if (!numeroCrudo) {
        statusText.style.color = "#ff3366";
        statusText.innerText = "[SYS]: ERROR - INTRODUZCA UN NÚMERO VÁLIDO.";
        return;
    }

    statusText.style.color = "#00ffcc";
    statusText.innerText = "[SYS]: ANALIZANDO LÍNEA TELEFÓNICA EN TIEMPO REAL...";

    try {
        // Petición segura a la API de tu servidor Node.js
        const respuesta = await fetch('/api/seguridad/verificar-usuario', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ numeroCrudo, codigoPais })
        });
        const resultado = await respuesta.json();

        if (resultado.success) {
            statusText.style.color = "#00ffcc";
            statusText.innerText = `[SYS]: ${resultado.message}`;
            // Desplegar visiblemente el cuadro para introducir el PIN SMS
            document.getElementById('seccion-confirmacion').style.display = 'block';
        } else {
            statusText.style.color = "#ff3366";
            statusText.innerText = `[SYS]: ACCESO DENEGADO - ${resultado.error}`;
        }
    } catch (err) {
        statusText.style.color = "#ff3366";
        statusText.innerText = "[SYS]: ERROR CRÍTICO EN LA CONEXIÓN CUÁNTICA.";
    }
}
// Función para verificar el código PIN enviado por SMS al teléfono físico
async function confirmarEnlaceSeguro() {
    const numeroCrudo = document.getElementById('phone-number').value.trim();
    const codigoPais = document.getElementById('country-code').value;
    const pinIngresado = document.getElementById('sms-pin-input').value.trim();
    const statusText = document.getElementById('sys-status');

    try {
        // Enviar el PIN al servidor mediante una petición POST segura
        const respuesta = await fetch('/api/seguridad/confirmar-pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ numeroCrudo, codigoPais, pinIngresado })
        });
        const resultado = await respuesta.json();

        if (resultado.success) {
            statusText.style.color = "#00ffcc";
            statusText.innerText = `[SYS]: ${resultado.statusSYS}`;
            // Si el PIN es correcto, se desbloquean las funciones del chat
            desbloquearFuncionesMultimedia();
        } else {
            statusText.style.color = "#ff3366";
            statusText.innerText = `[SYS]: ERROR - ${resultado.error}`;
        }
    } catch (err) {
        statusText.style.color = "#ff3366";
        statusText.innerText = "[SYS]: ERROR AL PROCESAR EL ENLACE SEGURO.";
    }
}
// Función para mostrar los paneles ocultos una vez validado el PIN físico
function desbloquearFuncionesMultimedia() {
    console.log("[SYS]: Inicializando todas las capas de hardware multimedia...");
    const miNumeroVerificado = document.getElementById('phone-number').value.trim();

    // Cambiar el estado visual de los contenedores HTML ocultos a modo visible
    document.getElementById('modulo-marcado-cuantico').style.display = 'block';
    document.getElementById('modulo-captura-multimedia').style.display = 'block';
    document.getElementById('barra-mensajeria-inferior').style.display = 'flex';

    // Conectar el WebSocket del cliente para la señalización en tiempo real
    window.conectarClienteSignaling(miNumeroVerificado);
}
// Función que se activa al presionar el botón "LLAMAR" desde la interfaz visual
function ejecutarMarcadoDesdeHUD() {
    const numeroDestino = document.getElementById('numero-destino-input').value.trim();
    const statusText = document.getElementById('sys-status');

    if (!numeroDestino) {
        statusText.style.color = "#ff3366";
        statusText.innerText = "[SYS]: ERROR - INGRESE UN DESTINATARIO VÁLIDO.";
        return;
    }

    statusText.style.color = "#00ffcc";
    statusText.innerText = "[SYS]: ENLACE CON EL DESTINATARIO SOLICITADO...";
    window.iniciarEnlaceLlamadaUsuario(numeroDestino);
}

// Función maestra para activar WebRTC local y despachar la oferta multimedia
window.iniciarEnlaceLlamadaUsuario = async function(numeroDestinatario) {
    const miNumero = document.getElementById('phone-number').value.trim();

    try {
        // Solicitar acceso físico a los sensores de audio y video del dispositivo
        const streamCam = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        document.getElementById('local-video-preview').srcObject = streamCam;

        // Configurar la instancia del canal de comunicación directa Peer-to-Peer
        window.conexionPeerCuantica = new RTCPeerConnection({ iceServers: [{ urls: 'stun:://google.com' }] });
        streamCam.getTracks().forEach(track => window.conexionPeerCuantica.addTrack(track, streamCam));

        // Evento que recibe y renderiza el video de la otra persona en pantalla
        window.conexionPeerCuantica.ontrack = (e) => {
            document.getElementById('remote-video-display').srcObject = e.streams[0];
        };

        // Evento para recopilar y despachar las coordenadas de red locales (ICE)
        window.conexionPeerCuantica.onicecandidate = (e) => {
            if (e.candidate && window.socketLlamadas) {
                window.socketLlamadas.emit("enviar-candidato-ice", { 
                    destinatario: numeroDestinatario, 
                    candidato: e.candidate 
                });
            }
        };

        // Crear la propuesta formal de conexión y registrarla localmente
        const oferta = await window.conexionPeerCuantica.createOffer();
        await window.conexionPeerCuantica.setLocalDescription(oferta);
        
        // Enviar la oferta al servidor de señalización para que localice al receptor
        window.socketLlamadas.emit("enviar-oferta-webrtc", { 
            destinatario: numeroDestinatario, 
            emisor: miNumero, 
            sdp: oferta 
        });

        // Activar la escucha de la respuesta en el terminal emisor
        window.escucharRespuestaLlamadaEmisor();

    } catch (err) {
        console.error("[SYS]: Fallo de hardware en los canales de llamada:", err);
        document.getElementById('sys-status').innerText = "[SYS]: ERROR - COMPRUEBE PERMISOS DE CÁMARA.";
    }
};
// Función para procesar y contestar una videollamada entrante de otro usuario
window.procesarLlamadaEntrante = async function(emisorId, sdpOferta) {
    try {
        // Encender la cámara y micrófono locales para que el emisor nos vea
        const streamCam = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        document.getElementById('local-video-preview').srcObject = streamCam;

        // Configurar la conexión Peer-to-Peer del receptor
        window.conexionPeerCuantica = new RTCPeerConnection({ iceServers: [{ urls: 'stun:://google.com' }] });
        streamCam.getTracks().forEach(track => window.conexionPeerCuantica.addTrack(track, streamCam));

        // Renderizar el video del emisor cuando empiece a llegar la señal
        window.conexionPeerCuantica.ontrack = (e) => {
            document.getElementById('remote-video-display').srcObject = e.streams;
        };

        // Despachar nuestros candidatos de red hacia el emisor remoto
        window.conexionPeerCuantica.onicecandidate = (e) => {
            if (e.candidate) {
                window.socketLlamadas.emit("enviar-candidato-ice", { destinatario: emisorId, candidato: e.candidate });
            }
        };

        // Asentar la oferta remota del emisor y generar nuestra respuesta (Answer)
        await window.conexionPeerCuantica.setRemoteDescription(new RTCSessionDescription(sdpOferta));
        const respuesta = await window.conexionPeerCuantica.createAnswer();
        await window.conexionPeerCuantica.setLocalDescription(respuesta);

        // Devolver la respuesta de red a través del servidor de señalización
        window.socketLlamadas.emit("enviar-respuesta-webrtc", {
            destinatario: emisorId,
            emisor: document.getElementById('phone-number').value.trim(),
            sdp: respuesta
        });

    } catch (err) {
        console.error("[SYS]: Fallo al recibir o sincronizar llamada:", err);
    }
};

// Función para que el emisor escuche y guarde la respuesta del receptor
window.escucharRespuestaLlamadaEmisor = function() {
    if (!window.socketLlamadas) return;
    
    window.socketLlamadas.on("recibir-respuesta-webrtc", async (datos) => {
        if (window.conexionPeerCuantica) {
            // Conectar el enlace final para que el video empiece a fluir
            await window.conexionPeerCuantica.setRemoteDescription(new RTCSessionDescription(datos.sdp));
            console.log("[SYS]: Enlace WebRTC sincronizado en ambos extremos.");
        }
    });
};
// Función para abrir la conexión en tiempo real del usuario con el servidor
window.conectarClienteSignaling = function(numeroUsuarioAutenticado) {
    // Abrir el túnel de sockets hacia el dominio base del servidor
    window.socketLlamadas = io(window.location.origin);

    // Registrar de inmediato nuestra identidad para pasar el control anti-VoIP
    window.socketLlamadas.emit("registrar-canal-llamada", { 
        identificador_usuario: numeroUsuarioAutenticado 
    });

    // Escuchar si el servidor rechaza nuestra línea por falta de SIM física
    window.socketLlamadas.on("error-canal", (error) => {
        alert(`Error de comunicación: ${error.mensaje}`);
        window.interrumpirYApagarCanales();
    });

    // Escuchar si entra una oferta de videollamada desde el exterior
    window.socketLlamadas.on("recibir-oferta-webrtc", async (datos) => {
        await window.procesarLlamadaEntrante(datos.emisor, datos.sdp);
    });

    // Escuchar y añadir las coordenadas de red ICE del otro usuario
    window.socketLlamadas.on("recibir-candidato-ice", async (datos) => {
        if (window.conexionPeerCuantica) {
            await window.conexionPeerCuantica.addIceCandidate(new RTCIceCandidate(datos.candidato));
        }
    });
};
// Función que se activa cuando el usuario toma una foto con la cámara
function detectarSeleccionArchivo() {
    const inputArchivo = document.getElementById('input-archivo-cuantico');
    const statusText = document.getElementById('sys-status');

    // Si el usuario cancela la cámara o no elige nada, nos detenemos
    if (!inputArchivo.files || inputArchivo.files.length === 0) {
        return;
    }

    const archivoFotoCapturado = inputArchivo.files[0];
    statusText.style.color = "#00ffcc";
    statusText.innerText = "[SYS]: PROCESANDO TRANSMISIÓN BINARIA DE IMAGEN...";
    
    // Invocar el motor de envío seguro enviando el archivo real
    window.procesarCapturaCamaraYEnviar(archivoFotoCapturado);
}

// Función maestra para empaquetar la foto y despacharla al servidor
window.procesarCapturaCamaraYEnviar = async function(archivoFotoBlob) {
    const formData = new FormData();
    // Adjuntar el archivo binario real de la imagen y la identidad del usuario
    formData.append("archivo_multimedia", archivoFotoBlob);
    formData.append("identificador_usuario", document.getElementById('phone-number').value.trim());

    try {
        const respuesta = await fetch('/api/multimedia/subir-archivo', {
            method: 'POST',
            body: formData
        });
        const data = await respuesta.json();
        const statusText = document.getElementById('sys-status');

        if (data.success) {
            statusText.style.color = "#00ffcc";
            statusText.innerText = "[SYS]: ARCHIVO MULTIMEDIA TRANSMITIDO CON ÉXITO.";
            alert("Foto enviada correctamente.");
        } else {
            statusText.style.color = "#ff3366";
            statusText.innerText = `[SYS]: RECHAZO DE RED - ${data.error}`;
        }
    } catch (err) {
        console.error("[SYS]: Falla en la subida binaria de la imagen.");
    }
};

// Función auxiliar para limpiar la consola visual de la interfaz
function limpiarConsolaLogsLocal() {
    document.getElementById('sys-status').style.color = "#00ffcc";
    document.getElementById('sys-status').innerText = "[SISTEMA]: LOGS LOCALES DEPURADOS.";
    console.clear();
}
// VARIABLES GLOBALES PARA CONTROL DEL MICRÓFONO FISICO
let grabadorAudio = null;
let fragmentosAudio = [];
let temporizadorVoz = null;
let segundosGrabados = 0;

// Función para activar o desactivar el micrófono al pulsar el icono
window.alternarEstadoNotaVoz = async function() {
    if (!grabadorAudio || grabadorAudio.state === "inactive") {
        // ACCIÓN: INICIAR GRABACIÓN DE AUDIO
        try {
            const streamMic = await navigator.mediaDevices.getUserMedia({ audio: true });
            fragmentosAudio = [];
            grabadorAudio = new MediaRecorder(streamMic);

            // Guardar las ráfagas de sonido a medida que entran por el hardware
            grabadorAudio.ondataavailable = (evento) => {
                if (evento.data.size > 0) fragmentosAudio.push(evento.data);
            };

            // Evento que se ejecuta al detener el micrófono
            grabadorAudio.onstop = async () => {
                // Si el usuario pulsó BORRAR, el arreglo estará vacío y no enviará nada
                if (fragmentosAudio.length === 0) return;

                const blobAudioFinal = new Blob(fragmentosAudio, { type: 'audio/webm' });
                await window.enviarNotaVozServidor(blobAudioFinal);
            };

            grabadorAudio.start();
            
            // Ajustar visualmente la barra inferior tal como se ve en tu foto
            segundosGrabados = 0;
            document.getElementById('contador-tiempo-voz').innerText = "00:00";
            document.getElementById('contenedor-grabando-status').style.display = 'flex';
            document.getElementById('btn-borrar-nota').style.display = 'inline-block';
            document.getElementById('btn-microfono-disparador').style.backgroundColor = '#ff3366';

            // Actualizar el segundero en tiempo real
            temporizadorVoz = setInterval(() => {
                segundosGrabados++;
                const mins = String(Math.floor(segundosGrabados / 60)).padStart(2, '0');
                const segs = String(segundosGrabados % 60).padStart(2, '0');
                document.getElementById('contador-tiempo-voz').innerText = `${mins}:${segs}`;
            }, 1000);

            console.log("[SYS]: Micrófono abierto. Grabación en curso...");
        } catch (err) {
            alert("Error: No se pudo abrir el micrófono físico. Compruebe los permisos.");
        }
    } else {
        // ACCIÓN: DETENER MICRÓFONO Y DESPACHAR AUDIO
        window.detenerTemporizadorVoz();
        grabadorAudio.stop();
        window.restablecerInterfazVoz();
    }
};

// Función para el botón BORRAR que cancela y destruye la grabación de inmediato
window.cancelarYBorrarNotaVoz = function() {
    if (grabadorAudio && grabadorAudio.state !== "inactive") {
        window.detenerTemporizadorVoz();
        fragmentosAudio = []; // Vaciamos los datos para abortar el guardado
        grabadorAudio.stream.getTracks().forEach(track => track.stop()); // Apagar micrófono
        grabadorAudio.stop();
        window.restablecerInterfazVoz();
        document.getElementById('sys-status').style.color = "#ff3366";
        document.getElementById('sys-status').innerText = "[SYS]: GRABACIÓN DE AUDIO CANCELADA Y PURGADA.";
    }
};

// Detener el conteo numérico de la pantalla
window.detenerTemporizadorVoz = function() {
    if (temporizadorVoz) {
        clearInterval(temporizadorVoz);
        temporizadorVoz = null;
    }
};

// Ocultar la alerta roja de grabación y regresar el icono a verde cian
window.restablecerInterfazVoz = function() {
    document.getElementById('contenedor-grabando-status').style.display = 'none';
    document.getElementById('btn-borrar-nota').style.display = 'none';
    document.getElementById('btn-microfono-disparador').style.backgroundColor = '#00ffcc';
    document.getElementById('contador-tiempo-voz').innerText = "00:00";
};

// Despachar el archivo de audio real capturado hacia tu servidor API
window.enviarNotaVozServidor = async function(blobAudio) {
    const statusText = document.getElementById('sys-status');
    const formData = new FormData();
    formData.append("archivo_multimedia", blobAudio, "nota_voz.webm");
    formData.append("identificador_usuario", document.getElementById('phone-number').value.trim());

    try {
        statusText.style.color = "#00ffcc";
        statusText.innerText = "[SYS]: TRANSMITIENDO MENSAJE DE AUDIO AL CANAL...";
        
        const respuesta = await fetch('/api/multimedia/subir-archivo', {
            method: 'POST',
            body: formData
        });
        const data = await respuesta.json();

        if (data.success) {
            statusText.innerText = "[SYS]: NOTA DE VOZ ENVIADA CORRECTAMENTE.";
        } else {
            statusText.style.color = "#ff3366";
            statusText.innerText = `[SYS]: RECHAZO AUDIO - ${data.error}`;
        }
    } catch (err) {
        console.error("[SYS]: Error crítico en el canal de datos de voz.");
    }
};
// Función maestra para apagar todos los canales físicos y resetear la pantalla
window.interrumpirYApagarCanales = function() {
    console.log("[SYS]: Protocolo de apagado general en ejecucion...");

    // 1. Detener los relojes y limpiar la barra de notas de voz
    window.detenerTemporizadorVoz();
    window.restablecerInterfazVoz();
    document.getElementById('barra-mensajeria-inferior').style.display = 'none';

    // 2. Cortar la conexión del Socket de Red
    if (window.socketLlamadas) {
        window.socketLlamadas.disconnect();
        window.socketLlamadas = null;
    }

    // 3. Apagar físicamente los sensores de tu propia cámara
    const videoLocal = document.getElementById('local-video-preview');
    if (videoLocal && videoLocal.srcObject) {
        videoLocal.srcObject.getTracks().forEach(track => track.stop());
        videoLocal.srcObject = null;
    }

    // 4. Apagar los sensores del video de la otra persona y cerrar WebRTC
    const videoRemoto = document.getElementById('remote-video-display');
    if (videoRemoto && videoRemoto.srcObject) {
        videoRemoto.srcObject.getTracks().forEach(track => track.stop());
        videoRemoto.srcObject = null;
    }

    if (window.conexionPeerCuantica) {
        window.conexionPeerCuantica.close();
        window.conexionPeerCuantica = null;
    }

    // 5. Ocultar los módulos y restaurar los mensajes a modo de espera
    document.getElementById('seccion-confirmacion').style.display = 'none';
    document.getElementById('modulo-marcado-cuantico').style.display = 'none';
    document.getElementById('modulo-captura-multimedia').style.display = 'none';
    document.getElementById('sms-pin-input').value = "";
    
    const statusText = document.getElementById('sys-status');
    statusText.style.color = "#ff3366";
    statusText.innerText = "[SYS]: ENLACE TERMINADO. ESPERANDO CREDENCIALES DE USUARIO...";
};
