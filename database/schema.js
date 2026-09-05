/**
 * VOBIXCHAT - ESQUEMAS DE BASE DE DATOS E INICIALIZACIÓN (CAPA C3.4)
 * Definición estructural de tablas relacionales con índices optimizados para PostgreSQL.
 * Blinda la consistencia de datos para mensajería, control parental y auditorías de IA.
 */

const db = require('./db');

const tableSchemas = {
    // 1. Tabla de Usuarios y Roles del Sistema
    users: `
        CREATE TABLE IF NOT EXISTS vobix_users (
            user_id VARCHAR(64) PRIMARY KEY,
            phone_number VARCHAR(20) UNIQUE NOT NULL,
            display_name VARCHAR(100) NOT NULL,
            user_role VARCHAR(30) DEFAULT 'STANDARD', -- STANDARD, ADMIN_TUTOR, SENIOR_PROTECTED, KID_PROTECTED
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `,

    // 2. Tabla de Círculos y Núcleos Familiares (Control Parental)
    family_circles: `
        CREATE TABLE IF NOT EXISTS vobix_family_circles (
            circle_id VARCHAR(64) PRIMARY KEY,
            tutor_id VARCHAR(64) REFERENCES vobix_users(user_id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `,

    // 3. Relación de Miembros Protegidos por Círculo
    family_members: `
        CREATE TABLE IF NOT EXISTS vobix_family_members (
            circle_id VARCHAR(64) REFERENCES vobix_family_circles(circle_id) ON DELETE CASCADE,
            member_id VARCHAR(64) REFERENCES vobix_users(user_id) ON DELETE CASCADE,
            PRIMARY KEY (circle_id, member_id)
        );
    `,

    // 4. Lista Blanca de Contactos Autorizados para los perfiles protegidos
    family_whitelist: `
        CREATE TABLE IF NOT EXISTS vobix_family_whitelist (
            circle_id VARCHAR(64) REFERENCES vobix_family_circles(circle_id) ON DELETE CASCADE,
            authorized_phone VARCHAR(20) NOT NULL,
            contact_label VARCHAR(100),
            PRIMARY KEY (circle_id, authorized_phone)
        );
    `,

    // 5. Historial de Alertas de Acoso e Insistencia (Telemetría en tiempo real)
    parental_alerts: `
        CREATE TABLE IF NOT EXISTS vobix_parental_alerts (
            alert_id SERIAL PRIMARY KEY,
            tutor_id VARCHAR(64) REFERENCES vobix_users(user_id),
            child_id VARCHAR(64) REFERENCES vobix_users(user_id),
            offender_phone VARCHAR(20) NOT NULL,
            attempts_count INT NOT NULL,
            resolved BOOLEAN DEFAULT FALSE,
            timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `,

    // 6. Mensajería Estructural con Etiquetas de Riesgo de la IA
    messages: `
        CREATE TABLE IF NOT EXISTS vobix_messages (
            message_id VARCHAR(64) PRIMARY KEY,
            chat_id VARCHAR(64) NOT NULL,
            sender_id VARCHAR(64) REFERENCES vobix_users(user_id),
            target_id VARCHAR(64) REFERENCES vobix_users(user_id),
            content TEXT NOT NULL,
            message_type VARCHAR(20) DEFAULT 'text', -- text, image, video, audio, emergency
            security_tag VARCHAR(30) DEFAULT 'UNCHECKED', -- SAFE, SUSPICIOUS_WARNING, CRITICAL_DANGER
            timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `
};

const indexes = [
    "CREATE INDEX IF NOT EXISTS idx_messages_chat ON vobix_messages(chat_id);",
    "CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON vobix_messages(timestamp DESC);",
    "CREATE INDEX IF NOT EXISTS idx_alerts_tutor ON vobix_parental_alerts(tutor_id);"
];

module.exports = {
    /**
     * Ejecuta de forma secuencial la creación y sincronización de las estructuras SQL
     */
    async initializeDatabaseSchema() {
        console.log("[Capa CB3.4] Iniciando verificación y migración de esquemas SQL...");
        try {
            // Crear tablas respetando el orden de llaves foráneas
            await db.query(tableSchemas.users);
            await db.query(tableSchemas.family_circles);
            await db.query(tableSchemas.family_members);
            await db.query(tableSchemas.family_whitelist);
            await db.query(tableSchemas.parental_alerts);
            await db.query(tableSchemas.messages);

            // Crear índices de rendimiento optimizados
            for (const indexQuery of indexes) {
                await db.query(indexQuery);
            }

            console.log("[Capa C3.4] Estructuras e índices SQL validados e inyectados sin errores.");
            return true;
        } catch (error) {
            console.error("[Capa C3.4] Fallo crítico durante la construcción estructural de tablas:", error.message);
            throw error;
        }
    }
};
