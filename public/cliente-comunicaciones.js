// =================================================================
// WEBRTC BIDIRECCIONAL BLINDADO (CORRECCIÓN DE PANTALLA NEGRA)
// =================================================================

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

        // Añadir las pistas explícitamente y asegurar transceivers bidireccionales
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
