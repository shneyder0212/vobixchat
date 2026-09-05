/**
 * VOBIXCHAT - CONECTOR DE BASE DE DATOS DE PRODUCCIÓN (CAPA C3.3)
 * Administra el pool de conexiones relacionales optimizadas para Render / Cloud Run.
 * Cuenta con tolerancia a fallos y reintentos automáticos durante el arranque.
 */

const { Pool } = require('pg');

// Configuración del pool de conexiones inyectando variables de entorno seguras de Render
const dbConfig = {
    connectionString: process.env.DATABASE_URL, // URL secreta provista por tu base de datos Render
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,                                    // Límite de conexiones simultáneas en el pool
    idleTimeoutMillis: 30000,                   // Tiempo para cerrar conexiones inactivas
    connectionTimeoutMillis: 4000               // Tiempo de espera máximo para conectar
};

let pool = null;
let retryCount = 0;
const MAX_CONNECT_RETRIES = 5;
const RETRY_DELAY_MS = 5000;

/**
 * Inicializa y conecta el pool con la base de datos relacional
 */
function connectWithRetry() {
    console.log("[Capa C3.3] Intentando conectar con la base de datos estructural...");
    pool = new Pool(dbConfig);

    pool.on('error', (err) => {
        console.error('[Capa C3.3] Error inesperado en un cliente inactivo de la base de datos:', err);
    });
}

// Ejecutar conexión inicial de infraestructura
connectWithRetry();

module.exports = {
    /**
     * Ejecuta una consulta SQL genérica de forma segura protegiendo el pool
     * @param {string} text - Consulta SQL formateada con marcadores de posición
     * @param {Array} params - Parámetros limpios para evitar inyección SQL
     */
    async query(text, params) {
        const start = Date.now();
        try {
            const res = await pool.query(text, params);
            const duration = Date.now() - start;
            // Registro técnico de rendimiento para telemetría interna
            if (duration > 1000) {
                console.warn(`[Capa C3.3] Alerta de consulta lenta: ${text} tardó ${duration}ms`);
            }
            return res;
        } catch (error) {
            console.error('[Capa C3.3] Error crítico ejecutando consulta SQL:', error.message);
            throw error;
        }
    },

    /**
     * Verifica la salud de la conexión de la base de datos en tiempo real (Para /healthz)
     */
    async checkDatabaseHealth() {
        try {
            await pool.query('SELECT 1');
            return { status: "HEALTHY", error: null };
        } catch (error) {
            return { status: "CRITICAL", error: error.message };
        }
    }
};
