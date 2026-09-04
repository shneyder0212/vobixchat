'use strict';

/*
==========================================================
 VOBIXCHAT — CATÁLOGO CENTRAL DE CAPAS

 Una sola fuente para que menús, diagnóstico y soporte
 nombren cada bloque igual. Los estados son deliberadamente
 conservadores: "en_validacion" nunca significa probado en
 todos los móviles y redes.
==========================================================
*/

const VOBIX_LAYERS = Object.freeze([
  { id:'1', name:'Base móvil y accesibilidad', status:'en_validacion', scope:'Sala privada, teclado seguro, tamaños de letra y controles.' },
  { id:'1.4', name:'Diagnóstico de capas', status:'en_validacion', scope:'Estado central de módulos para identificar fallos sin tocar otras capas.' },
  { id:'2', name:'Comunicación real', status:'en_validacion', scope:'Mensajes, archivos, notas de voz, llamadas y videollamadas.' },
  { id:'2.1', name:'Sala privada ampliable', status:'estructurada', scope:'Invitaciones privadas y aforo máximo de 12 participantes.' },
  { id:'2.1.1', name:'SFU de vídeo', status:'preparada', scope:'Permisos temporales LiveKit. Requiere credenciales y despliegue del SFU.' },
  { id:'2.1.2', name:'Invitaciones y aceptación', status:'estructurada', scope:'Solo usuarios verificados y no bloqueados; entrada por aceptación.' },
  { id:'2.1.3', name:'Controles de llamada', status:'en_validacion', scope:'Audio, cámara, salida, colgar, recuperación de estado, tonos separados e intercambio/arrastre de miniatura.' },
  { id:'2.1.4', name:'Calidad adaptativa', status:'preparada', scope:'Objetivo 1080p cuando red y dispositivo lo permitan; prioridad de audio.' },
  { id:'2.2', name:'Encuestas privadas', status:'en_validacion', scope:'Encuestas persistentes, voto único, resultados, cierre del creador y actualización en tiempo real.' },
  { id:'2.4', name:'Notas de voz', status:'en_validacion', scope:'Grabación, envío, reproducción propia y velocidades 1×, 1.5× y 2×.' },
  { id:'2.5', name:'Fotos y vídeos privados', status:'en_validacion', scope:'Miniaturas normales, ampliación al tocar y vídeo con controles sin forzar una calidad inexistente.' },
  { id:'2.6', name:'Contenido de una sola vista', status:'preparada', scope:'Foto, vídeo o nota de voz que el destinatario abre una vez y después deja de estar disponible.' },
  { id:'2.6.1', name:'Marcado de envío único', status:'preparada', scope:'El remitente elige una sola vista antes de enviar el archivo.' },
  { id:'2.6.2', name:'Consumo protegido', status:'en_validacion', scope:'Validación de apertura única del destinatario y retirada posterior del contenido.' },
  { id:'2.6.3', name:'Pruebas de una sola vista', status:'pendiente', scope:'Prueba entre dos móviles para foto, vídeo y nota de voz.' },
  { id:'2.7', name:'Compartir información', status:'en_validacion', scope:'Envío de contactos, ubicación aproximada y ubicación en tiempo real con permiso explícito.' },
  { id:'2.7.1', name:'Enviar contactos', status:'en_validacion', scope:'Selección de contacto o introducción manual, enviada dentro de la sala privada.' },
  { id:'2.7.2', name:'Ubicación aproximada', status:'en_validacion', scope:'Envío puntual de un enlace de mapa tras autorizar ubicación.' },
  { id:'2.7.3', name:'Ubicación en tiempo real', status:'en_validacion', scope:'Actualización cada 30 segundos durante 15 minutos; se detiene al expirar.' },
  { id:'2.8', name:'Grabación consensuada', status:'diseño_legal', scope:'Grabación opcional de llamada o videollamada solo con aceptación expresa de cada participante.' },
  { id:'2.8.1', name:'Consentimiento por sesión', status:'preparada', scope:'Aceptar o rechazar antes de iniciar; no sirve un permiso genérico.' },
  { id:'2.8.2', name:'Aviso permanente', status:'preparada', scope:'Indicador visible para todos durante toda la grabación.' },
  { id:'2.8.3', name:'Registro y retención', status:'diseño_legal', scope:'Registro de consentimientos, acceso restringido, borrado y plazo definido.' },
  { id:'2.8.4', name:'Pruebas de grabación', status:'pendiente', scope:'Prueba técnica y revisión legal antes de exponerla a usuarios.' },
  { id:'3', name:'Personas y agenda', status:'en_validacion', scope:'Contactos, QR, invitaciones, ubicación y favoritos.' },
  { id:'3.1', name:'Favoritos y agenda', status:'en_validacion', scope:'Contactos favoritos persistentes, ordenados primero y sin modificar conversaciones.' },
  { id:'3.2', name:'Invitación y QR seguro', status:'en_validacion', scope:'Código QR y enlace que llevan al registro obligatorio; bloqueo de enlaces ajenos.' },
  { id:'3.3', name:'Verificación prudente de números', status:'preparada', scope:'El tipo de línea orienta el riesgo; un número VoIP no se rechaza automáticamente.' },
  { id:'3.3.1', name:'Titularidad por código', status:'preparada', scope:'Código de un solo uso obligatorio antes de crear la cuenta.' },
  { id:'3.3.2', name:'Riesgo sin discriminación', status:'preparada', scope:'Móvil, fijo o VoIP es una señal, nunca la única causa de bloqueo.' },
  { id:'3.3.3', name:'Revisión adicional', status:'preparada', scope:'Ante riesgo, se pide una comprobación adicional y se aplican límites iniciales proporcionados.' },
  { id:'3.3.4', name:'Bloqueo y apelación', status:'preparada', scope:'Solo se bloquea por fraude verificable o abuso; habrá revisión para corregir falsos positivos.' },
  { id:'4', name:'Social y privacidad', status:'planificada', scope:'Estados, grupos, comunidades, difusión y mensajes temporales.' },
  { id:'4.1', name:'Privacidad personal', status:'en_validacion', scope:'Preferencias de foto, estados, última conexión, lectura e incógnito.' },
  { id:'4.2', name:'Seguridad de aplicación', status:'en_validacion', scope:'PIN local, bloqueo, biometría y dispositivos vinculados.' },
  { id:'4.3', name:'Almacenamiento y datos', status:'en_validacion', scope:'Preferencias de descarga y ahorro de datos en llamadas.' },
  { id:'4.4', name:'Actualizaciones', status:'estructurada', scope:'Preferencias de actualización y notas de versión.' },
  { id:'4.5', name:'Vobix Premium', status:'preparada', scope:'Planes y beneficios; sin cobros hasta integrar una pasarela real.' },
  { id:'4.6', name:'Mensajes temporales', status:'preparada', scope:'Configuración por conversación con duración seleccionada.' },
  { id:'4.6.1', name:'Caducidad segura', status:'en_validacion', scope:'Fecha de expiración individual para cada mensaje nuevo.' },
  { id:'4.6.2', name:'Limpieza real', status:'en_validacion', scope:'Oculta para ambos texto y archivos vencidos al abrir la conversación.' },
  { id:'4.6.3', name:'Interfaz temporal', status:'preparada', scope:'Aviso visible de duración dentro de la sala privada.' },
  { id:'4.6.4', name:'Pruebas temporales', status:'pendiente', scope:'Prueba entre dos móviles antes de activarlo para usuarios.' },
  { id:'4.6.5', name:'Recuperación y auditoría', status:'preparada', scope:'Protecciones para no afectar conversaciones existentes.' },
  { id:'4.7', name:'Estados, grupos y comunidades', status:'preparada', scope:'Base social separada de las salas privadas.' },
  { id:'4.7.1', name:'Estados de usuarios', status:'preparada', scope:'Publicación, visibilidad y vencimiento de estados.' },
  { id:'4.7.2', name:'Grupos privados', status:'preparada', scope:'Creación, participantes, administradores y permisos.' },
  { id:'4.7.3', name:'Comunidades', status:'preparada', scope:'Agrupación de grupos con administración y normas.' },
  { id:'4.7.4', name:'Difusión', status:'preparada', scope:'Listas de difusión con consentimiento de destinatarios.' },
  { id:'4.7.5', name:'Moderación social', status:'preparada', scope:'Reportes, bloqueo, expulsión y trazabilidad administrativa.' },
  { id:'5', name:'Centro Vobix', status:'estructurada', scope:'Módulos, ajustes, servicios y configuración central.' },
  { id:'5.1', name:'Vobix Te Enseña', status:'activo', scope:'Acceso a aprendizaje y configuración propia.' },
  { id:'5.2', name:'Vobix Meet', status:'preparada', scope:'Configuración separada de reuniones; requiere infraestructura de vídeo.' },
  { id:'5.3', name:'Vobix Remote', status:'preparada', scope:'Configuración separada de asistencia remota; requiere controles de seguridad.' },
  { id:'5.4', name:'Vobix Verify Sign', status:'diseño_legal', scope:'Evidencia digital; firma cualificada solo mediante proveedor externo.' },
  { id:'5.5', name:'Vobix Trade', status:'preparada', scope:'Configuración separada de operaciones y documentos.' },
  { id:'5.6', name:'Social / Parejas', status:'preparada', scope:'Servicio social independiente de VobixChat.' },
  { id:'5.7', name:'Vobix Business', status:'preparada', scope:'Canales, roles y administración para empresas.' },
  { id:'5.8', name:'Vobix Campaigns', status:'preparada', scope:'Campañas, canales y transparencia.' },
  { id:'5.9', name:'Vobix Trust', status:'preparada', scope:'Dispositivos, recuperación y prevención de fraude.' },
  { id:'6', name:'Pruebas y liberación segura', status:'preparada', scope:'Validación por función, red y móvil antes de una APK final.' },
  { id:'6.1', name:'Pruebas de mensajes', status:'pendiente', scope:'Chat, fotos, vídeos y notas de voz.' },
  { id:'6.2', name:'Pruebas de teclado', status:'pendiente', scope:'Android e iPhone con zona segura.' },
  { id:'6.3', name:'Pruebas de llamadas', status:'pendiente', scope:'Llamadas y videollamadas entre dos móviles.' },
  { id:'6.4', name:'Pruebas de red', status:'pendiente', scope:'Wi‑Fi, datos móviles y recuperación de conexión.' },
  { id:'6.5', name:'Pruebas de privacidad', status:'pendiente', scope:'Registro, QR, ubicación y permisos.' },
  { id:'6.6', name:'Pruebas de seguridad', status:'pendiente', scope:'Cuenta, dispositivos y recuperación.' },
  { id:'6.7', name:'APK de pruebas', status:'pendiente', scope:'Versión interna antes de distribuir.' },
  { id:'6.8', name:'APK final firmada', status:'pendiente', scope:'Publicación tras superar todas las pruebas obligatorias.' },
  { id:'100', name:'Vobix Prueba de Vida y Confianza Activa', status:'en_validacion', scope:'Verificación humana y red de apoyo transversal para mensajes, llamadas y videollamadas; integra Guardián Familiar, alerta silenciosa y ubicación temporal con autorización previa.' }
  ,{ id:'101', name:'Vobix Red de Rescate', status:'web_en_validacion', scope:'SOS autenticado, cola sin conexión, ubicación y confirmación familiar disponibles en web; cifrado E2E de retransmisión, Bluetooth, Wi‑Fi Direct y satélite requieren apps nativas, permisos, hardware y pruebas físicas.' }
  ,{ id:'102', name:'Vobix Sello Original', status:'en_validacion', scope:'Huella SHA-256 vinculada al mensaje para comprobar si una foto, vídeo, audio o documento cambió después de entrar en Vobix.' }
  ,{ id:'103', name:'Vobix Ruta Protegida', status:'en_validacion', scope:'Trayecto temporal compartido con familiares autorizados, aviso de parada prolongada o retraso y confirmación de llegada.' }
  ,{ id:'104', name:'Vobix Consentimiento de Seguridad', status:'en_validacion', scope:'Funciones de emergencia desactivadas por defecto, aceptación informada versionada y revocable; no sustituye al 112 ni elimina responsabilidades legales.' }
  ,{ id:'105', name:'Vobix Atestación de Origen', status:'requiere_configuracion', scope:'Firma del servidor que vincula contenido capturado en Vobix con cuenta verificada, sesión reconocida, integridad y decisión de ubicación; requiere secreto exclusivo en Render.' }
  ,{ id:'106', name:'Vobix Protección Infantil', status:'en_validacion', scope:'Activación de doble aceptación con tutor verificado, contactos autorizados, bloqueo de desconocidos y horario; emergencias permanecen accesibles y no permite vigilancia secreta.' }
  ,{ id:'107', name:'Vobix Lengua de Signos', status:'en_validacion', scope:'Subtítulos locales, preferencias LSE/ASL/BSL y apoyo visual básico; avatar y reconocimiento gestual siguen en investigación y no sustituyen a intérpretes profesionales.' }
  ,{ id:'108', name:'Vobix Recuperación Familiar', status:'en_validacion', scope:'Recuperación voluntaria mediante 2 a 5 guardianes verificados, umbral configurable, espera de seguridad, alertas y cancelación; nunca permite leer contraseñas ni conversaciones.' }
  ,{ id:'109', name:'Persistencia de Mensajes de Acero', status:'en_validacion', scope:'Inserción SQL válida e idempotente para confirmar mensajes nuevos y reintentos sin duplicarlos.' }
  ,{ id:'110', name:'Vobix Escudo Infantil Integral', status:'en_validacion', scope:'La política familiar se aplica al abrir conversaciones, aceptar contactos, enviar texto, archivos y llamadas; no inspecciona el contenido privado.' }
  ,{ id:'111', name:'Vobix Recuperación Familiar Completa', status:'en_validacion', scope:'La interfaz permite consultar, cancelar y completar una solicitud aprobada; al finalizar revoca sesiones anteriores y reconoce el nuevo dispositivo.' }
]);

function getVobixLayers() {
  return VOBIX_LAYERS.map(layer => ({ ...layer }));
}

module.exports = { getVobixLayers };
