'use strict';

/* =========================================================
   VOBIXCHAT
   SERVICE WORKER
   Web Push + mensajes + llamadas + videollamadas

   Archivo:
   public/service-worker.js
   ========================================================= */


/* =========================================================
   CONFIGURACIÓN
   ========================================================= */

const VOBIX_SW_VERSION =
  'vobixchat-sw-v1';


const DEFAULT_ICON =
  '/icons/icon-192.png';


const DEFAULT_BADGE =
  '/icons/icon-192.png';


/* =========================================================
   INSTALACIÓN
   ========================================================= */

self.addEventListener(
  'install',
  event => {

    console.log(
      '[VOBIXCHAT SW] Instalando:',
      VOBIX_SW_VERSION
    );

    /*
      Activa inmediatamente esta versión.
    */

    self.skipWaiting();

  }
);


/* =========================================================
   ACTIVACIÓN
   ========================================================= */

self.addEventListener(
  'activate',
  event => {

    console.log(
      '[VOBIXCHAT SW] Activado:',
      VOBIX_SW_VERSION
    );

    event.waitUntil(
      self.clients.claim()
    );

  }
);


/* =========================================================
   CONVERTIR PUSH A JSON
   ========================================================= */

function readPushData(event) {

  if (!event.data) {

    return {};

  }

  /*
    Primero intentamos JSON.
  */

  try {

    return event.data.json();

  } catch (error) {

    /*
      Si no vino JSON,
      intentamos texto.
    */

    try {

      return {
        body:
          event.data.text()
      };

    } catch (textError) {

      return {};

    }

  }

}


/* =========================================================
   NORMALIZAR TIPO DE PUSH
   ========================================================= */

function normalizePushType(data) {

  const type =
    String(
      data?.type ||
      data?.event ||
      data?.notificationType ||
      'message'
    )
      .trim()
      .toLowerCase();


  if (
    type === 'call' ||
    type === 'audio-call' ||
    type === 'incoming-call'
  ) {

    return 'call';

  }


  if (
    type === 'video-call' ||
    type === 'videocall' ||
    type === 'video_call'
  ) {

    return 'video-call';

  }


  if (
    type === 'message' ||
    type === 'chat-message' ||
    type === 'new-message'
  ) {

    return 'message';

  }


  return type;

}


/* =========================================================
   CREAR URL QUE SE ABRIRÁ
   ========================================================= */

function buildOpenUrl(
  data,
  type
) {

  /*
    Si server.js ya envía una URL específica,
    respetamos esa URL.
  */

  if (
    data?.url &&
    typeof data.url === 'string' &&
    data.url.startsWith('/')
  ) {

    return data.url;

  }


  const params =
    new URLSearchParams();


  /*
    Conversación.
  */

  const conversationId =
    data?.conversationId ||
    data?.conversation_id;


  if (conversationId) {

    params.set(
      'conversation',
      conversationId
    );

  }


  /*
    Usuario que llama/envía.
  */

  const fromUserId =
    data?.fromUserId ||
    data?.from_user_id ||
    data?.callerId ||
    data?.senderId;


  if (fromUserId) {

    params.set(
      'from',
      fromUserId
    );

  }


  /*
    ID de llamada.
  */

  const callId =
    data?.callId ||
    data?.call_id;


  if (callId) {

    params.set(
      'call',
      callId
    );

  }


  if (
    type === 'call' ||
    type === 'video-call'
  ) {

    params.set(
      'incomingCall',
      '1'
    );


    params.set(
      'callType',
      type === 'video-call'
        ? 'video'
        : 'audio'
    );

  }


  const query =
    params.toString();


  return (
    '/chat.html' +
    (
      query
        ? `?${query}`
        : ''
    )
  );

}


/* =========================================================
   TÍTULO
   ========================================================= */

function buildTitle(
  data,
  type
) {

  const sender =
    data?.callerName ||
    data?.callerUsername ||
    data?.fromUsername ||
    data?.senderUsername ||
    data?.username ||
    'VOBIXCHAT';


  if (
    type === 'video-call'
  ) {

    return `📹 Videollamada de ${sender}`;

  }


  if (
    type === 'call'
  ) {

    return `📞 Llamada de ${sender}`;

  }


  return (
    data?.title ||
    sender ||
    'VOBIXCHAT'
  );

}


/* =========================================================
   TEXTO
   ========================================================= */

function buildBody(
  data,
  type
) {

  if (
    type === 'video-call'
  ) {

    return (
      data?.body ||
      'Videollamada entrante'
    );

  }


  if (
    type === 'call'
  ) {

    return (
      data?.body ||
      'Llamada entrante'
    );

  }


  const messageType =
    String(
      data?.messageType ||
      data?.message_type ||
      ''
    ).toLowerCase();


  if (
    messageType === 'audio' ||
    messageType === 'voice'
  ) {

    return '🎤 Nota de voz';

  }


  if (
    messageType === 'image' ||
    messageType === 'photo'
  ) {

    return '📷 Foto';

  }


  if (
    messageType === 'video'
  ) {

    return '🎥 Vídeo';

  }


  return (
    data?.body ||
    data?.content ||
    data?.message ||
    'Nuevo mensaje'
  );

}


/* =========================================================
   TAG
   ========================================================= */

function buildTag(
  data,
  type
) {

  if (
    type === 'call' ||
    type === 'video-call'
  ) {

    return (
      `vobix-call-${
        data?.callId ||
        data?.call_id ||
        Date.now()
      }`
    );

  }


  return (
    `vobix-message-${
      data?.conversationId ||
      data?.conversation_id ||
      'general'
    }`
  );

}


/* =========================================================
   PUSH RECIBIDO
   ========================================================= */

self.addEventListener(
  'push',
  event => {

    const data =
      readPushData(event);


    const type =
      normalizePushType(
        data
      );


    console.log(
      '[VOBIXCHAT SW] Push recibido:',
      type
    );


    const title =
      buildTitle(
        data,
        type
      );


    const body =
      buildBody(
        data,
        type
      );


    const url =
      buildOpenUrl(
        data,
        type
      );


    const isCall =
      type === 'call' ||
      type === 'video-call';


    /*
      Las acciones permiten que Android/navegadores
      compatibles muestren botones.

      En iPhone pueden no mostrarse de la misma forma;
      tocar la notificación seguirá abriendo VobixChat.
    */

    const actions =
      isCall
        ? [
            {
              action:
                'open-call',

              title:
                'Abrir'
            },

            {
              action:
                'dismiss',

              title:
                'Cerrar'
            }
          ]
        : [
            {
              action:
                'open-chat',

              title:
                'Abrir'
            }
          ];


    const options = {

      body,

      icon:
        data?.icon ||
        DEFAULT_ICON,

      badge:
        data?.badge ||
        DEFAULT_BADGE,

      tag:
        buildTag(
          data,
          type
        ),

      /*
        Para llamadas no queremos reemplazar
        silenciosamente una notificación anterior.
      */

      renotify:
        isCall,

      /*
        Para llamada intentamos mantener visible
        la notificación hasta interacción.
      */

      requireInteraction:
        isCall,

      silent:
        false,

      timestamp:
        Date.now(),

      actions,

      data: {

        ...data,

        type,

        url

      }

    };


    event.waitUntil(
      self.registration
        .showNotification(
          title,
          options
        )
    );

  }
);


/* =========================================================
   CLICK EN NOTIFICACIÓN
   ========================================================= */

self.addEventListener(
  'notificationclick',
  event => {

    const notification =
      event.notification;


    const data =
      notification?.data ||
      {};


    const action =
      event.action;


    console.log(
      '[VOBIXCHAT SW] Click:',
      action || 'notification'
    );


    /*
      CERRAR
    */

    if (
      action === 'dismiss'
    ) {

      notification.close();

      return;

    }


    notification.close();


    const targetUrl =
      data.url ||
      '/chat.html';


    event.waitUntil(
      openOrFocusVobixChat(
        targetUrl,
        data
      )
    );

  }
);


/* =========================================================
   ABRIR O ENFOCAR VOBIXCHAT
   ========================================================= */

async function openOrFocusVobixChat(
  targetUrl,
  pushData
) {

  const windowClients =
    await self.clients.matchAll({

      type:
        'window',

      includeUncontrolled:
        true

    });


  /*
    Si VobixChat ya está abierto,
    enfocamos esa ventana.
  */

  for (
    const client
    of windowClients
  ) {

    try {

      const clientUrl =
        new URL(
          client.url
        );


      /*
        Comprobamos que sea nuestro mismo sitio.
      */

      if (
        clientUrl.origin ===
        self.location.origin
      ) {

        /*
          Avisamos a chat.html de qué Push
          acaba de tocar el usuario.
        */

        client.postMessage({

          type:
            'VOBIX_PUSH_OPEN',

          payload:
            pushData

        });


        /*
          Si podemos navegar esa ventana
          hacia la conversación/llamada correcta.
        */

        if (
          'navigate' in client
        ) {

          try {

            await client.navigate(
              targetUrl
            );

          } catch (error) {

            console.warn(
              '[VOBIXCHAT SW] navigate:',
              error
            );

          }

        }


        if (
          'focus' in client
        ) {

          return client.focus();

        }

      }

    } catch (error) {

      console.warn(
        '[VOBIXCHAT SW] client:',
        error
      );

    }

  }


  /*
    VobixChat no estaba abierto.
    Abrimos una ventana nueva.
  */

  if (
    self.clients.openWindow
  ) {

    return self.clients.openWindow(
      targetUrl
    );

  }


  return null;

}


/* =========================================================
   CERRAR NOTIFICACIÓN
   ========================================================= */

self.addEventListener(
  'notificationclose',
  event => {

    console.log(
      '[VOBIXCHAT SW] Notificación cerrada:',
      event.notification?.tag
    );

  }
);


/* =========================================================
   MENSAJES DESDE CHAT.HTML
   ========================================================= */

self.addEventListener(
  'message',
  event => {

    const data =
      event.data ||
      {};


    /*
      Permite activar inmediatamente
      una versión nueva del service worker.
    */

    if (
      data.type ===
      'SKIP_WAITING'
    ) {

      self.skipWaiting();

      return;

    }


    /*
      Permite comprobar desde chat.html
      que el service worker está funcionando.
    */

    if (
      data.type ===
      'VOBIX_PING'
    ) {

      event.source?.postMessage({

        type:
          'VOBIX_PONG',

        version:
          VOBIX_SW_VERSION

      });

    }

  }
);


/* =========================================================
   PUSH SUBSCRIPTION CHANGE
   =========================================================
   Algunos navegadores pueden cambiar o invalidar
   automáticamente una suscripción.

   Avisamos a las ventanas abiertas para que chat.html
   vuelva a registrar la suscripción con el servidor.
   ========================================================= */

self.addEventListener(
  'pushsubscriptionchange',
  event => {

    console.log(
      '[VOBIXCHAT SW] Suscripción Push cambió'
    );


    event.waitUntil(
      notifyClientsPushSubscriptionChanged()
    );

  }
);


async function notifyClientsPushSubscriptionChanged() {

  const clients =
    await self.clients.matchAll({

      type:
        'window',

      includeUncontrolled:
        true

    });


  for (
    const client
    of clients
  ) {

    client.postMessage({

      type:
        'VOBIX_PUSH_SUBSCRIPTION_CHANGED'

    });

  }

}


/* =========================================================
   ERROR GENERAL
   ========================================================= */

self.addEventListener(
  'error',
  event => {

    console.error(
      '[VOBIXCHAT SW] Error:',
      event?.message ||
      event
    );

  }
);


/* =========================================================
   PROMESA RECHAZADA
   ========================================================= */

self.addEventListener(
  'unhandledrejection',
  event => {

    console.error(
      '[VOBIXCHAT SW] Promise error:',
      event?.reason ||
      event
    );

  }
);


/* =========================================================
   FIN
   ========================================================= */
