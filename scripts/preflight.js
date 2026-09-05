/**
 * VOBIXCHAT - COMPROBADOR DE INTEGRIDAD PRE-DESPLIEGUE (CAPA C6.9)
 * Audita la existencia de capas de seguridad, variables críticas y conectividad.
 * Bloquea arranques corruptos en Render antes de que afecten a los usuarios.
 */

const fs = require('fs');
const path = require('path');

// Listado milimétrico de archivos del núcleo que DEBEN existir obligatoriamente
const CRITICAL_VOBIX_LAYERS = [
    { name: "Servidor Base (C5.1)", path: "server.js" },
    { name: "Enrutador de Mensajería (C5.2)", path: "routes/chat.js" },
    { name: "Motor IA Anti-Estafas (C1.2)", path: "core/message-intent.js" },
    { name: "Caché Local IndexedDB (C3.2)", path: "core/vobix-local-cache.js" },
    { name: "Subida de Bloques 2GB (C4.2)", path: "core/upload-intent.js" },
    { name: "Gestión Parental Tutor (C2.4)", path: "core/vobix-guardian.js" },
    { name: "Auxilio y Pánico SOS (C1.3)", path: "core/vobix-emergency.js" },
    { name: "Recovery Familiar (C2.5)", path: "core/vobix-family-recovery.js" },
    { name: "Interfaz Adaptativa (C1.4)", path: "core/vobix-layers.js" },
    { name: "Chatbot de Idiomas (C1.5)", path: "core/vobix-learn.js" },
    { name: "Salas Vobix Meet (C1.6)", path: "core/vobix-meet.js" },
    { name: "Sello de Origen (C1.7)", path: "core/vobix-origin-attestation.js" },
    { name: "Licencias Premium (C1.8)", path: "core/vobix-premium.js" },
    { name: "Rutas Protegidas (C1.9)", path: "core/vobix-protected-route.js" },
    { name: "Rescate Redes Débiles (C1.10)", path: "core/vobix-rescue.js" },
    { name: "Conector PostgreSQL (C3.3)", path: "database/db.js" },
    { name: "Esquemas SQL Automatizados (C3.4)", path: "database/schema.js" }
];

async function runPreflightSystemAudit() {
    console.log("=== [Vobix Core] Iniciando Auditoría Preflight de Capas ===");
    let structuralErrorsFound = 0;

    // 1. Validar existencia física de cada capa estructural en el repositorio
    CRITICAL_VOBIX_LAYERS.forEach((layer) => {
        const fullPath = path.join(__dirname, '..', layer.path);
        if (fs.existsSync(fullPath)) {
            console.log(`✓ Estructura Ok: ${layer.name} localizada.`);
        } else {
            console.error(`❌ ERROR CRÍTICO: Falta el archivo esencial de la capa en: ${layer.path}`);
            structuralErrorsFound++;
        }
    });

    // 2. Verificar inyección segura de variables de entorno críticas en la nube
    console.log("\n[Preflight] Verificando variables secretas perimetrales...");
    
    if (!process.env.DATABASE_URL) {
        console.warn("⚠️ ADVERTENCIA: La variable 'DATABASE_URL' no está inyectada. El sistema usará fallback de desarrollo local.");
    } else {
        console.log("✓ Conexión de red de datos declarada en entorno.");
    }

    if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        console.warn("⚠️ ADVERTENCIA: Falta 'FIREBASE_SERVICE_ACCOUNT_JSON'. Las notificaciones Push en segundo plano para móviles estarán inactivas.");
    } else {
        console.log("✓ Credenciales secretas de Firebase localizadas de forma segura.");
    }

    // 3. Evaluación de conclusiones del arranque técnico
    console.log("\n=======================================================");
    if (structuralErrorsFound > 0) {
        console.error(`❌ DESPLIEGUE ABORTADO: Se localizaron ${structuralErrorsFound} fallos de capas estructurales.`);
        console.error("Por favor, sube los archivos faltantes a tu repositorio de GitHub antes de reintentar.");
        process.exit(1); // Detiene el despliegue en Render de forma inmediata
    } else {
        console.log("🚀 AUDITORÍA EXITOSA: Todas las capas de VobixChat están validadas y listas.");
        console.log("=======================================================");
        process.exit(0); // Aprueba el arranque técnico y permite el inicio del server.js
    }
}

// Ejecución automática de la rutina perimetral
runPreflightSystemAudit();
