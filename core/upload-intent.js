/**
 * VOBIXCHAT - MOTOR DE TRANSFERENCIA EN BLOQUES (CAPA C4.2)
 * Arquitectura de subida segmentada (Chunking) para archivos pesados de hasta 2GB.
 * Protege la memoria RAM del servidor central delegando el almacenamiento P2P/Cloud.
 */

class VobixChunkedUploader {
    constructor(configuration = {}) {
        // Bloques estándar de 5MB para transferencias fluidas en redes móviles 4G/5G
        this.chunkSize = configuration.chunkSize || 5 * 1024 * 1024; 
        this.activeUploads = new Map(); // uploadId -> { file, progress, aborted }
    }

    /**
     * Inicializa una sesión de subida masiva para una comunidad o chat
     * @param {File} file - Objeto del archivo capturado en el dispositivo
     * @param {string} destinationRoomId - ID de la comunidad o canal de VobixChat
     */
    async registerUploadIntent(file, destinationRoomId) {
        const uploadId = `vbx_up_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const totalChunks = Math.ceil(file.size / this.chunkSize);

        this.activeUploads.set(uploadId, {
            file,
            totalChunks,
            currentChunk: 0,
            isAborted: false
        });

        console.log(`[Capa C4.2] Intento de subida registrado. ID: ${uploadId} | Tamaño total: ${(file.size / (1024 * 1024)).toFixed(2)} MB | Bloques: ${totalChunks}`);

        return {
            success: true,
            uploadId,
            totalChunks,
            destinationRoomId
        };
    }

    /**
     * Procesa y envía un bloque específico de forma independiente
     * @param {string} uploadId - ID de la sesión de subida
     * @param {number} chunkIndex - Índice del fragmento actual a subir
     * @param {string} signedUrlTarget - URL firmada de destino en la nube (R2/S3) obtenida del backend
     */
    async uploadSingleChunk(uploadId, chunkIndex, signedUrlTarget) {
        const session = this.activeUploads.get(uploadId);
        if (!session || session.isAborted) {
            throw new Error("[Capa C4.2] Sesión de subida inexistente o cancelada por el usuario.");
        }

        const startByte = chunkIndex * this.chunkSize;
        const endByte = Math.min(startByte + this.chunkSize, session.file.size);
        
        // Trocear el archivo de forma binaria nativa en memoria local del teléfono
        const fileChunkBlob = session.file.slice(startByte, endByte);

        console.log(`[Capa C4.2] Transfiriendo bloque ${chunkIndex + 1}/${session.totalChunks} (Bytes: ${startByte}-${endByte})`);

        // Ejecución de la subida directa a la nube sin pasar por Render
        try {
            const response = await fetch(signedUrlTarget, {
                method: 'PUT',
                body: fileChunkBlob,
                headers: {
                    'Content-Type': session.file.type || 'application/octet-stream'
                }
            });

            if (!response.ok) throw new Error(`Fallo en red S3/R2: ${response.statusText}`);

            session.currentChunk = chunkIndex + 1;
            const absoluteProgress = ((session.currentChunk / session.totalChunks) * 100).toFixed(1);

            return {
                uploadId,
                chunkIndex,
                status: "CHUNK_SUCCESS",
                progress: parseFloat(absoluteProgress),
                isCompleted: session.currentChunk === session.totalChunks
            };
        } catch (error) {
            console.error(`[Capa C4.2] Error crítico en bloque ${chunkIndex}:`, error);
            throw error;
        }
    }

    /**
     * Cancela instantáneamente la subida en caso de que el usuario lo solicite
     */
    cancelUploadSession(uploadId) {
        const session = this.activeUploads.get(uploadId);
        if (session) {
            session.isAborted = true;
            this.activeUploads.delete(uploadId);
            console.log(`[Capa C4.2] Sesión ${uploadId} cancelada y liberada de memoria.`);
            return true;
        }
        return false;
    }
}

if (typeof module !== 'undefined') {
    module.exports = VobixChunkedUploader;
}
