// =================================================================
// ARCHIVO: cliente-comunicaciones.js (MAESTRO COMPLETO Y CORREGIDO)
// =================================================================

async function enviarIdentidadUsuario() {
    const codigoPais = document.getElementById('country-code').value;
    const numeroCrudo = document.getElementById('phone-number').value.trim();
    const statusText = document.getElementById('sys-status');

    if (!numeroCrudo) {
        statusText.style.color = "#ff3366";
        statusText.innerText = "[SYS]: ERROR - INTRODUZCA UN NÚMERO VÁLIDO.";
        return;
    }

    statusText.style.color = "#00ffcc";
    statusText.innerText = "[SYS]: ANALIZANDO LÍNEA TELEFÓNICA EN TIEMPO REAL...";

    try {
        const respuesta = await fetch('/api/seguridad/verificar-usuario', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ numeroCrudo, codigoPais })
        });
        const resultado = await respuesta.json();

        if (resultado.success) {
            statusText.style.color = "#00ffcc";
            statusText.innerText = `[SYS]: ${resultado.message}`;
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

async function confirmarEnlaceSeguro() {
    const numeroCrudo = document.getElementById('phone-number').value.trim();
    const codigoPais = document.getElementById('country-code').value;
    const pinIngresado = document.getElementById('sms-pin-input').value.trim();
    const statusText = document.getElementById('sys-status');

    try {
        const respuesta = await fetch('/api/seguridad/confirmar-pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ numeroCrudo, codigoPais, pinIngresado })
        });
        const resultado = await respuesta.json();

        if (resultado.success) {
            statusText.style.color = "#00ffcc";
            statusText.innerText = `[SYS]: ${resultado.statusSYS}`;
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

function desbloquearFuncionesMultimedia() {
    console.log("[SYS]: Inicializando capas de hardware multimedia...");
    const miNumeroVerificado = document.getElementById('phone-number').value.trim();

    document.getElementById('modulo-marcado-cuantico').style.display = 'block';
    document.getElementById('modulo-captura-multimedia').style.display = 'block';
    document.getElementById('barra-mensajeria-inferior').style.display = 'flex';

    window.conectarClienteSignaling(miNumeroVerificado);
}

function ejecutarMarcadoFromHUD() {
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

// WEBRTC BIDIRECCIONAL BLINDADO (CORRECCIÓN DE PANTALLA NEGRA)
window.iniciarEnlaceLlamadaUsuario = async function(numeroDestinatario) {
    const miNumero = document.getElementById('phone-number').value.trim();

    try {
        const streamCam = await navigator.mediaDevices.getUserMedia({ 
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, 
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } 
        });
        
        const videoLocal = document.getElementById('local-video-preview');
        videoLocal.srcObject = streamCam;
        await videoLocal.play().catch(e => console.log("Play local error:", e));

        const confServidoresIce = { 
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ] 
        };

        window.conexionPeerCuantica = new RTCPeerConnection(confServidoresIce);

        streamCam.getTracks().forEach(track => {
            window.conexionPeerCuantica.addTrack(track, streamCam);
        });

        window.conexionPeerCuantica.ontrack = (e) => {
            console.log("[SYS]: Track remoto recibido con éxito:", e.streams);
            const videoRemoto = document.getElementById('remote-video-display');
            if (e.streams && e.streams[0]) {
                videoRemoto.srcObject = e.streams[0];
                videoRemoto.play().catch(err => console.log("Error al reproducir video remoto:", err));
            }
        };

        window.conexionPeerCuantica.onicecandidate = (e) => {
            if (e.candidate && window.socketLlamadas) {
                window.socketLlamadas.emit("enviar-candidato-ice", { 
                    destinatario: numeroDestinatario, 
                    candidato: e.candidate 
                });
            }
        };

        const oferta = await window.conexionPeerCuantica.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        await window.conexionPeerCuantica.setLocalDescription(oferta);
        
        window.socketLlamadas.emit("enviar-oferta-webrtc", { 
            destinatario: numeroDestinatario, 
            emisor: miNumero, 
            sdp: oferta 
        });

        window.escucharRespuestaLlamadaEmisor();

    } catch (err) {
        console.error("[SYS]: Fallo de hardware en los canales de llamada:", err);
        document.getElementById('sys-status').innerText = "[SYS]: ERROR - COMPRUEBE PERMISOS DE CÁMARA O MICRÓFONO.";
    }
};

window.procesarLlamadaEntrante = async function(emisorId, sdpOferta) {
    try {
        const streamCam = await navigator.mediaDevices.getUserMedia({ 
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, 
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } 
        });
        
        const videoLocal = document.getElementById('local-video-preview');
        videoLocal.srcObject = streamCam;
        await videoLocal.play().catch(e => console.log("Play local error:", e));

        const confServidoresIce = { 
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ] 
        };

        window.conexionPeerCuantica = new RTCPeerConnection(confServidoresIce);

        streamCam.getTracks().forEach(track => {
            window.conexionPeerCuantica.addTrack(track, streamCam);
        });

        window.conexionPeerCuantica.ontrack = (e) => {
            console.log("[SYS]: Track remoto entrante recibido:", e.streams);
            const videoRemoto = document.getElementById('remote-video-display');
            if (e.streams && e.streams[0]) {
                videoRemoto.srcObject = e.streams[0];
                videoRemoto.play().catch(err => console.log("Error al reproducir video remoto:", err));
            }
        };

        window.conexionPeerCuantica.onicecandidate = (e) => {
            if (e.candidate) {
                window.socketLlamadas.emit("enviar-candidato-ice", { destinatario: emisorId, candidato: e.candidate });
            }
        };

        await window.conexionPeerCuantica.setRemoteDescription(new RTCSessionDescription(sdpOferta));
        const respuesta = await window.conexionPeerCuantica.createAnswer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        await window.conexionPeerCuantica.setLocalDescription(respuesta);

        window.socketLlamadas.emit("enviar-respuesta-webrtc", {
            destinatario: emisorId,
            emisor: document.getElementById('phone-number').value.trim(),
            sdp: respuesta
        });

    } catch (err) {
        console.error("[SYS]: Fallo al recibir o sincronizar llamada:", err);
    }
};

window.escucharRespuestaLlamadaEmisor = function() {
    if (!window.socketLlamadas) return;
    window.socketLlamadas.on("recibir-respuesta-webrtc", async (datos) => {
        if (window.conexionPeerCuantica) {
            await window.conexionPeerCuantica.setRemoteDescription(new RTCSessionDescription(datos.sdp));
            console.log("[SYS]: Enlace WebRTC sincronizado correctamente.");
        }
    });
};

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

function detectarSeleccionArchivo() {
    const inputArchivo = document.getElementById('input-archivo-cuantico');
    if (!inputArchivo.files || inputArchivo.files.length === 0) return;
    const archivoFotoCapturado = inputArchivo.files[0];
    document.getElementById('sys-status').style.color = "#00ffcc";
    document.getElementById('sys-status').innerText = "[SYS]: PROCESANDO IMAGEN...";
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
            document.getElementById('sys-status').innerText = "[SYS]: ARCHIVO TRANSMITIDO CON ÉXITO.";
            alert("Foto enviada correctamente.");
        } else {
            document.getElementById('sys-status').style.color = "#ff3366";
            document.getElementById('sys-status').innerText = `[SYS]: RECHAZO DE RED - ${data.error}`;
        }
    } catch (err) { console.error(err); }
};

// GESTIÓN DE NOTAS DE VOZ
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

            temporizadorVoz = setInterval(() => {
                segundosGrabados++;
                if (segundosGrabados >= 180) {
                    window.detenerTemporizadorVoz();
                    grabadorAudio.stop();
                    window.restablecerInterfazVoz();
                    return;
                }
                const mins = String(Math.floor(segundosGrabados / 60)).padStart(2, '0');
                const segs = String(segundosGrabados % 60).padStart(2, '0');
                document.getElementById('contador-tiempo-voz').innerText = `${mins}:${segs}`;
            }, 1000);

        } catch (err) { alert("Error: No se pudo abrir el micrófono."); }
    } else {
        window.detenerTemporizadorVoz();
        grabadorAudio.stop();
        window.restablecerInterfazVoz();
    }
};

window.cancelarYBorrarNotaVoz = function() {
    if (grabadorAudio && grabadorAudio.state !== "inactive") {
        window.detenerTemporizadorVoz();
        fragmentosAudio = [];
        grabadorAudio.stream.getTracks().forEach(track => track.stop());
        grabadorAudio.stop();
        window.restablecerInterfazVoz();
    }
};

window.detenerTemporizadorVoz = function() {
    if (temporizadorVoz) { clearInterval(temporizadorVoz); temporizadorVoz = null; }
};

window.restablecerInterfazVoz = function() {
    document.getElementById('contenedor-grabando-status').style.display = 'none';
    document.getElementById('btn-borrar-nota').style.display = 'none';
    document.getElementById('btn-microfono-disparador').style.backgroundColor = 'transparent';
    document.getElementById('contador-tiempo-voz').innerText = "00:00";
};

window.enviarNotaVozServidor = async function(blobAudio) {
    const formData = new FormData();
    formData.append("archivo_multimedia", blobAudio, "nota_voz.webm");
    formData.append("identificador_usuario", document.getElementById('phone-number').value.trim());

    try {
        await fetch('/api/multimedia/subir-archivo', { method: 'POST', body: formData });
    } catch (err) { console.error(err); }
};

window.interrumpirYApagarCanales = function() {
    window.detenerTemporizadorVoz();
    window.restablecerInterfazVoz();
    if (window.socketLlamadas) { window.socketLlamadas.disconnect(); window.socketLlamadas = null; }
    
    const vLocal = document.getElementById('local-video-preview');
    if (vLocal && vLocal.srcObject) { vLocal.srcObject.getTracks().forEach(t => t.stop()); vLocal.srcObject = null; }
    
    const vRem = document.getElementById('remote-video-display');
    if (vRem && vRem.srcObject) { vRem.srcObject.getTracks().forEach(t => t.stop()); vRem.srcObject = null; }
    
    if (window.conexionPeerCuantica) { window.conexionPeerCuantica.close(); window.conexionPeerCuantica = null; }

    document.getElementById('seccion-confirmacion').style.display = 'none';
    document.getElementById('modulo-marcado-cuantico').style.display = 'none';
    document.getElementById('modulo-captura-multimedia').style.display = 'none';
    document.getElementById('barra-mensajeria-inferior').style.display = 'none';
    document.getElementById('sys-status').innerText = "[SYS]: ENLACE TERMINADO.";
};

function limpiarConsolaLogsLocal() { console.clear(); }

// FUNCIONES DE LA BURBUJA FLOTANTE Y EL TECLADO MODERNO
function toggleBurbujaHerramientas() {
    const burbuja = document.getElementById("burbujaHerramientas");
    burbuja.classList.toggle("active");
    if (!burbuja.classList.contains("active")) {
        document.getElementById("panelEmojis").classList.remove("active");
    }
}

function togglePanelEmojis() {
    document.getElementById("panelEmojis").classList.toggle("active");
}

function insertarEmoji(emoji) {
    const input = document.getElementById("mensajeChatInput");
    input.value += emoji;
    input.focus();
}

function enviarMensajeChatTexto() {
    const input = document.getElementById("mensajeChatInput");
    const texto = input.value.trim();
    if (!texto) return;
    console.log("[SYS]: Mensaje escrito: ", texto);
    input.value = "";
    document.getElementById("burbujaHerramientas").classList.remove("active");
    document.getElementById("panelEmojis").classList.remove("active");
}

function procesarArchivoExtraSeleccionado(input) {
    if (!input.files || !input.files[0]) return;
    alert(`Archivo seleccionado: ${input.files[0].name}`);
}
