/**
 * VOBIXCHAT - SERVICE WORKER DE SEGUNDO PLANO (CAPA C5.5)
 * Intercepta eventos de red, gestiona la caché y despierta notificaciones Push.
 * Mantiene la escucha de alertas parentales y llamadas con la app cerrada.
 */

const CACHE_NAME = 'vobixchat-static-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/js/client.js',
    '/js/c1-antifraud.js'
];

// 1. Evento de Instalación: Almacena recursos críticos para que la app abra al instante
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Capa C5.5] Precargando recursos estáticos en el dispositivo...');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// 2. Evento de Activación: Limpia memorias viejas de compilaciones anteriores
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('[Capa C5.5] Removiendo caché antigua obsoleta:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// 3. Intercepción de red: Estrategia Cache-First para carga en menos de 1 segundo
self.addEventListener('fetch', (event) => {
    // Solo cachear peticiones GET locales (evita romper llamadas de API POST)
    if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse; // Retorna instantáneamente de la memoria del teléfono
            }
            return fetch(event.request); // Si no está, lo descarga de Render
        })
    );
});

// 4. CAPA DE NOTIFICACIONES PUSH: Intercepta alertas de Firebase y llamadas en segundo plano
self.addEventListener('push', (event) => {
    let pushData = { title: 'VobixChat', body: 'Nuevo mensaje recibido.', tag: 'vbx-generic' };

    if (event.data) {
        try {
            pushData = event.data.json();
        } catch (e) {
            pushData.body = event.data.text();
        }
    }

    const notificationOptions = {
        body: pushData.body,
        icon: '/mipmap-hdpi/ic_launcher.png', // Icono oficial configurado en tu build.gradle
        badge: '/mipmap-hdpi/ic_launcher_round.png',
        tag: pushData.tag || 'vobix-notification',
        vibrate:, // Patrón de vibración prioritario para capturar atención
        data: {
            url: pushData.url || '/',
            roomId: pushData.roomId || null
        },
        // Propiedades requeridas para encender pantallas bloqueadas en llamadas
        requireInteraction: pushData.tag === 'vobix-incoming-call' 
    };

    event.waitUntil(
        self.registration.showNotification(pushData.title, notificationOptions)
    );
});

// 5. Gestión de Clics: Abre la app y redirige directamente a la sala de llamada o alerta
self.addEventListener('notificationclick', (event) => {
    event.notification.close(); // Cierra el globo de notificación

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            const targetUrl = event.notification.data.url;

            // Si la app ya está abierta, la enfoca y redirige
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url === targetUrl && 'focus' in client) {
                    return client.focus();
                }
            }
            // Si está cerrada, abre una nueva ventana limpia
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
