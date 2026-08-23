// Función maestra para activar WebRTC local y despachar la oferta multimedia
window.iniciarEnlaceLlamadaUsuario = async function(numeroDestinatario) {
    const miNumero = document.getElementById('phone-number').value.trim();

    try {
        // Solicitar acceso a sensores con supresión de eco y ganancia automática para voz impecable
        const streamCam = await navigator.mediaDevices.getUserMedia({ 
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, 
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } 
        });
        document.getElementById('local-video-preview').srcObject = streamCam;

        // Servidores STUN reales y limpios de Google para atravesar cualquier red móvil o router
        const configuracionICE = { 
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ] 
        };

        window.conexionPeerCuantica = new RTCPeerConnection(configuracionICE);
        streamCam.getTracks().forEach(track => window.conexionPeerCuantica.addTrack(track, streamCam));

        // CORRECCIÓN CRÍTICA: Capturar correctamente el stream remoto en el índice [0]
        window.conexionPeerCuantica.ontrack = (e) => {
            const videoRemoto = document.getElementById('remote-video-display');
            if (e.streams && e.streams[0]) {
                videoRemoto.srcObject = e.streams[0];
                videoRemoto.play().catch(err => console.log("Error al reproducir video remoto:", err));
            }
        };

        window.conexionPeerCuantica.onicecandidate = (e) => {
            if (e.candidate && window.socketLlamadas) {
                window.socketLlamadas.emit("enviar-candidato-ice", { 
                    destinatorio: numeroDestinatario, 
                    candidato: e.candidate 
                });
            }
        };

        const oferta = await window.conexionPeerCuantica.createOffer();
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

// Función para procesar y contestar llamadas entrantes con sincronización total
window.procesarLlamadaEntrante = async function(emisorId, sdpOferta) {
    try {
        const streamCam = await navigator.mediaDevices.getUserMedia({ 
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, 
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } 
        });
        document.getElementById('local-video-preview').srcObject = streamCam;

        const configuracionICE = { 
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ] 
        };

        window.conexionPeerCuantica = new RTCPeerConnection(configuracionICE);
        streamCam.getTracks().forEach(track => window.conexionPeerCuantica.addTrack(track, streamCam));

        window.conexionPeerCuantica.ontrack = (e) => {
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
        const respuesta = await window.conexionPeerCuantica.createAnswer();
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
