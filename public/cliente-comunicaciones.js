// =================================================================
// ARCHIVO: cliente-comunicaciones.js (MAESTRO COMPLETO POR PARTES)
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
            document.getElementById('remote-video-display').srcObject = e.streams;
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
    window.socketLlamadas = io(window.location.origin);

    window.socketLlamadas.emit("registrar-canal-llamada", { 
        identificador_usuario: numeroUsuarioAutenticado 
    });

    window.socketLlamadas.on("error-canal", (error) => {
        alert(`Error de comunicación: ${error.mensaje}`);
        window.interrumpirYApagarCanales();
    });

    window.socketLlamadas.on("recibir-oferta-webrtc", async (datos) => {
        await window.procesarLlamadaEntrante(datos.emisor, datos.sdp);
    });

    window.socketLlamadas.on("recibir-candidato-ice", async (datos) => {
        if (window.conexionPeerCuantica) {
            await window.conexionPeerCuantica.addIceCandidate(new RTCIceCandidate(datos.candidato));
        }
    });
};
// Función que se activa cuando el usuario toma una foto con la cámara
function detectarSeleccionArchivo() {
    const inputArchivo = document.getElementById('input-archivo-cuantico');
    if (!inputArchivo.files || inputArchivo.files.length === 0) return;

    const archivoFotoCapturado = inputArchivo.files[0];
    document.getElementById('sys-status').style.color = "#00ffcc";
    document.getElementById('sys-status').innerText = "[SYS]: PROCESANDO TRANSMISIÓN BINARIA DE IMAGEN...";
    window.procesarCapturaCamaraYEnviar(archivoFotoCapturado);
}

window.procesarCapturaCamaraYEnviar = async function(archivoFotoBlob) {
    const formData = new FormData();
    formData.append("archivo_multimedia", archivoFotoBlob);
    formData.append("identificador_usuario", document.getElementById('phone-number').value.trim());

    try {
        const respuesta = await fetch('/api/multimedia/subir-archivo', { method: 'POST', body: formData });
        const data = await respuesta.json();
        if (data.success) {
            document.getElementById('sys-status').innerText = "[SYS]: ARCHIVO MULTIMEDIA TRANSMITIDO CON ÉXITO.";
            alert("Foto enviada correctamente.");
        } else {
            document.getElementById('sys-status').style.color = "#ff3366";
            document.getElementById('sys-status').innerText = `[SYS]: RECHAZO DE RED - ${data.error}`;
            if (data.error.includes("revocado")) window.interrumpirYApagarCanales();
        }
    } catch (err) {
        console.error(err);
    }
};

// VARIABLES GLOBALES PARA CONTROL DEL MICRÓFONO FÍSICO
let grabadorAudio = null;
let fragmentosAudio = [];
let temporizadorVoz = null;
let segundosGrabados = 0;

window.alternarEstadoNotaVoz = async function() {
    if (!grabadorAudio || grabadorAudio.state === "inactive") {
        try {
            const streamMic = await navigator.mediaDevices.getUserMedia({ audio: true });
            fragmentosAudio = [];
            grabadorAudio = new MediaRecorder(streamMic);

            grabadorAudio.ondataavailable = (evento) => {
                if (evento.data.size > 0) fragmentosAudio.push(evento.data);
            };

            grabadorAudio.onstop = async () => {
                if (fragmentosAudio.length === 0) return;
                const blobAudioFinal = new Blob(fragmentosAudio, { type: 'audio/webm' });
                await window.enviarNotaVozServidor(blobAudioFinal);
            };

            grabadorAudio.start();
            segundosGrabados = 0;
            document.getElementById('contador-tiempo-voz').innerText = "00:00";
            document.getElementById('contenedor-grabando-status').style.display = 'flex';
            document.getElementById('btn-borrar-nota').style.display = 'inline-block';
            document.getElementById('btn-microfono-disparador').style.backgroundColor = '#ff3366';

            // Reloj en vivo con Límite Estricto de 3 Minutos (180 segundos)
            temporizadorVoz = setInterval(() => {
                segundosGrabados++;
                
                if (segundosGrabados >= 180) {
                    // CORTAR AUTOMÁTICAMENTE AL LLEGAR A LOS 3 MINUTOS
                    window.detenerTemporizadorVoz();
                    grabadorAudio.stop();
                    window.restablecerInterfazVoz();
                    console.log("[SYS]: Límite de 3 minutos alcanzado. Grabación guardada.");
                    return;
                }

                const mins = String(Math.floor(segundosGrabados / 60)).padStart(2, '0');
                const segs = String(segundosGrabados % 60).padStart(2, '0');
                document.getElementById('contador-tiempo-voz').innerText = `${mins}:${segs}`;
            }, 1000);

        } catch (err) {
            alert("Error: No se pudo abrir el micrófono físico. Compruebe los permisos.");
        }
    } else {
        window.detenerTemporizadorVoz();
        grabadorAudio.stop();
        window.restablecerInterfazVoz();
    }
};
// Botón BORRAR que cancela, apaga el micrófono y vacía los datos sin colgar la interfaz
window.cancelarYBorrarNotaVoz = function() {
    if (grabadorAudio && grabadorAudio.state !== "inactive") {
        window.detenerTemporizadorVoz();
        fragmentosAudio = []; // Vaciar los fragmentos para que onstop no mande nada
        grabadorAudio.stream.getTracks().forEach(track => track.stop()); // Apagar micrófono físico
        grabadorAudio.stop();
        window.restablecerInterfazVoz();
        document.getElementById('sys-status').style.color = "#ff3366";
        document.getElementById('sys-status').innerText = "[SYS]: GRABACIÓN DE AUDIO CANCELADA Y PURGADA.";
    }
};

window.detenerTemporizadorVoz = function() {
    if (temporizadorVoz) {
        clearInterval(temporizadorVoz);
        temporizadorVoz = null;
    }
};

window.restablecerInterfazVoz = function() {
    document.getElementById('contenedor-grabando-status').style.display = 'none';
    document.getElementById('btn-borrar-nota').style.display = 'none';
    document.getElementById('btn-microfono-disparador').style.backgroundColor = '#00ffcc';
    document.getElementById('contador-tiempo-voz').innerText = "00:00";
};

window.enviarNotaVozServidor = async function(blobAudio) {
    const statusText = document.getElementById('sys-status');
    const formData = new FormData();
    formData.append("archivo_multimedia", blobAudio, "nota_voz.webm");
    formData.append("identificador_usuario", document.getElementById('phone-number').value.trim());

    try {
        statusText.style.color = "#00ffcc";
        statusText.innerText = "[SYS]: TRANSMITIENDO MENSAJE DE AUDIO AL CANAL...";
        
        const respuesta = await fetch('/api/multimedia/subir-archivo', { method: 'POST', body: formData });
        const data = await respuesta.json();

        if (data.success) {
            statusText.innerText = "[SYS]: NOTA DE VOZ ENVIADA CORRECTAMENTE.";
        } else {
            statusText.style.color = "#ff3366";
            statusText.innerText = `[SYS]: RECHAZO AUDIO - ${data.error}`;
            // Si el servidor lo baneó automáticamente por ráfagas de "meneos", colgamos la interfaz
            if (data.error.includes("revocado")) window.interrumpirYApagarCanales();
        }
    } catch (err) {
        console.error(err);
    }
};

// Protocolo de apagado completo de hardware para colgar llamadas y reiniciar la pantalla
window.interrumpirYApagarCanales = function() {
    window.detenerTemporizadorVoz();
    window.restablecerInterfazVoz();

    if (window.socketLlamadas) {
        window.socketLlamadas.disconnect();
        window.socketLlamadas = null;
    }

    const videoLocal = document.getElementById('local-video-preview');
    if (videoLocal && videoLocal.srcObject) {
        videoLocal.srcObject.getTracks().forEach(track => track.stop());
        videoLocal.srcObject = null;
    }

    const videoRemoto = document.getElementById('remote-video-display');
    if (videoRemoto && videoRemoto.srcObject) {
        videoRemoto.srcObject.getTracks().forEach(track => track.stop());
        videoRemoto.srcObject = null;
    }

    if (window.conexionPeerCuantica) {
        window.conexionPeerCuantica.close();
        window.conexionPeerCuantica = null;
    }

    document.getElementById('seccion-confirmacion').style.display = 'none';
    document.getElementById('modulo-marcado-cuantico').style.display = 'none';
    document.getElementById('modulo-captura-multimedia').style.display = 'none';
    document.getElementById('barra-mensajeria-inferior').style.display = 'none';
    document.getElementById('sms-pin-input').value = "";
    
    document.getElementById('sys-status').style.color = "#ff3366";
    document.getElementById('sys-status').innerText = "[SYS]: ENLACE TERMINADO. ESPERANDO CREDENCIALES DE USUARIO...";
};

function limpiarConsolaLogsLocal() {
    console.clear();
}
// SISTEMA DE REPORTE EN VIVO SECO Y DIRECTO (Última línea del archivo, cierra el script)
window.ejecutarReporteCiudadanoFraude = function() {
    const numeroSospechoso = document.getElementById('numero-destino-input').value.trim();
    
    if (!numeroSospechoso) {
        alert("No hay ningún número digitado en el marcador para reportar.");
        return;
    }

    const confirmar = confirm(`¿Está seguro de que desea reportar el número ${numeroSospechoso} por actividad fraudulenta o uso indebido?`);
    
    if (confirmar) {
        if (window.socketLlamadas) {
            // Despachar la señal de expulsión inmediata al servidor mediante el WebSocket
            window.socketLlamadas.emit("reportar-usuario-fraude", {
                numeroSospechoso: numeroSospechoso
            });
            
            document.getElementById('sys-status').style.color = "#ff3366";
            document.getElementById('sys-status').innerText = `[SYS]: REPORTE ENVIADO. LÍNEA ${numeroSospechoso} EXPULSADA DE LA RED.`;
            
            // Colgar nuestra propia llamada de inmediato por seguridad
            window.interrumpirYApagarCanales();
            alert("El número ha sido reportado y bloqueado del sistema.");
        }
    }
};
