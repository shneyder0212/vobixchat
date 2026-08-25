const CACHE_NAME = "vobixchat-v10";
const URLS_TO_CACHE = ["/", "/index.html", "/manifest.json"];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(URLS_TO_CACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

// ESTO HACE QUE JAMAS SE CIERRE Y RECIBA LLAMADAS EN SEGUNDO PLANO
self.addEventListener('push', function(event) {
  const data = event.data? event.data.json() : {};
  console.log("Push recibido:", data);

  if(data.tipo === 'llamada'){
    // NOTIFICACION DE LLAMADA CON BOTONES ACEPTAR/RECHAZAR
    const options = {
      body: `${data.nombre} te está llamando...`,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [500, 300, 500, 300, 1000],
      tag: 'llamada-entrante',
      renotify: true,
      requireInteraction: true, // No se cierra sola, como WhatsApp
      actions: [
        { action: 'aceptar', title: '✅ Aceptar', icon: '/icon-192.png' },
        { action: 'rechazar', title: '❌ Rechazar', icon: '/icon-192.png' }
      ],
      data: data
    };
    event.waitUntil(self.registration.showNotification('📹 Llamada VobixChat', options));
  } else {
    // NOTIFICACION DE MENSAJE
    const options = {
      body: data.texto || 'Nuevo mensaje',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [200, 100, 200],
      tag: 'mensaje-'+data.emisor,
      data: data
    };
    event.waitUntil(self.registration.showNotification(`💬 ${data.nombre}`, options));
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  if(event.action === 'rechazar'){
    // Avisar que rechazó
    event.waitUntil(
      fetch('/api/rechazar-llamada', {
        method: 'POST',
        body: JSON.stringify(event.notification.data),
        headers: { 'Content-Type': 'application/json' }
      })
    );
    return;
  }

  // Si acepta o toca la notificación, abrir la app y contestar
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for(let client of clientList){
        if(client.url.includes(self.location.origin) && 'focus' in client){
          client.postMessage({ tipo: 'aceptar-llamada', data: event.notification.data });
          return client.focus();
        }
      }
      if(clients.openWindow){
        return clients.openWindow('/?llamada=' + event.notification.data.emisor);
      }
    })
  );
});
