/* =========================================================
   VOBIXCHAT
   sw.js
   SERVICE WORKER COMPLETO

   - PUSH DE MENSAJES
   - PUSH DE LLAMADAS
   - PUSH DE VIDEOLLAMADAS
   - LLAMADAS PERDIDAS
   - ABRIR CHAT AL TOCAR NOTIFICACIÓN
   - RECUPERAR CALL ID
   - RECUPERAR CONVERSACIÓN
   - CERRAR NOTIFICACIÓN
   ========================================================= */

'use strict';


/* =========================================================
   INSTALACIÓN
   ========================================================= */

self.addEventListener(
  'install',
  event => {

    console.log(
      'VOBIXCHAT SW | INSTALL'
    );

    /*
      Activar esta versión inmediatamente.
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
      'VOBIXCHAT SW | ACTIVE'
    );

    event.waitUntil(
      self.clients.claim()
    );

  }
);


/* =========================================================
   CONVERTIR PUSH A JSON DE FORMA SEGURA
   ========================================================= */

function getVobixPushData(event) {

  if (!event.data) {

    return {};

  }


  try {

    return event.data.json();

  } catch (error) {

    try {

      return {

        type:
          'message',

        title:
          'VOBIXCHAT',

        body:
          event.data.text()

      };

    } catch (secondError) {

      return {};

    }

  }

}


/* =========================================================
   NORMALIZAR TIPO PUSH
   ========================================================= */

function normalizeVobixPushType(data) {

  const type =
    String(
      data.type ||
      'message'
    )
      .trim()
      .toLowerCase();


  if (
    type === 'call' ||
    type === 'incoming-call' ||
    type === 'incoming_call' ||
    type === 'audio-call'
  ) {

    return 'call';

  }


  if (
    type === 'video-call' ||
    type === 'video_call' ||
    type === 'videocall'
  ) {

    return 'video-call';

  }


  if (
    type === 'missed-call' ||
    type === 'missed_call'
  ) {

    return 'missed-call';

  }


  return 'message';

}


/* =========================================================
   CREAR URL DE DESTINO
   ========================================================= */

function createVobixNotificationUrl(
  data,
  type
) {

  /*
    Si server.js ya envió una URL válida,
    la usamos.
  */

  if (
    data.url &&
    typeof data.url === 'string'
  ) {

    return data.url;

  }


  const params =
    new URLSearchParams();


  /* =======================================================
     CONVERSACIÓN
     ======================================================= */

  const conversationId =
    data.conversationId ||
    data.conversation_id;


  if (conversationId) {

    params.set(
      'conversation',
      String(
        conversationId
      )
    );

  }


  /* =======================================================
     LLAMADA
     ======================================================= */

  if (
    type === 'call' ||
    type === 'video-call'
  ) {

    params.set(
      'incomingCall',
      '1'
    );


    const callId =
      data.callId ||
      data.call_id;


    if (callId) {

      params.set(
        'call',
        String(
          callId
        )
      );

    }


    const callerId =
      data.callerId ||
      data.caller_id ||
      data.fromUserId ||
      data.from;


    if (callerId) {

      params.set(
        'from',
        String(
          callerId
        )
      );

    }


    params.set(
      'callType',
      type === 'video-call'
        ? 'video'
        : 'audio'
    );

  }


  const query =
    params.toString();


  return query
    ? `/chat.html?${query}`
    : '/chat.html';

}


/* =========================================================
   ¿ES LLAMADA?
   ========================================================= */

function isVobixIncomingCall(
  type
) {

  return (
    type === 'call' ||
    type === 'video-call'
  );

}


/* =========================================================
   EVENTO PUSH
   ========================================================= */

self.addEventListener(
  'push',
  event => {

    const data =
      getVobixPushData(
        event
      );


    console.log(
      'VOBIXCHAT SW | PUSH',
      data
    );


    const type =
      normalizeVobixPushType(
        data
      );


    const incomingCall =
      isVobixIncomingCall(
        type
      );


    /* =====================================================
       TÍTULO
       ===================================================== */

    let title =
      String(
        data.title ||
        'VOBIXCHAT'
      );


    if (
      type === 'call' &&
      !data.title
    ) {

      title =
        'Llamada entrante';

    }


    if (
      type === 'video-call' &&
      !data.title
    ) {

      title =
        'Videollamada entrante';

    }


    if (
      type === 'missed-call' &&
      !data.title
    ) {

      title =
        'Llamada perdida';

    }


    /* =====================================================
       TEXTO
       ===================================================== */

    let body =
      String(
        data.body ||
        ''
      );


    if (
      incomingCall &&
      !body
    ) {

      const callerName =
        data.callerName ||
        data.caller_name ||
        data.username ||
        'Usuario';


      body =
        `${callerName} te está llamando`;

    }


    if (
      type === 'message' &&
      !body
    ) {

      body =
        'Tienes un mensaje nuevo';

    }


    /* =====================================================
       URL
       ===================================================== */

    const url =
      createVobixNotificationUrl(
        data,
        type
      );


    /* =====================================================
       TAG

       Para llamadas usamos callId para evitar llenar
       el teléfono con la misma llamada repetida.
       ===================================================== */

    const callId =
      data.callId ||
      data.call_id ||
      null;


    const conversationId =
      data.conversationId ||
      data.conversation_id ||
      null;


    let tag =
      data.tag ||
      'vobixchat';


    if (
      incomingCall &&
      callId
    ) {

      tag =
        `vobix-call-${callId}`;

    }


    if (
      type === 'message' &&
      conversationId
    ) {

      tag =
        `vobix-chat-${conversationId}`;

    }


    /* =====================================================
       OPCIONES DE NOTIFICACIÓN
       ===================================================== */

    const options = {

      body,

      icon:
        data.icon ||
        '/icons/icon-192.png',

      badge:
        data.badge ||
        '/icons/badge-96.png',

      tag,

      renotify:
        incomingCall,

      requireInteraction:
        incomingCall,

      timestamp:
        Number(
          data.timestamp ||
          Date.now()
        ),

      data: {

        ...data,

        type,

        url,

        callId,

        conversationId

      }

    };


    /*
      Vibración.

      En dispositivos/navegadores que la soporten,
      una llamada utiliza un patrón más fuerte.

      El navegador/sistema puede ignorarlo.
    */

    if (incomingCall) {

      options.vibrate = [
        500,
        200,
        500,
        200,
        500,
        200,
        800
      ];


    } else {

      options.vibrate = [
        200,
        100,
        200
      ];

    }


    /* =====================================================
       ACCIONES

       No todos los navegadores muestran botones,
       por eso tocar la notificación completa también
       abre VOBIXCHAT.
       ===================================================== */

    if (incomingCall) {

      options.actions = [

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

      ];

    }


    /* =====================================================
       MOSTRAR NOTIFICACIÓN
       ===================================================== */

    event.waitUntil(

      self.registration
        .showNotification(
          title,
          options
        )
        .catch(
          error => {

            console.error(
              'VOBIXCHAT SW | NOTIFICATION ERROR',
              error
            );

          }
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

    console.log(
      'VOBIXCHAT SW | NOTIFICATION CLICK',
      event.action,
      event.notification?.data
    );


    const notification =
      event.notification;


    const data =
      notification?.data ||
      {};


    /* =====================================================
       CERRAR
       ===================================================== */

    if (
      event.action === 'dismiss'
    ) {

      notification.close();

      return;

    }


    notification.close();


    const destination =
      data.url ||
      '/chat.html';


    event.waitUntil(

      (async () => {

        try {

          const absoluteUrl =
            new URL(
              destination,
              self.location.origin
            ).href;


          /*
            Buscar VOBIXCHAT ya abierta.
          */

          const clientList =
            await self.clients.matchAll({

              type:
                'window',

              includeUncontrolled:
                true

            });


          /* =================================================
             SI YA ESTÁ ABIERTA
             ================================================= */

          for (
            const client
            of clientList
          ) {

            let clientUrl;


            try {

              clientUrl =
                new URL(
                  client.url
                );

            } catch (error) {

              continue;

            }


            if (
              clientUrl.origin !==
              self.location.origin
            ) {

              continue;

            }


            /*
              Avisamos primero al chat.

              chat.html podrá abrir inmediatamente
              la conversación o recuperar la llamada.
            */

            try {

              client.postMessage({

                type:
                  'VOBIX_NOTIFICATION_CLICK',

                pushType:
                  data.type,

                url:
                  absoluteUrl,

                callId:
                  data.callId ||
                  data.call_id ||
                  null,

                conversationId:
                  data.conversationId ||
                  data.conversation_id ||
                  null,

                callerId:
                  data.callerId ||
                  data.caller_id ||
                  data.from ||
                  null,

                callType:
                  data.callType ||
                  data.call_type ||
                  null,

                payload:
                  data

              });

            } catch (error) {

              console.error(
                'VOBIXCHAT SW | POST MESSAGE ERROR',
                error
              );

            }


            /*
              Navegar la ventana existente a la URL
              correcta si es posible.
            */

            try {

              if (
                'navigate' in client
              ) {

                await client.navigate(
                  absoluteUrl
                );

              }

            } catch (error) {

              console.warn(
                'VOBIXCHAT SW | NAVIGATE ERROR',
                error
              );

            }


            /*
              Llevar VOBIXCHAT al frente.
            */

            try {

              if (
                'focus' in client
              ) {

                await client.focus();

              }

            } catch (error) {

              console.warn(
                'VOBIXCHAT SW | FOCUS ERROR',
                error
              );

            }


            return;

          }


          /* =================================================
             VOBIXCHAT ESTÁ CERRADA

             Abrimos una ventana nueva.
             ================================================= */

          if (
            self.clients.openWindow
          ) {

            await self.clients.openWindow(
              absoluteUrl
            );

          }


        } catch (error) {

          console.error(
            'VOBIXCHAT SW | CLICK ERROR',
            error
          );

        }

      })()

    );

  }
);


/* =========================================================
   CIERRE DE NOTIFICACIÓN
   ========================================================= */

self.addEventListener(
  'notificationclose',
  event => {

    const data =
      event.notification?.data ||
      {};


    console.log(
      'VOBIXCHAT SW | NOTIFICATION CLOSED',
      data.type ||
      ''
    );

  }
);


/* =========================================================
   MENSAJES DESDE chat.html
   ========================================================= */

self.addEventListener(
  'message',
  event => {

    const data =
      event.data ||
      {};


    /* =====================================================
       ACTIVAR NUEVA VERSIÓN DEL SW
       ===================================================== */

    if (
      data.type ===
      'SKIP_WAITING'
    ) {

      self.skipWaiting();

      return;

    }


    /* =====================================================
       PING
       ===================================================== */

    if (
      data.type ===
      'VOBIX_SW_PING'
    ) {

      try {

        event.source?.postMessage({

          type:
            'VOBIX_SW_PONG',

          timestamp:
            Date.now()

        });

      } catch (error) {}


      return;

    }

  }
);


/* =========================================================
   IMPORTANTE SOBRE EL TIMBRE

   NO usamos:

       sound: '/ring.mp3'

   porque Web Push no permite obligar de forma fiable
   a Safari/Chrome/iOS a reproducir un MP3 personalizado
   desde showNotification().

   Cuando chat.html está ABIERTO y recibe incoming_call
   por Socket.IO, chat.html reproduce ring.mp3.

   Cuando VOBIXCHAT está cerrada/background, el sistema
   operativo controla el aviso Push permitido para esa
   notificación.

   Al tocar la notificación:
   1. abrimos VOBIXCHAT
   2. conservamos callId en la URL
   3. chat.html conecta Socket.IO
   4. chat.html emite push_call_opened
   5. server.js recupera la llamada
   6. aparece la pantalla de llamada entrante

   ========================================================= */


/* =========================================================
   FIN sw.js
   VOBIXCHAT
   ========================================================= */
