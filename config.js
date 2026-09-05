/**
 * VOBIXCHAT - CONFIGURACIÓN CENTRAL DE INFRAESTRUCTURA (CAPA C5.3)
 * Mapea entornos de producción en Render y fallback local para pruebas.
 * Centraliza servidores multimedia WebRTC (STUN/TURN) y accesos a bases de datos.
 */

const ConfigurationEnvironment = {
    // Entorno operativo actual (production o development)
    NODE_ENV: process.env.NODE_ENV || 'development',

    // Puerto de escucha de red del servidor Vobix Core
    PORT: process.env.PORT || 3000,

    // URL final del Servidor de Render (Se inyecta automáticamente o lee local)
    RENDER_SERVER_URL: process.env.RENDER_URL || 'http://localhost:3000',

    // Enlace de Base de Datos Estructural PostgreSQL
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:vobix_local_dev@localhost:5432/vobixchat',

    // Credencial blindada de Firebase Service Account para alertas en segundo plano
    FIREBASE_SERVICE_ACCOUNT: process.env.FIREBASE_SERVICE_ACCOUNT_JSON ? 
        JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON) : null,

    // ==========================================
    // ARQUITECTURA DE RED WEBRTC (STUN Y TURN)
    // ==========================================
    iceServersConfiguration: {
        iceServers: [
            // Servidores STUN públicos de Google para redes Wi-Fi residenciales
            { urls: 'stun:://google.com' },
            { urls: 'stun:://google.com' },
            
            // Servidores TURN comerciales de respaldo para atravesar 4G/5G de Claro, Movistar, Tigo, etc.
            // Cuando contrates un servicio como Metered.ca o Xirsys, Render inyectará estas variables automáticamente.
            {
                urls: process.env.VOBIX_TURN_URL || 'turn:turn.metered.ca:443?transport=tcp',
                username: process.env.VOBIX_TURN_USER || 'vobix_placeholder_user',
                credential: process.env.VOBIX_TURN_PASSWORD || 'vobix_placeholder_pass'
            }
        ]
    },

    // ==========================================
    // CAPACIDADES DE COMUNIDADES Y ALMACENAMIENTO (C4.2)
    // ==========================================
    storageBuckets: {
        provider: process.env.STORAGE_PROVIDER || 'cloudflare_r2', // Opciones: aws_s3, cloudflare_r2, wasabi
        endpoint: process.env.STORAGE_ENDPOINT || 'https://cloudflarestorage.com',
        bucketName: process.env.STORAGE_BUCKET_NAME || 'vobixchat-comunidades-masivas',
        publicUrl: process.env.STORAGE_PUBLIC_CDN || 'https://vobixchat.app'
    }
};

// Validación técnica rápida de inicialización sin congelar el backend
if (ConfigurationEnvironment.NODE_ENV === 'production') {
    console.log("[Capa C5.3] Configuración global inicializada en modo PRODUCCIÓN (Render).");
    if (!ConfigurationEnvironment.DATABASE_URL) {
        console.warn("⚠️ ALERTA: La variable DATABASE_URL está vacía en producción.");
    }
} else {
    console.log("[Capa C5.3] Entorno configurado en modo DESARROLLO LOCAL.");
}

module.exports = ConfigurationEnvironment;
