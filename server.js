'use strict';

/*
==========================================================
 VOBIXCHAT SERVER
 server.js

 Núcleo:
 - Express
 - PostgreSQL / Supabase
 - Inicialización automática del schema
 - Registro y PIN
 - Sesiones
 - API privada autenticada
 - Contactos
 - Conversaciones privadas
 - Mensajes persistentes
 - Socket.IO
 - Salas privadas
 - Señalización WebRTC privada
 - Llamadas de voz
 - Videollamadas
 - Reuniones
 - Health check
==========================================================
*/

const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const path = require('path');

const config = require('./config');
const database = require('./database/db');
const { initializeDatabase } = require('./database/schema');
const { normalizePhone } = require('./core/users');
const chatRoutes = require('./routes/chat');


// ======================================================
// APP / SERVIDOR
// ======================================================

const app = express();
const server = http.createServer(app);


// ======================================================
// SOCKET.IO
// ======================================================

const io = new Server(server, {

  cors: {
    origin: '*'
  }

});


// ======================================================
// COMPARTIR SOCKET.IO CON LAS RUTAS EXPRESS
// ======================================================

app.set('io', io);


// ======================================================
// MIDDLEWARE
// ======================================================

app.use(express.json({
  limit: '1mb'
}));

app.use(
  express.static(
    path.join(__dirname, 'public')
  )
);


// ======================================================
// SEGURIDAD / PIN / SESIONES
// ======================================================

const pins = {};
const pendingUsers = {};
const sessions = {};

/*
  Llamadas pendientes cuando el destinatario
  no tiene Socket.IO abierto.

  Esto evita responder inmediatamente
  "usuario no conectado".

  IMPORTANTE:
  Las Push Notifications para despertar
  un iPhone cerrado se implementarán
  posteriormente.
*/

const pendingCalls =
  new Map();

const PENDING_CALL_TTL_MS =
  45 * 1000;


const SESSION_TTL_MS =
  7 * 24 * 60 * 60 * 1000;


// ======================================================
// CREAR TOKEN SEGURO
// ======================================================

function createSessionToken() {

  return crypto
    .randomBytes(32)
    .toString('hex');

}


// ======================================================
// OBTENER TOKEN HTTP
// ======================================================

function getToken(req) {

  const authorization =
    req.headers.authorization || '';

  if (
    authorization.startsWith(
      'Bearer '
    )
  ) {

    return authorization
      .slice(7)
      .trim();

  }

  return '';

}


// ======================================================
// LIMPIAR SESIONES VENCIDAS
// ======================================================

function cleanExpiredSessions() {

  const now =
    Date.now();


  for (
    const [token, session]
    of Object.entries(sessions)
  ) {

    if (
      now -
      session.createdAt >
      SESSION_TTL_MS
    ) {

      delete sessions[token];

    }

  }

}


// ======================================================
// OBTENER SESIÓN VÁLIDA
// ======================================================

function getSessionByToken(token) {

  if (!token) {
    return null;
  }


  const session =
    sessions[token];


  if (!session) {
    return null;
  }


  if (
    Date.now() -
    session.createdAt >
    SESSION_TTL_MS
  ) {

    delete sessions[token];

    return null;

  }


  return session;

}


// ======================================================
// AUTENTICACIÓN API PRIVADA
// ======================================================

async function requireAuth(
  req,
  res,
  next
) {

  cleanExpiredSessions();


  const token =
    getToken(req);


  const session =
    getSessionByToken(
      token
    );


  if (!session) {

    return res
      .status(401)
      .json({

        ok: false,

        authenticated: false,

        msg:
          'Sesión no válida o caducada'

      });

  }


  try {

    const result =
      await database.query(
        `
        SELECT
          id,
          username,
          phone,
          vobix_id,
          avatar_url,
          verified,
          online,
          last_seen

        FROM users

        WHERE id = $1

        LIMIT 1
        `,
        [
          session.userId
        ]
      );


    if (
      result.rows.length === 0
    ) {

      delete sessions[token];


      return res
        .status(401)
        .json({

          ok: false,

          authenticated: false

        });

    }


    const user =
      result.rows[0];


    if (!user.verified) {

      delete sessions[token];


      return res
        .status(401)
        .json({

          ok: false,

          authenticated: false

        });

    }


    req.vobixUser =
      user;

    req.vobixToken =
      token;


    return next();


  } catch (error) {

    console.error(
      'VOBIXCHAT AUTH ERROR:',
      error.message
    );


    return res
      .status(500)
      .json({

        ok: false,

        authenticated: false,

        msg:
          'Error comprobando la sesión'

      });

  }

}


// ======================================================
// GENERAR PIN
// ======================================================

function sendPin(
  req,
  res
) {

  const phone =
    normalizePhone(
      req.body.phone || ''
    );


  const username =
    String(
      req.body.username ||
      req.body.user ||
      ''
    ).trim();


  if (
    !phone ||
    !username
  ) {

    return res
      .status(400)
      .json({

        ok: false,

        msg:
          'Falta usuario o teléfono'

      });

  }


  if (
    !config.TEST_PIN_MODE
  ) {

    return res
      .status(503)
      .json({

        ok: false,

        msg:
          'SMS real todavía no configurado'

      });

  }


  const pin =
    String(
      config.TEST_PIN
    );


  pins[phone] = {

    pin,

    createdAt:
      Date.now(),

    attempts: 0

  };


  pendingUsers[phone] = {

    username,

    createdAt:
      Date.now()

  };


  console.log(
    `VOBIXCHAT | PIN PRUEBAS GENERADO | ${username}`
  );


  return res.json({

    ok: true,

    pin,

    testMode: true

  });

}


// ======================================================
// RUTAS PIN
// ======================================================

app.post(
  '/send-pin',
  sendPin
);


app.post(
  '/api/send-pin',
  sendPin
);


// ======================================================
// VERIFICAR PIN
// ======================================================

async function verifyPin(
  req,
  res
) {

  const phone =
    normalizePhone(
      req.body.phone || ''
    );


  const pin =
    String(
      req.body.pin || ''
    ).trim();


  if (
    !phone ||
    !pin
  ) {

    return res
      .status(400)
      .json({

        ok: false,

        msg:
          'Faltan datos'

      });

  }


  const pinData =
    pins[phone];


  if (!pinData) {

    return res
      .status(400)
      .json({

        ok: false,

        msg:
          'Solicita un PIN primero'

      });

  }


  if (
    Date.now() -
    pinData.createdAt >
    config.PIN_TTL_MS
  ) {

    delete pins[phone];

    delete pendingUsers[phone];


    return res
      .status(400)
      .json({

        ok: false,

        msg:
          'El PIN ha caducado. Solicita otro.'

      });

  }


  if (
    pinData.attempts >=
    config.PIN_MAX_ATTEMPTS
  ) {

    delete pins[phone];

    delete pendingUsers[phone];


    return res
      .status(429)
      .json({

        ok: false,

        msg:
          'Demasiados intentos. Solicita otro PIN.'

      });

  }


  if (
    pinData.pin !== pin
  ) {

    pinData.attempts += 1;


    return res
      .status(400)
      .json({

        ok: false,

        msg:
          'PIN incorrecto',

        attemptsLeft:
          Math.max(
            0,
            config.PIN_MAX_ATTEMPTS -
            pinData.attempts
          )

      });

  }


  const pending =
    pendingUsers[phone];


  if (!pending) {

    return res
      .status(400)
      .json({

        ok: false,

        msg:
          'Registro no encontrado'

      });

  }


  try {

    const result =
      await database.query(
        `
        INSERT INTO users
        (
          username,
          phone,
          verified,
          online,
          created_at,
          updated_at
        )

        VALUES
        (
          $1,
          $2,
          TRUE,
          FALSE,
          NOW(),
          NOW()
        )

        ON CONFLICT (phone)

        DO UPDATE SET

          username =
            EXCLUDED.username,

          verified =
            TRUE,

          updated_at =
            NOW()

        RETURNING

          id,
          username,
          phone,
          vobix_id,
          avatar_url,
          verified,
          created_at,
          updated_at
        `,
        [
          pending.username,
          phone
        ]
      );


    const user =
      result.rows[0];


    const token =
      createSessionToken();


    sessions[token] = {

      userId:
        user.id,

      phone:
        user.phone,

      username:
        user.username,

      createdAt:
        Date.now()

    };


    delete pins[phone];

    delete pendingUsers[phone];


    console.log(
      `VOBIXCHAT | SESIÓN CREADA | ${user.username}`
    );


    return res.json({

      ok: true,

      token,

      user: {

        id:
          user.id,

        username:
          user.username,

        phone:
          user.phone,

        vobixId:
          user.vobix_id,

        avatarUrl:
          user.avatar_url,

        verified:
          user.verified

      }

    });


  } catch (error) {

    console.error(
      'VOBIXCHAT VERIFY PIN ERROR:',
      error.message
    );


    return res
      .status(500)
      .json({

        ok: false,

        msg:
          'No se pudo verificar el usuario'

      });

  }

}


// ======================================================
// RUTAS VERIFICAR PIN
// ======================================================

app.post(
  '/verify-pin',
  verifyPin
);


app.post(
  '/api/verify-pin',
  verifyPin
);


// ======================================================
// SESIÓN ACTUAL
// ======================================================

app.get(
  '/api/session',
  async (
    req,
    res
  ) => {

    cleanExpiredSessions();


    const token =
      getToken(req);


    const session =
      getSessionByToken(
        token
      );


    if (!session) {

      return res
        .status(401)
        .json({

          ok: false,

          authenticated: false

        });

    }


    try {

      const result =
        await database.query(
          `
          SELECT
            id,
            username,
            phone,
            vobix_id,
            avatar_url,
            verified,
            online,
            last_seen

          FROM users

          WHERE id = $1

          LIMIT 1
          `,
          [
            session.userId
          ]
        );


      if (
        result.rows.length === 0
      ) {

        delete sessions[token];


        return res
          .status(401)
          .json({

            ok: false,

            authenticated: false

          });

      }


      const user =
        result.rows[0];


      if (!user.verified) {

        delete sessions[token];


        return res
          .status(401)
          .json({

            ok: false,

            authenticated: false

          });

      }


      return res.json({

        ok: true,

        authenticated: true,

        user: {

          id:
            user.id,

          username:
            user.username,

          phone:
            user.phone,

          vobixId:
            user.vobix_id,

          avatarUrl:
            user.avatar_url,

          verified:
            user.verified,

          online:
            user.online,

          lastSeen:
            user.last_seen

        }

      });


    } catch (error) {

      console.error(
        'VOBIXCHAT SESSION ERROR:',
        error.message
      );


      return res
        .status(500)
        .json({

          ok: false,

          authenticated: false

        });

    }

  }
);


// ======================================================
// CERRAR SESIÓN
// ======================================================

app.post(
  '/api/logout',
  (
    req,
    res
  ) => {

    const token =
      getToken(req);


    if (token) {

      delete sessions[token];

    }


    return res.json({
      ok: true
    });

  }
);


// ======================================================
// API PRIVADA CHAT / CONTACTOS / CONVERSACIONES
// ======================================================

app.use(
  '/api/chat',
  requireAuth,
  chatRoutes
);


// ======================================================
// HEALTH
// ======================================================

app.get(
  '/api/health',
  async (
    req,
    res
  ) => {

    try {

      const result =
        await database.query(
          'SELECT NOW() AS server_time'
        );


      return res.json({

        ok: true,

        app:
          'VobixChat',

        database:
          'connected',

        serverTime:
          result.rows[0].server_time

      });


    } catch (error) {

      console.error(
        'VOBIXCHAT DATABASE ERROR:',
        error.message
      );


      return res
        .status(500)
        .json({

          ok: false,

          app:
            'VobixChat',

          database:
            'disconnected'

        });

    }

  }
);


// ======================================================
// SOCKET.IO - AUTENTICACIÓN
// ======================================================

io.use(
  (
    socket,
    next
  ) => {

    try {

      const auth =
        socket.handshake.auth ||
        {};


      const token =
        String(
          auth.token || ''
        ).trim();


      if (!token) {

        socket.vobixAuthenticated =
          false;


        return next();

      }


      const session =
        getSessionByToken(
          token
        );


      if (!session) {

        return next(
          new Error(
            'Sesión no válida'
          )
        );

      }


      socket.vobixAuthenticated =
        true;

      socket.vobixToken =
        token;

      socket.vobixUserId =
        session.userId;

      socket.vobixUsername =
        session.username;


      return next();


    } catch (error) {

      return next(
        new Error(
          'Error de autenticación'
        )
      );

    }

  }
);


// ======================================================
// COMPROBAR ACCESO A CONVERSACIÓN
// ======================================================

async function socketCanAccessConversation(
  conversationId,
  userId
) {

  if (
    !conversationId ||
    !userId
  ) {

    return false;

  }


  const result =
    await database.query(
      `
      SELECT 1

      FROM conversation_participants

      WHERE
        conversation_id = $1
        AND user_id = $2

      LIMIT 1
      `,
      [
        conversationId,
        userId
      ]
    );


  return (
    result.rows.length > 0
  );

}


// ======================================================
// OBTENER LOS PARTICIPANTES DE UNA CONVERSACIÓN
// ======================================================

async function getConversationParticipants(
  conversationId
) {

  const result =
    await database.query(
      `
      SELECT
        cp.user_id,
        u.username

      FROM conversation_participants cp

      INNER JOIN users u
        ON u.id =
          cp.user_id

      WHERE
        cp.conversation_id = $1
      `,
      [
        conversationId
      ]
    );


  return result.rows;

}


// ======================================================
// OBTENER SOCKETS ACTIVOS DE UN USUARIO
// ======================================================

function getUserSockets(
  userId
) {

  const sockets =
    [];


  for (
    const connectedSocket
    of io.sockets.sockets.values()
  ) {

    if (
      connectedSocket.vobixAuthenticated &&
      connectedSocket.vobixUserId != null &&
      String(
        connectedSocket.vobixUserId
      ) ===
      String(
        userId
      )
    ) {

      sockets.push(
        connectedSocket
      );

    }

  }


  return sockets;

}


// ======================================================
// ENVIAR EVENTO A UN USUARIO
// ======================================================

function emitToUser(
  userId,
  eventName,
  payload
) {

  const sockets =
    getUserSockets(
      userId
    );


  for (
    const targetSocket
    of sockets
  ) {

    targetSocket.emit(
      eventName,
      payload
    );

  }


  return sockets.length;

}


// ======================================================
// LOCALIZAR EL OTRO PARTICIPANTE
// ======================================================

async function getOtherParticipant(
  conversationId,
  currentUserId
) {

  const participants =
    await getConversationParticipants(
      conversationId
    );


  return (
    participants.find(
      participant =>
        String(
          participant.user_id
        ) !==
        String(
          currentUserId
        )
    ) ||
    null
  );

}


// ======================================================
// SOCKET.IO
// ======================================================

io.on(
  'connection',
  socket => {


    // ==================================================
    // ENTREGAR LLAMADA PENDIENTE AL RECONECTAR
    // ==================================================

    if (
      socket.vobixAuthenticated &&
      socket.vobixUserId
    ) {

      const pendingKey =
        String(
          socket.vobixUserId
        );


      const pendingCall =
        pendingCalls.get(
          pendingKey
        );


      if (pendingCall) {

        if (
          Date.now() <=
          pendingCall.expiresAt
        ) {

          socket.emit(
            'call:incoming',
            pendingCall.payload
          );

        }


        pendingCalls.delete(
          pendingKey
        );

      }

    }


    socket.on(
      'set-user',
      user => {

        socket.username =
          String(
            user || ''
          ).slice(
            0,
            100
          );

      }
    );


    // ==================================================
    // ENTRAR A CONVERSACIÓN PRIVADA
    // ==================================================

    socket.on(
      'conversation-join',
      async (
        {
          conversationId
        } = {},
        callback
      ) => {

        try {

          if (
            !socket.vobixAuthenticated ||
            !socket.vobixUserId
          ) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({

                ok: false,

                msg:
                  'Autenticación requerida'

              });

            }


            return;

          }


          const id =
            String(
              conversationId ||
              ''
            ).trim();


          if (!id) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({

                ok: false,

                msg:
                  'Conversación no válida'

              });

            }


            return;

          }


          const allowed =
            await socketCanAccessConversation(
              id,
              socket.vobixUserId
            );


          if (!allowed) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({

                ok: false,

                msg:
                  'No tienes acceso'

              });

            }


            return;

          }


          const room =
            `conversation:${id}`;


          socket.join(
            room
          );


          if (
            typeof callback ===
            'function'
          ) {

            callback({

              ok: true,

              conversationId:
                id

            });

          }


        } catch (error) {

          console.error(
            'VOBIXCHAT SOCKET JOIN ERROR:',
            error.message
          );


          if (
            typeof callback ===
            'function'
          ) {

            callback({

              ok: false,

              msg:
                'No se pudo abrir la conversación'

            });

          }

        }

      }
    );


    // ==================================================
    // SALIR DE CONVERSACIÓN
    // ==================================================

    socket.on(
      'conversation-leave',
      ({
        conversationId
      } = {}) => {

        const id =
          String(
            conversationId ||
            ''
          ).trim();


        if (!id) {

          return;

        }


        socket.leave(
          `conversation:${id}`
        );

      }
    );


    // ==================================================
    // MENSAJE PRIVADO
    // ==================================================
    socket.on(
      'conversation-message',
      async (
        {
          conversationId,
          text,
          content
        } = {},
        callback
      ) => {

        try {

          if (
            !socket.vobixAuthenticated ||
            !socket.vobixUserId
          ) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({
                ok: false,
                msg: 'Autenticación requerida'
              });

            }

            return;
          }


          const id =
            String(
              conversationId || ''
            ).trim();


          const messageText =
            String(
              text ??
              content ??
              ''
            )
              .trim()
              .slice(
                0,
                10000
              );


          if (
            !id ||
            !messageText
          ) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({
                ok: false,
                msg: 'Mensaje no válido'
              });

            }

            return;
          }


          const allowed =
            await socketCanAccessConversation(
              id,
              socket.vobixUserId
            );


          if (!allowed) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({
                ok: false,
                msg: 'No tienes acceso'
              });

            }

            return;
          }


          const result =
            await database.query(
              `
              INSERT INTO messages
              (
                conversation_id,
                sender_user_id,
                message_type,
                content,
                created_at,
                updated_at
              )
              VALUES
              (
                $1,
                $2,
                'text',
                $3,
                NOW(),
                NOW()
              )

              RETURNING
                id,
                conversation_id,
                sender_user_id,
                message_type,
                content,
                created_at,
                updated_at
              `,
              [
                id,
                socket.vobixUserId,
                messageText
              ]
            );


          await database.query(
            `
            UPDATE conversations
            SET updated_at = NOW()
            WHERE id = $1
            `,
            [id]
          );


          const message = {

            ...result.rows[0],

            text:
              result.rows[0].content,

            senderId:
              result.rows[0]
                .sender_user_id,

            senderUsername:
              socket.vobixUsername ||
              socket.username ||
              null

          };


          io
            .to(
              `conversation:${id}`
            )
            .emit(
              'conversation-message',
              {
                conversationId:
                  id,

                conversation_id:
                  id,

                message
              }
            );


          if (
            typeof callback ===
            'function'
          ) {

            callback({
              ok: true,
              message
            });

          }


        } catch (error) {

          console.error(
            'VOBIXCHAT SOCKET MESSAGE ERROR:',
            error.message
          );


          if (
            typeof callback ===
            'function'
          ) {

            callback({
              ok: false,
              msg:
                'No se pudo enviar el mensaje'
            });

          }

        }

      }
    );


    // ==================================================
    // INICIAR LLAMADA / VIDEOLLAMADA
    // ==================================================

    socket.on(
      'call:start',
      async (
        data = {},
        callback
      ) => {

        try {

          if (
            !socket.vobixAuthenticated ||
            !socket.vobixUserId
          ) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({
                ok: false,
                msg: 'Autenticación requerida'
              });

            }

            return;
          }


          const conversationId =
            String(
              data.conversationId ||
              data.conversation_id ||
              ''
            ).trim();


          if (!conversationId) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({
                ok: false,
                msg: 'Conversación no válida'
              });

            }

            return;
          }


          const allowed =
            await socketCanAccessConversation(
              conversationId,
              socket.vobixUserId
            );


          if (!allowed) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({
                ok: false,
                msg:
                  'No tienes acceso a esta conversación'
              });

            }

            return;
          }


          const otherParticipant =
            await getOtherParticipant(
              conversationId,
              socket.vobixUserId
            );


          if (!otherParticipant) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({
                ok: false,
                msg:
                  'No se encontró al destinatario'
              });

            }

            return;
          }


          const callType =
            String(
              data.type ||
              data.callType ||
              'audio'
            ).toLowerCase() ===
            'video'
              ? 'video'
              : 'audio';


          const callId =
            String(
              data.callId ||
              crypto.randomUUID()
            );


          const payload = {

            callId,

            conversationId,

            conversation_id:
              conversationId,

            type:
              callType,

            callType,

            fromUserId:
              socket.vobixUserId,

            fromUsername:
              socket.vobixUsername ||
              socket.username ||
              'VOBIXCHAT',

            callerId:
              socket.vobixUserId,

            callerUsername:
              socket.vobixUsername ||
              socket.username ||
              'VOBIXCHAT',

            createdAt:
              Date.now()

          };


          const delivered =
            emitToUser(
              otherParticipant.user_id,
              'call:incoming',
              payload
            );


          /*
          ==================================================
           CORRECCIÓN IMPORTANTE

           ANTES:
           Si delivered === 0, el servidor contestaba
           inmediatamente:
           "El usuario no está conectado".

           AHORA:
           La llamada queda pendiente temporalmente.

           Si el destinatario vuelve a conectar su socket
           dentro del período permitido, recibirá
           call:incoming.

           Para despertar un iPhone con VOBIXCHAT cerrada
           necesitaremos Web Push/APNs en la siguiente fase.
          ==================================================
          */

          if (delivered === 0) {

            const pendingKey =
              String(
                otherParticipant.user_id
              );


            const previous =
              pendingCalls.get(
                pendingKey
              );


            if (
              previous &&
              previous.timer
            ) {

              clearTimeout(
                previous.timer
              );

            }


            const expiresAt =
              Date.now() +
              PENDING_CALL_TTL_MS;


            const timer =
              setTimeout(
                () => {

                  const current =
                    pendingCalls.get(
                      pendingKey
                    );


                  if (
                    current &&
                    current.payload &&
                    current.payload.callId ===
                      callId
                  ) {

                    pendingCalls.delete(
                      pendingKey
                    );


                    emitToUser(
                      socket.vobixUserId,
                      'call:no-answer',
                      {
                        callId,

                        conversationId,

                        conversation_id:
                          conversationId,

                        reason:
                          'no-answer'
                      }
                    );

                  }

                },
                PENDING_CALL_TTL_MS
              );


            pendingCalls.set(
              pendingKey,
              {
                payload,
                expiresAt,
                timer
              }
            );

          }


          if (
            typeof callback ===
            'function'
          ) {

            callback({

              ok: true,

              callId,

              conversationId,

              type:
                callType,

              delivered:
                delivered > 0,

              pending:
                delivered === 0

            });

          }


          socket.emit(
            'call:ringing',
            {

              callId,

              conversationId,

              conversation_id:
                conversationId,

              type:
                callType,

              pending:
                delivered === 0

            }
          );


        } catch (error) {

          console.error(
            'VOBIXCHAT CALL START ERROR:',
            error.message
          );


          if (
            typeof callback ===
            'function'
          ) {

            callback({
              ok: false,
              msg:
                'No se pudo iniciar la llamada'
            });

          }

        }

      }
    );


    // ==================================================
    // ACEPTAR LLAMADA
    // ==================================================

    socket.on(
      'call:accept',
      async (
        data = {},
        callback
      ) => {

        try {

          if (
            !socket.vobixAuthenticated ||
            !socket.vobixUserId
          ) {

            return;
          }


          const conversationId =
            String(
              data.conversationId ||
              data.conversation_id ||
              ''
            ).trim();


          const callId =
            String(
              data.callId ||
              ''
            ).trim();


          if (
            !conversationId ||
            !callId
          ) {

            return;
          }


          const allowed =
            await socketCanAccessConversation(
              conversationId,
              socket.vobixUserId
            );


          if (!allowed) {

            return;
          }


          const otherParticipant =
            await getOtherParticipant(
              conversationId,
              socket.vobixUserId
            );


          if (!otherParticipant) {

            return;
          }


          const pendingKey =
            String(
              socket.vobixUserId
            );


          const pendingCall =
            pendingCalls.get(
              pendingKey
            );


          if (pendingCall) {

            if (
              pendingCall.timer
            ) {

              clearTimeout(
                pendingCall.timer
              );

            }


            pendingCalls.delete(
              pendingKey
            );

          }


          emitToUser(
            otherParticipant.user_id,
            'call:accepted',
            {
              callId,

              conversationId,

              conversation_id:
                conversationId,

              byUserId:
                socket.vobixUserId,

              byUsername:
                socket.vobixUsername ||
                socket.username ||
                null
            }
          );


          if (
            typeof callback ===
            'function'
          ) {

            callback({
              ok: true
            });

          }


        } catch (error) {

          console.error(
            'VOBIXCHAT CALL ACCEPT ERROR:',
            error.message
          );

        }

      }
    );


    // ==================================================
    // RECHAZAR LLAMADA
    // ==================================================

    socket.on(
      'call:reject',
      async (
        data = {},
        callback
      ) => {

        try {

          if (
            !socket.vobixAuthenticated ||
            !socket.vobixUserId
          ) {

            return;
          }


          const conversationId =
            String(
              data.conversationId ||
              data.conversation_id ||
              ''
            ).trim();


          const callId =
            String(
              data.callId ||
              ''
            ).trim();


          if (
            !conversationId ||
            !callId
          ) {

            return;
          }


          const allowed =
            await socketCanAccessConversation(
              conversationId,
              socket.vobixUserId
            );


          if (!allowed) {

            return;
          }


          const otherParticipant =
            await getOtherParticipant(
              conversationId,
              socket.vobixUserId
            );


          if (!otherParticipant) {

            return;
          }


          const pendingKey =
            String(
              socket.vobixUserId
            );


          const pendingCall =
            pendingCalls.get(
              pendingKey
            );


          if (pendingCall) {

            if (
              pendingCall.timer
            ) {

              clearTimeout(
                pendingCall.timer
              );

            }


            pendingCalls.delete(
              pendingKey
            );

          }


          emitToUser(
            otherParticipant.user_id,
            'call:rejected',
            {
              callId,

              conversationId,

              conversation_id:
                conversationId,

              reason:
                data.reason ||
                'rejected'
            }
          );


          if (
            typeof callback ===
            'function'
          ) {

            callback({
              ok: true
            });

          }


        } catch (error) {

          console.error(
            'VOBIXCHAT CALL REJECT ERROR:',
            error.message
          );

        }

      }
    );


    // ==================================================
    // WEBRTC OFFER
    // ==================================================

    socket.on(
      'call:offer',
      async (
        data = {}
      ) => {

        try {

          if (
            !socket.vobixAuthenticated ||
            !socket.vobixUserId
          ) {

            return;
          }


          const conversationId =
            String(
              data.conversationId ||
              data.conversation_id ||
              ''
            ).trim();


          if (
            !conversationId ||
            !data.offer
          ) {

            return;
          }


          const allowed =
            await socketCanAccessConversation(
              conversationId,
              socket.vobixUserId
            );


          if (!allowed) {

            return;
          }


          const otherParticipant =
            await getOtherParticipant(
              conversationId,
              socket.vobixUserId
            );


          if (!otherParticipant) {

            return;
          }


          emitToUser(
            otherParticipant.user_id,
            'call:offer',
            {

              callId:
                data.callId,

              conversationId,

              conversation_id:
                conversationId,

              offer:
                data.offer,

              type:
                data.type ||
                data.callType ||
                'audio',

              fromUserId:
                socket.vobixUserId,

              fromUsername:
                socket.vobixUsername ||
                socket.username ||
                null

            }
          );


        } catch (error) {

          console.error(
            'VOBIXCHAT CALL OFFER ERROR:',
            error.message
          );

        }

      }
    );


    // ==================================================
    // WEBRTC ANSWER
    // ==================================================

    socket.on(
      'call:answer',
      async (
        data = {}
      ) => {

        try {

          if (
            !socket.vobixAuthenticated ||
            !socket.vobixUserId
          ) {

            return;
          }


          const conversationId =
            String(
              data.conversationId ||
              data.conversation_id ||
              ''
            ).trim();


          if (
            !conversationId ||
            !data.answer
          ) {

            return;
          }


          const allowed =
            await socketCanAccessConversation(
              conversationId,
              socket.vobixUserId
            );


          if (!allowed) {

            return;
          }


          const otherParticipant =
            await getOtherParticipant(
              conversationId,
              socket.vobixUserId
            );


          if (!otherParticipant) {

            return;
          }


          emitToUser(
            otherParticipant.user_id,
            'call:answer',
            {

              callId:
                data.callId,

              conversationId,

              conversation_id:
                conversationId,

              answer:
                data.answer,

              fromUserId:
                socket.vobixUserId

            }
          );


        } catch (error) {

          console.error(
            'VOBIXCHAT CALL ANSWER ERROR:',
            error.message
          );

        }

      }
    );


    // ==================================================
    // WEBRTC ICE CANDIDATE
    // ==================================================

    socket.on(
      'call:ice',
      async (
        data = {}
      ) => {

        try {

          if (
            !socket.vobixAuthenticated ||
            !socket.vobixUserId
          ) {

            return;
          }


          const conversationId =
            String(
              data.conversationId ||
              data.conversation_id ||
              ''
            ).trim();


          const candidate =
            data.candidate ||
            data.iceCandidate ||
            null;


          if (
            !conversationId ||
            !candidate
          ) {

            return;
          }


          const allowed =
            await socketCanAccessConversation(
              conversationId,
              socket.vobixUserId
            );


          if (!allowed) {

            return;
          }


          const otherParticipant =
            await getOtherParticipant(
              conversationId,
              socket.vobixUserId
            );


          if (!otherParticipant) {

            return;
          }


          emitToUser(
            otherParticipant.user_id,
            'call:ice',
            {

              callId:
                data.callId,

              conversationId,

              conversation_id:
                conversationId,

              candidate,

              iceCandidate:
                candidate,

              fromUserId:
                socket.vobixUserId

            }
          );


        } catch (error) {

          console.error(
            'VOBIXCHAT CALL ICE ERROR:',
            error.message
          );

        }

      }
    );


    // ==================================================
    // FINALIZAR / CANCELAR LLAMADA
    // ==================================================

    socket.on(
      'call:end',
      async (
        data = {}
      ) => {

        try {

          if (
            !socket.vobixAuthenticated ||
            !socket.vobixUserId
          ) {

            return;
          }


          const conversationId =
            String(
              data.conversationId ||
              data.conversation_id ||
              ''
            ).trim();


          if (!conversationId) {

            return;
          }


          const allowed =
            await socketCanAccessConversation(
              conversationId,
              socket.vobixUserId
            );


          if (!allowed) {

            return;
          }


          const otherParticipant =
            await getOtherParticipant(
              conversationId,
              socket.vobixUserId
            );


          if (!otherParticipant) {

            return;
          }


          const pendingKey =
            String(
              otherParticipant.user_id
            );


          const pendingCall =
            pendingCalls.get(
              pendingKey
            );


          if (
            pendingCall &&
            (
              !data.callId ||
              pendingCall.payload.callId ===
                data.callId
            )
          ) {

            if (
              pendingCall.timer
            ) {

              clearTimeout(
                pendingCall.timer
              );

            }


            pendingCalls.delete(
              pendingKey
            );

          }


          emitToUser(
            otherParticipant.user_id,
            'call:ended',
            {

              callId:
                data.callId,

              conversationId,

              conversation_id:
                conversationId,

              reason:
                data.reason ||
                'ended',

              fromUserId:
                socket.vobixUserId

            }
          );


        } catch (error) {

          console.error(
            'VOBIXCHAT CALL END ERROR:',
            error.message
          );

        }

      }
    );


    // ==================================================
    // COMPATIBILIDAD: CALL:CANCEL
    // ==================================================

    socket.on(
      'call:cancel',
      async (
        data = {}
      ) => {

        try {

          if (
            !socket.vobixAuthenticated ||
            !socket.vobixUserId
          ) {

            return;
          }


          const conversationId =
            String(
              data.conversationId ||
              data.conversation_id ||
              ''
            ).trim();


          if (!conversationId) {

            return;
          }


          const allowed =
            await socketCanAccessConversation(
              conversationId,
              socket.vobixUserId
            );


          if (!allowed) {

            return;
          }


          const otherParticipant =
            await getOtherParticipant(
              conversationId,
              socket.vobixUserId
            );


          if (!otherParticipant) {

            return;
          }


          const pendingKey =
            String(
              otherParticipant.user_id
            );


          const pendingCall =
            pendingCalls.get(
              pendingKey
            );


          if (pendingCall) {

            if (
              pendingCall.timer
            ) {

              clearTimeout(
                pendingCall.timer
              );

            }


            pendingCalls.delete(
              pendingKey
            );

          }


          emitToUser(
            otherParticipant.user_id,
            'call:ended',
            {

              callId:
                data.callId,

              conversationId,

              conversation_id:
                conversationId,

              reason:
                'cancelled',

              fromUserId:
                socket.vobixUserId

            }
          );


        } catch (error) {

          console.error(
            'VOBIXCHAT CALL CANCEL ERROR:',
            error.message
          );

        }

      }
    );


    // ==================================================
    // REUNIONES - CREAR / ENTRAR A SALA
    // ==================================================

    socket.on(
      'meeting:join',
      async (
        data = {},
        callback
      ) => {

        try {

          if (
            !socket.vobixAuthenticated ||
            !socket.vobixUserId
          ) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({
                ok: false,
                msg:
                  'Autenticación requerida'
              });

            }

            return;
          }


          const meetingId =
            String(
              data.meetingId ||
              data.roomId ||
              ''
            )
              .trim()
              .slice(
                0,
                150
              );


          if (!meetingId) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({
                ok: false,
                msg:
                  'Reunión no válida'
              });

            }

            return;
          }


          const room =
            `meeting:${meetingId}`;


          socket.join(
            room
          );


          socket.to(
            room
          ).emit(
            'meeting:user-joined',
            {

              meetingId,

              userId:
                socket.vobixUserId,

              username:
                socket.vobixUsername ||
                socket.username ||
                null,

              socketId:
                socket.id

            }
          );


          if (
            typeof callback ===
            'function'
          ) {

            callback({
              ok: true,
              meetingId,
              socketId:
                socket.id
            });

          }


        } catch (error) {

          console.error(
            'VOBIXCHAT MEETING JOIN ERROR:',
            error.message
          );

        }

      }
    );


    // ==================================================
    // REUNIONES - SEÑALIZACIÓN
    // ==================================================

    socket.on(
      'meeting:signal',
      data => {

        try {

          if (
            !socket.vobixAuthenticated
          ) {

            return;
          }


          const targetSocketId =
            String(
              data?.targetSocketId ||
              ''
            ).trim();


          if (!targetSocketId) {

            return;
          }


          io
            .to(
              targetSocketId
            )
            .emit(
              'meeting:signal',
              {

                ...data,

                fromSocketId:
                  socket.id,

                fromUserId:
                  socket.vobixUserId,

                fromUsername:
                  socket.vobixUsername ||
                  socket.username ||
                  null

              }
            );


        } catch (error) {

          console.error(
            'VOBIXCHAT MEETING SIGNAL ERROR:',
            error.message
          );

        }

      }
    );


    // ==================================================
    // REUNIONES - SALIR
    // ==================================================

    socket.on(
      'meeting:leave',
      data => {

        const meetingId =
          String(
            data?.meetingId ||
            data?.roomId ||
            ''
          ).trim();


        if (!meetingId) {

          return;
        }


        const room =
          `meeting:${meetingId}`;


        socket.leave(
          room
        );


        socket.to(
          room
        ).emit(
          'meeting:user-left',
          {

            meetingId,

            userId:
              socket.vobixUserId,

            socketId:
              socket.id

          }
        );

      }
    );


    // ==================================================
    // DESCONEXIÓN
    // ==================================================

    socket.on(
      'disconnect',
      async reason => {

        console.log(
          'VOBIXCHAT SOCKET DESCONECTADO:',
          socket.id,
          reason
        );


        /*
          No eliminamos llamadas pendientes aquí.

          Un iPhone o navegador puede suspender
          temporalmente Socket.IO y reconectar.

          Las llamadas pendientes tienen su propio
          temporizador.
        */


        if (
          socket.vobixAuthenticated &&
          socket.vobixUserId
        ) {

          try {

            const remainingSockets =
              getUserSockets(
                socket.vobixUserId
              );


            if (
              remainingSockets.length === 0
            ) {

              await database.query(
                `
                UPDATE users

                SET
                  online = FALSE,
                  last_seen = NOW(),
                  updated_at = NOW()

                WHERE id = $1
                `,
                [
                  socket.vobixUserId
                ]
              );

            }


          } catch (error) {

            console.error(
              'VOBIXCHAT DISCONNECT DATABASE ERROR:',
              error.message
            );

          }

        }

      }
    );


    // ==================================================
    // MARCAR ONLINE
    // ==================================================

    if (
      socket.vobixAuthenticated &&
      socket.vobixUserId
    ) {

      database.query(
        `
        UPDATE users

        SET
          online = TRUE,
          updated_at = NOW()

        WHERE id = $1
        `,
        [
          socket.vobixUserId
        ]
      ).catch(
        error => {

          console.error(
            'VOBIXCHAT ONLINE DATABASE ERROR:',
            error.message
          );

        }
      );

    }

  }
);


// ======================================================
// LIMPIAR LLAMADAS PENDIENTES CADUCADAS
// ======================================================

setInterval(
  () => {

    const now =
      Date.now();


    for (
      const [
        userId,
        pendingCall
      ]
      of pendingCalls.entries()
    ) {

      if (
        !pendingCall ||
        now >
          pendingCall.expiresAt
      ) {

        if (
          pendingCall &&
          pendingCall.timer
        ) {

          clearTimeout(
            pendingCall.timer
          );

        }


        pendingCalls.delete(
          userId
        );

      }

    }

  },
  60 * 1000
);


// ======================================================
// PUERTO
// ======================================================

const PORT =
  process.env.PORT ||
  3000;


// ======================================================
// ARRANQUE
// ======================================================

async function startServer() {

  try {

    const databaseReady =
      await initializeDatabase();


    if (!databaseReady) {

      console.error(
        'VOBIXCHAT: la base de datos no pudo inicializarse'
      );

      process.exit(1);

      return;
    }


    server.listen(
      PORT,
      '0.0.0.0',
      () => {

        console.log(
          `VOBIXCHAT funcionando en puerto ${PORT}`
        );

        console.log(
          'VOBIXCHAT DATABASE preparada'
        );

        console.log(
          'VOBIXCHAT CHAT preparado'
        );

        console.log(
          'VOBIXCHAT SOCKET.IO preparado'
        );

        console.log(
          'VOBIXCHAT WEBRTC preparado'
        );

        console.log(
          'VOBIXCHAT LLAMADAS PENDIENTES preparado'
        );

      }
    );


  } catch (error) {

    console.error(
      'VOBIXCHAT START ERROR:',
      error
    );

    process.exit(1);

  }

}


// ======================================================
// ERRORES DE PROCESO
// ======================================================

process.on(
  'unhandledRejection',
  error => {

    console.error(
      'VOBIXCHAT UNHANDLED REJECTION:',
      error
    );

  }
);


process.on(
  'uncaughtException',
  error => {

    console.error(
      'VOBIXCHAT UNCAUGHT EXCEPTION:',
      error
    );

  }
);


// ======================================================
// INICIAR
// ======================================================

startServer();
