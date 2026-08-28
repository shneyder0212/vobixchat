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
    authorization.startsWith('Bearer ')
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

  const now = Date.now();

  for (
    const [token, session]
    of Object.entries(sessions)
  ) {

    if (
      now - session.createdAt >
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
    getSessionByToken(token);


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

function sendPin(req, res) {

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
      'VOBIXCHAT DATABASE REGISTER ERROR:',
      error.message
    );


    return res
      .status(500)
      .json({

        ok: false,

        msg:
          'No se pudo guardar el usuario'

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
// COMPROBAR SESIÓN
// ======================================================

app.get(
  '/api/session',
  async (req, res) => {

    cleanExpiredSessions();

    const token =
      getToken(req);

    const session =
      getSessionByToken(token);


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
  (req, res) => {

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
  async (req, res) => {

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
  (socket, next) => {

    try {

      const auth =
        socket.handshake.auth || {};


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
        getSessionByToken(token);


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
        ON u.id = cp.user_id

      WHERE cp.conversation_id = $1
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

  const sockets = [];


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
        { conversationId } = {},
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
              conversationId || ''
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
            conversationId || ''
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


          const conversationId =
            String(
              data.conversationId || ''
            ).trim();


          if (!conversationId) {

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
                  'No tienes acceso'

              });

            }

            return;

          }


          const room =
            `conversation:${conversationId}`;


          socket
            .to(room)
            .emit(
              'conversation-message',
              {

                conversationId,

                message:
                  data.message || null,

                senderUserId:
                  socket.vobixUserId,

                senderUsername:
                  socket.vobixUsername

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
                'No se pudo distribuir el mensaje'

            });

          }

        }

      }
    );


    // ==================================================
    // ESCRIBIENDO
    // ==================================================

    socket.on(
      'conversation-typing',
      async ({
        conversationId,
        typing
      } = {}) => {

        try {

          if (
            !socket.vobixAuthenticated ||
            !socket.vobixUserId
          ) {
            return;
          }


          const id =
            String(
              conversationId || ''
            ).trim();


          if (!id) {
            return;
          }


          const allowed =
            await socketCanAccessConversation(
              id,
              socket.vobixUserId
            );


          if (!allowed) {
            return;
          }


          socket
            .to(
              `conversation:${id}`
            )
            .emit(
              'conversation-typing',
              {

                conversationId:
                  id,

                userId:
                  socket.vobixUserId,

                username:
                  socket.vobixUsername,

                typing:
                  Boolean(typing)

              }
            );


        } catch (error) {

          console.error(
            'VOBIXCHAT TYPING ERROR:',
            error.message
          );

        }

      }
    );


    // ==================================================
    // LLAMADA - INICIAR
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
                msg:
                  'Autenticación requerida'
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


          const callType =
            data.type === 'video'
              ? 'video'
              : 'audio';


          if (!conversationId) {

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


          const target =
            await getOtherParticipant(
              conversationId,
              socket.vobixUserId
            );


          if (!target) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({
                ok: false,
                msg:
                  'No encontramos al destinatario'
              });

            }

            return;

          }


          const callId =
            crypto
              .randomBytes(16)
              .toString('hex');


          const payload = {

            callId,

            conversationId,

            conversation_id:
              conversationId,

            type:
              callType,

            caller: {

              id:
                socket.vobixUserId,

              username:
                socket.vobixUsername

            },

            callerUserId:
              socket.vobixUserId,

            callerUsername:
              socket.vobixUsername

          };


          const delivered =
            emitToUser(
              target.user_id,
              'call:incoming',
              payload
            );


          if (
            delivered === 0
          ) {

            socket.emit(
              'call:unavailable',
              {

                callId,

                conversationId,

                reason:
                  'offline',

                message:
                  'El usuario no está conectado'

              }
            );

          }


          if (
            typeof callback ===
            'function'
          ) {

            callback({

              ok:
                delivered > 0,

              callId,

              conversationId,

              targetUserId:
                target.user_id,

              online:
                delivered > 0,

              msg:
                delivered > 0
                  ? 'Llamada enviada'
                  : 'El usuario no está conectado'

            });

          }


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
    // LLAMADA - ACEPTAR
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


          const target =
            await getOtherParticipant(
              conversationId,
              socket.vobixUserId
            );


          if (!target) {
            return;
          }


          emitToUser(
            target.user_id,
            'call:accepted',
            {

              callId,

              conversationId,

              conversation_id:
                conversationId,

              userId:
                socket.vobixUserId,

              username:
                socket.vobixUsername

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


          if (
            typeof callback ===
            'function'
          ) {

            callback({
              ok: false,
              msg:
                'No se pudo aceptar la llamada'
            });

          }

        }

      }
    );


    // ==================================================
    // LLAMADA - RECHAZAR
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


          const target =
            await getOtherParticipant(
              conversationId,
              socket.vobixUserId
            );


          if (!target) {
            return;
          }


          emitToUser(
            target.user_id,
            'call:rejected',
            {

              callId,

              conversationId,

              conversation_id:
                conversationId,

              userId:
                socket.vobixUserId,

              username:
                socket.vobixUsername

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


          if (
            typeof callback ===
            'function'
          ) {

            callback({
              ok: false
            });

          }

        }

      }
    );


    // ==================================================
    // LLAMADA - CANCELAR / COLGAR
    // ==================================================

    socket.on(
      'call:end',
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


          const target =
            await getOtherParticipant(
              conversationId,
              socket.vobixUserId
            );


          if (!target) {
            return;
          }


          emitToUser(
            target.user_id,
            'call:ended',
            {

              callId,

              conversationId,

              conversation_id:
                conversationId,

              userId:
                socket.vobixUserId,

              username:
                socket.vobixUsername,

              reason:
                data.reason ||
                'ended'

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
            'VOBIXCHAT CALL END ERROR:',
            error.message
          );


          if (
            typeof callback ===
            'function'
          ) {

            callback({
              ok: false
            });

          }

        }

      }
    );


    // ==================================================
    // WEBRTC - OFFER
    // ==================================================

    socket.on(
      'call:offer',
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


          const target =
            await getOtherParticipant(
              conversationId,
              socket.vobixUserId
            );


          if (!target) {
            return;
          }


          emitToUser(
            target.user_id,
            'call:offer',
            {

              callId:
                data.callId || '',

              conversationId,

              conversation_id:
                conversationId,

              fromUserId:
                socket.vobixUserId,

              fromUsername:
                socket.vobixUsername,

              type:
                data.type === 'video'
                  ? 'video'
                  : 'audio',

              offer:
                data.offer

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
            'VOBIXCHAT CALL OFFER ERROR:',
            error.message
          );


          if (
            typeof callback ===
            'function'
          ) {

            callback({
              ok: false
            });

          }

        }

      }
    );


    // ==================================================
    // WEBRTC - ANSWER
    // ==================================================

    socket.on(
      'call:answer',
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


          const target =
            await getOtherParticipant(
              conversationId,
              socket.vobixUserId
            );


          if (!target) {
            return;
          }


          emitToUser(
            target.user_id,
            'call:answer',
            {

              callId:
                data.callId || '',

              conversationId,

              conversation_id:
                conversationId,

              fromUserId:
                socket.vobixUserId,

              fromUsername:
                socket.vobixUsername,

              answer:
                data.answer

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
            'VOBIXCHAT CALL ANSWER ERROR:',
            error.message
          );


          if (
            typeof callback ===
            'function'
          ) {

            callback({
              ok: false
            });

          }

        }

      }
    );


    // ==================================================
    // WEBRTC - ICE CANDIDATE
    // ==================================================

    socket.on(
      'call:ice',
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


          if (
            !conversationId ||
            !data.candidate
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


          const target =
            await getOtherParticipant(
              conversationId,
              socket.vobixUserId
            );


          if (!target) {
            return;
          }


          emitToUser(
            target.user_id,
            'call:ice',
            {

              callId:
                data.callId || '',

              conversationId,

              conversation_id:
                conversationId,

              fromUserId:
                socket.vobixUserId,

              candidate:
                data.candidate

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
            'VOBIXCHAT CALL ICE ERROR:',
            error.message
          );


          if (
            typeof callback ===
            'function'
          ) {

            callback({
              ok: false
            });

          }

        }

      }
    );


    // ==================================================
    // CHAT ANTIGUO
    // ==================================================

    socket.on(
      'chat',
      data => {

        io.emit(
          'chat',
          data
        );

      }
    );


    // ==================================================
    // REUNIONES
    // ==================================================

    socket.on(
      'meet-join',
      ({ room } = {}) => {

        if (!room) {
          return;
        }


        const safeRoom =
          String(room)
            .trim()
            .slice(
              0,
              150
            );


        if (!safeRoom) {
          return;
        }


        socket.join(
          safeRoom
        );


        socket
          .to(safeRoom)
          .emit(
            'meet-user-joined',
            {

              id:
                socket.id

            }
          );


        const others =
          Array.from(
            io.sockets
              .adapter
              .rooms
              .get(safeRoom) ||
            []
          )
            .filter(
              id =>
                id !== socket.id
            )
            .map(
              id => ({
                id
              })
            );


        io
          .to(socket.id)
          .emit(
            'meet-users',
            others
          );

      }
    );


    socket.on(
      'meet-signal',
      ({
        to,
        signal
      } = {}) => {

        if (
          !to ||
          !signal
        ) {
          return;
        }


        io
          .to(to)
          .emit(
            'meet-signal',
            {

              from:
                socket.id,

              signal

            }
          );

      }
    );


    socket.on(
      'meet-leave',
      ({
        room
      } = {}) => {

        if (!room) {
          return;
        }


        const safeRoom =
          String(room)
            .trim()
            .slice(
              0,
              150
            );


        if (!safeRoom) {
          return;
        }


        socket.leave(
          safeRoom
        );


        socket
          .to(safeRoom)
          .emit(
            'meet-user-left',
            socket.id
          );

      }
    );


    // ==================================================
    // DESCONEXIÓN
    // ==================================================

    socket.on(
      'disconnect',
      () => {

        io.emit(
          'meet-user-left',
          socket.id
        );

      }
    );


  }
);


// ======================================================
// LIMPIEZA AUTOMÁTICA
// ======================================================

setInterval(
  cleanExpiredSessions,
  60 * 60 * 1000
);


// ======================================================
// PUERTO
// ======================================================

const PORT =
  process.env.PORT ||
  3000;


// ======================================================
// INICIAR VOBIXCHAT
// ======================================================

async function startVobixChat() {

  console.log(
    'VOBIXCHAT CORE: iniciando...'
  );


  const connected =
    await database
      .testConnection();


  if (!connected) {

    console.error(
      'VOBIXCHAT CORE: PostgreSQL NO conectado'
    );

    console.error(
      'VOBIXCHAT CORE: servidor no iniciado'
    );

    process.exit(1);

  }


  console.log(
    'VOBIXCHAT CORE: PostgreSQL conectado correctamente'
  );


  const schemaReady =
    await initializeDatabase();


  if (!schemaReady) {

    console.error(
      'VOBIXCHAT CORE: ERROR preparando la base de datos'
    );

    console.error(
      'VOBIXCHAT CORE: servidor no iniciado'
    );

    process.exit(1);

  }


  console.log(
    'VOBIXCHAT CORE: Base de datos preparada correctamente'
  );


  server.listen(
    PORT,
    () => {

      console.log(
        `VobixChat LISTO | Puerto ${PORT}`
      );


      console.log(
        `PIN pruebas: ${
          config.TEST_PIN_MODE
            ? 'ACTIVADO'
            : 'DESACTIVADO'
        }`
      );


      console.log(
        'VOBIXCHAT CORE: API privada de chat preparada'
      );


      console.log(
        'VOBIXCHAT CORE: Socket.IO privado preparado'
      );


      console.log(
        'VOBIXCHAT CORE: señalización de llamadas preparada'
      );


      console.log(
        'VOBIXCHAT CORE: servidor operativo'
      );

    }
  );

}


// ======================================================
// ARRANQUE
// ======================================================

startVobixChat()
  .catch(error => {

    console.error(
      'VOBIXCHAT CORE FATAL ERROR:',
      error.message
    );

    process.exit(1);

  });
