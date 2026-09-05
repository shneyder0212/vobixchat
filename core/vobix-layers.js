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
  ,{ id:'112', name:'Defensa de Recuperación Familiar', status:'en_validacion', scope:'Limita por dispositivo los intentos de iniciar, consultar y completar recuperaciones, con espera explícita y memoria temporal acotada.' }
  ,{ id:'113', name:'Mensajería en Tiempo Real Idempotente', status:'en_validacion', scope:'Cada envío Socket exige un identificador seguro; los reintentos recuperan el mensaje confirmado sin guardarlo, emitirlo ni notificarlo dos veces.' }
  ,{ id:'114', name:'Reintentos sin Alterar Historial', status:'en_validacion', scope:'Un reintento ya confirmado no cambia la actividad de la conversación ni la reordena artificialmente en la bandeja.' }
  ,{ id:'115', name:'Identidad de Mensaje Vinculada', status:'en_validacion', scope:'Un identificador de envío queda ligado a su conversación, tipo y contenido originales; reutilizarlo con otra intención se rechaza.' }
  ,{ id:'116', name:'Confirmación Obligatoria de Envío', status:'en_validacion', scope:'Todo mensaje nuevo por HTTP o Socket exige un identificador de cliente válido para que la deduplicación nunca quede desactivada.' }
  ,{ id:'117', name:'Archivos y Notas de Voz sin Duplicados', status:'en_validacion', scope:'Fotos, vídeos, documentos y audios vinculan su identificador a la conversación, tipo y huella SHA-256; los reintentos no emiten ni notifican dos veces.' }
  ,{ id:'118', name:'Sesión de Subida Reanudable Vinculada', status:'en_validacion', scope:'Una sesión reanudable solo continúa si coinciden usuario, conversación, nombre, tipo, tamaño, origen y modo de visualización originales.' }
  ,{ id:'119', name:'Fragmentos Reanudables Inmutables', status:'en_validacion', scope:'Cada fragmento queda fijado por su huella SHA-256; un reintento idéntico se confirma sin reescribir y un contenido diferente para el mismo índice se rechaza.' }
  ,{ id:'120', name:'Finalización Única de Subidas', status:'en_validacion', scope:'Una sesión reanudable solo puede entrar una vez en finalización; solicitudes simultáneas reciben un conflicto controlado y no crean mensajes duplicados.' }
  ,{ id:'121', name:'Reconstrucción Verificada de Archivos', status:'en_validacion', scope:'Antes de unir cada fragmento, el servidor recalcula su SHA-256 y detiene la subida si los bytes ya no coinciden con la huella aceptada.' }
  ,{ id:'122', name:'Cierre Atómico de Sesión de Subida', status:'en_validacion', scope:'Desde que comienza el ensamblado, la sesión rechaza nuevos fragmentos y cancelaciones para impedir carreras, borrados intermedios o resultados incompletos.' }
  ,{ id:'127', name:'Identidad de Llamada Vinculada', status:'en_validacion', scope:'Cada llamada exige un identificador seguro ligado al creador, conversación y tipo; reutilizarlo para otra llamada se rechaza antes de emitir ofertas.' }
  ,{ id:'128', name:'Canal ICE Autorizado y Acotado', status:'en_validacion', scope:'Solo participantes o invitados de la llamada pueden enviar candidatos ICE y cada candidato tiene un tamaño máximo antes de almacenarse o retransmitirse.' }
  ,{ id:'129', name:'Un Solo Dispositivo Atiende', status:'en_validacion', scope:'El primer dispositivo de una cuenta que contesta una llamada queda registrado atómicamente; respuestas duplicadas, simultáneas o de reconexiones se rechazan y los demás dispositivos limpian sus señales.' }
  ,{ id:'130', name:'Finalización Sincronizada de Llamadas', status:'en_validacion', scope:'Cualquier rechazo, cancelación, cuelgue, desconexión o expiración finaliza la llamada en todos los dispositivos; detiene tonos, temporizadores y media, cierra WebRTC y rechaza señalización tardía.' }
  ,{ id:'131', name:'Audio y Vídeo Activos al Contestar', status:'en_validacion', scope:'Al contestar, solicita la media necesaria, conecta audio o vídeo remoto al elemento adecuado, reproduce de forma compatible con móvil y libera recursos si falla o termina la llamada.' }
  ,{ id:'132', name:'Notas de Voz Fiables', status:'en_validacion', scope:'Graba, cancela, sube, entrega y reproduce audio con duración, progreso, una sola vista, validación de tipo y conversación, reintentos idempotentes y liberación completa de recursos.' }
  ,{ id:'133', name:'Reingreso Seguro a Llamadas Grupales', status:'en_validacion', scope:'Los miembros de una llamada grupal conservan su autorización mientras la sesión siga activa; pueden salir, reconectar o volver con una conexión multimedia nueva, sin duplicados y sin reingreso después de terminar o ser expulsados.' }
  ,{ id:'134', name:'Mensajería Móvil Utilizable y Envío Inmediato', status:'en_validacion', scope:'El compositor mantiene un campo horizontal legible en móviles estrechos y procesa mensajes y llamadas desde el primer contacto para resistir reajustes del teclado Android.' }
  ,{ id:'135', name:'Menú Burbuja Desplazable', status:'en_validacion', scope:'El menú de opciones se mueve verticalmente con dedo, ratón o teclado, queda limitado a la pantalla y recuerda su posición.' }
,{ id:'136', name:'Conversación Activa Recuperable', status:'en_validacion', scope:'Al abrir o recargar, restaura el último destinatario válido —o el chat más reciente— antes de enviar mensajes, archivos, notas de voz o iniciar llamadas.' }
,{ id:'137', name:'Compositor Móvil Adaptativo', status:'en_validacion', scope:'Barra de mensaje ancha tipo WhatsApp y ajuste al teclado visual en Android y iPhone, conservando emoji, documentos, cámara, voz y envío.' }
,{ id:'138', name:'Comunicación Móvil sin Bloqueos', status:'en_validacion', scope:'Reduce la presión sobre la base de datos, agrupa recibos, acota subidas, carga TURN y muestra controles claros para detener, enviar o cancelar notas de voz.' }
,{ id:'139', name:'Salida Directa de Modo Senior', status:'en_validacion', scope:'Permite desactivar Modo Senior con un botón visible de una sola pulsación, sin temporizador ni pulsación prolongada.' }
,{ id:'140', name:'Arranque Resistente de Base de Datos', status:'en_validacion', scope:'El servidor abre el puerto durante despliegues solapados y reintenta la conexión PostgreSQL con pausa progresiva, evitando que un límite temporal de sesiones bloquee la versión corregida.' }
,{ id:'141', name:'Cámara Directa y Documentos Claros', status:'en_validacion', scope:'La cámara móvil captura fotografías nuevas con la cámara trasera; los archivos se envían sin avisos rutinarios y muestran formato, nombre compacto y tamaño legible.' }
,{ id:'142', name:'Permisos Multimedia al Entrar', status:'en_validacion', scope:'Cada cuenta activa cámara y micrófono desde una pantalla inicial con pulsación explícita; se comprueban ambas pistas, se detienen inmediatamente y se recuerda el permiso en ese dispositivo.' }
,{ id:'143', name:'Escritura Compacta Configurable', status:'en_validacion', scope:'Las letras del compositor usan tamaño pequeño por defecto y cada persona puede elegir Pequeña, Normal o Grande; iPhone conserva el mínimo que evita zoom involuntario.' }
,{ id:'144', name:'Interruptor Directo de Modo Senior', status:'en_validacion', scope:'El menú muestra Activar o Desactivar Modo Senior según su estado y cambia con una sola pulsación, sin confirmación ni espera de tres segundos.' }
,{ id:'145', name:'Llamada Recuperable sin Conexión', status:'en_validacion', scope:'Una llamada pendiente se recupera al volver la cobertura o al abrir su notificación; el llamante escucha un tono suave mientras el teléfono destinatario es avisado.' }
,{ id:'146', name:'Selector de Cámara para Fotos', status:'en_validacion', scope:'Antes de hacer una fotografía se elige cámara frontal para selfie o cámara trasera, manteniendo la galería separada.' }
,{ id:'147', name:'Acciones Seguras de Mensajes', status:'en_validacion', scope:'El menú de tres puntos permite reaccionar, copiar, pegar, editar mensajes propios y elegir entre eliminar para todos o únicamente para la cuenta actual.' }
,{ id:'148', name:'Llamadas Ampliables de Seis Personas', status:'en_validacion', scope:'Una llamada de voz o vídeo 1×1 puede añadir contactos hasta seis plazas mediante conexiones WebRTC dirigidas; cualquier miembro, incluido quien inició, puede salir, reconectar y volver mientras quede activa, salvo expulsión.' }
,{ id:'149', name:'Formularios Visibles con Teclado Móvil', status:'en_validacion', scope:'Registro y búsqueda calculan el área visible del teclado en Android y iPhone, mantienen el campo activo a la vista y reservan un botón Buscar pulsable sin modificar el teclado del chat.' }
,{ id:'150', name:'Regreso Visible a la Sala Principal', status:'en_validacion', scope:'La búsqueda, las conversaciones y las pantallas secundarias sin navegación previa ofrecen una salida directa, táctil y accesible hacia la lista principal de chats.' }
,{ id:'151', name:'Control Personal de Red y Datos', status:'en_validacion', scope:'Cada dispositivo permite elegir Wi‑Fi y datos móviles, solo Wi‑Fi o solo datos móviles para archivos, notas de voz y llamadas; el ahorro de datos permanece desactivado por defecto y puede activarse voluntariamente.' }
,{ id:'152', name:'Sesión Cerrada por Dispositivo', status:'en_validacion', scope:'Cerrar sesión revoca la sesión del servidor, cancela las notificaciones push del dispositivo, borra únicamente la autenticación local y conserva la cuenta y las conversaciones.' }
,{ id:'153', name:'Zonas Seguras Multidispositivo', status:'en_validacion', scope:'En modo instalado, la cabecera y los controles reservan las áreas del sistema en Android e iOS; navegador, tablet y escritorio mantienen una distribución adaptable sin márgenes fijos de una marca.' }
,{ id:'154', name:'Eliminación Personal y Bloqueo', status:'en_validacion', scope:'Permite eliminar el historial solo para la cuenta actual, quitar un usuario sin bloquearlo o quitarlo y bloquearlo, siempre con confirmación visible.' }
,{ id:'155', name:'Todos los Menús Movibles', status:'en_validacion', scope:'Los menús y paneles flotantes pueden moverse en horizontal y vertical con ratón o dedo, se mantienen dentro de la pantalla y recuerdan su posición por dispositivo.' }
,{ id:'156', name:'Centro de Permisos Reversible', status:'en_validacion', scope:'El menú permite comprobar y solicitar cámara, micrófono y notificaciones mediante controles oficiales del dispositivo, informa bloqueos y evita acceso permanente innecesario a fotos o documentos.' }
,{ id:'157', name:'Teclado Universal Adaptativo', status:'en_validacion', scope:'Registro, búsqueda y conversación combinan VisualViewport, VirtualKeyboard y foco para conservar campos y acciones visibles en Android, iOS, tablets y escritorio sin depender de una marca concreta.' }
]);

function getVobixLayers() {
  return VOBIX_LAYERS.map(layer => ({ ...layer }));
}

module.exports = { getVobixLayers };
