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
 - Presencia en tiempo real
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

const {
  initializeDatabase
} = require('./database/schema');

const {
  normalizePhone
} = require('./core/users');

const chatRoutes = require('./routes/chat');


// ======================================================
// APP / SERVIDOR
// ======================================================

const app = express();

const server =
  http.createServer(app);


// ======================================================
// SOCKET.IO
// ======================================================

const io = new Server(
  server,
  {
    cors: {
      origin: '*'
    },

    transports: [
      'websocket',
      'polling'
    ]
  }
);


// ======================================================
// COMPARTIR SOCKET.IO CON EXPRESS
// ======================================================

app.set(
  'io',
  io
);


// ======================================================
// MIDDLEWARE
// ======================================================

app.use(
  express.json({
    limit: '10mb'
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: '10mb'
  })
);

app.use(
  express.static(
    path.join(
      __dirname,
      'public'
    )
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
    const [
      token,
      session
    ]
    of Object.entries(
      sessions
    )
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

function getSessionByToken(
  token
) {

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
// GENERAR / ENVIAR PIN
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
  requireAuth,
  (
    req,
    res
  ) => {

    return res.json({

      ok: true,

      authenticated: true,

      user: {

        id:
          req.vobixUser.id,

        username:
          req.vobixUser.username,

        phone:
          req.vobixUser.phone,

        vobixId:
          req.vobixUser.vobix_id,

        vobix_id:
          req.vobixUser.vobix_id,

        avatarUrl:
          req.vobixUser.avatar_url,

        avatar_url:
          req.vobixUser.avatar_url,

        verified:
          req.vobixUser.verified,

        online:
          req.vobixUser.online,

        lastSeen:
          req.vobixUser.last_seen

      }

    });

  }
);


// ======================================================
// CERRAR SESIÓN
// ======================================================

app.post(
  '/api/logout',
  requireAuth,
  async (
    req,
    res
  ) => {

    try {

      if (
        req.vobixToken
      ) {

        delete sessions[
          req.vobixToken
        ];

      }

      await database.query(
        `
        UPDATE users

        SET
          online = FALSE,
          last_seen = NOW(),
          updated_at = NOW()

        WHERE
          id = $1
        `,
        [
          req.vobixUser.id
        ]
      );

      return res.json({

        ok: true

      });

    } catch (error) {

      console.error(
        'VOBIXCHAT LOGOUT ERROR:',
        error.message
      );

      return res
        .status(500)
        .json({

          ok: false,

          msg:
            'No se pudo cerrar la sesión'

        });

    }

  }
);


// ======================================================
// PERFIL DEL USUARIO ACTUAL
// ======================================================

app.get(
  '/api/me',
  requireAuth,
  (
    req,
    res
  ) => {

    return res.json({

      ok: true,

      user:
        req.vobixUser

    });

  }
);


// ======================================================
// ACTUALIZAR PERFIL
// ======================================================

app.patch(
  '/api/me',
  requireAuth,
  async (
    req,
    res
  ) => {

    const username =
      String(
        req.body.username ||
        ''
      )
        .trim()
        .slice(
          0,
          100
        );

    const avatarUrl =
      String(
        req.body.avatarUrl ||
        req.body.avatar_url ||
        ''
      )
        .trim()
        .slice(
          0,
          1000
        );

    if (!username) {

      return res
        .status(400)
        .json({

          ok: false,

          msg:
            'El nombre de usuario es obligatorio'

        });

    }

    try {

      const result =
        await database.query(
          `
          UPDATE users

          SET
            username = $1,
            avatar_url =
              NULLIF(
                $2,
                ''
              ),
            updated_at = NOW()

          WHERE
            id = $3

          RETURNING
            id,
            username,
            phone,
            vobix_id,
            avatar_url,
            verified,
            online,
            last_seen,
            created_at,
            updated_at
          `,
          [
            username,
            avatarUrl,
            req.vobixUser.id
          ]
        );

      return res.json({

        ok: true,

        user:
          result.rows[0]

      });

    } catch (error) {

      console.error(
        'VOBIXCHAT UPDATE PROFILE ERROR:',
        error.message
      );

      return res
        .status(500)
        .json({

          ok: false,

          msg:
            'No se pudo actualizar el perfil'

        });

    }

  }
);


// ======================================================
// API DE CHAT PRIVADO
// ======================================================

app.use(
  '/api/chat',
  requireAuth,
  chatRoutes
);


// ======================================================
// HEALTH CHECK
// ======================================================

app.get(
  '/health',
  async (
    req,
    res
  ) => {

    try {

      await database.query(
        'SELECT 1'
      );

      return res.json({

        ok: true,

        service:
          'VOBIXCHAT',

        database:
          'connected',

        timestamp:
          new Date()
            .toISOString()

      });

    } catch (error) {

      console.error(
        'VOBIXCHAT HEALTH ERROR:',
        error.message
      );

      return res
        .status(503)
        .json({

          ok: false,

          service:
            'VOBIXCHAT',

          database:
            'disconnected'

        });

    }

  }
);


// ======================================================
// MAPA DE SOCKETS / USUARIOS
// ======================================================

const socketUsers =
  new Map();

const userSockets =
  new Map();


// ======================================================
// AGREGAR SOCKET A USUARIO
// ======================================================

function addUserSocket(
  userId,
  socketId
) {

  const id =
    String(
      userId
    );

  if (
    !userSockets.has(
      id
    )
  ) {

    userSockets.set(
      id,
      new Set()
    );

  }

  userSockets
    .get(id)
    .add(
      socketId
    );

}


// ======================================================
// QUITAR SOCKET DE USUARIO
// ======================================================

function removeUserSocket(
  userId,
  socketId
) {

  const id =
    String(
      userId
    );

  const sockets =
    userSockets.get(
      id
    );

  if (!sockets) {

    return 0;

  }

  sockets.delete(
    socketId
  );

  if (
    sockets.size === 0
  ) {

    userSockets.delete(
      id
    );

    return 0;

  }

  return sockets.size;

}


// ======================================================
// ENVIAR EVENTO A TODOS LOS DISPOSITIVOS DE UN USUARIO
// ======================================================

function emitToUser(
  userId,
  eventName,
  payload
) {

  const sockets =
    userSockets.get(
      String(
        userId
      )
    );

  if (!sockets) {

    return;

  }

  for (
    const socketId
    of sockets
  ) {

    io
      .to(
        socketId
      )
      .emit(
        eventName,
        payload
      );

  }

}


// ======================================================
// AUTENTICACIÓN DE SOCKET.IO
// ======================================================

io.use(
  async (
    socket,
    next
  ) => {

    try {

      cleanExpiredSessions();

      let token =
        String(
          socket.handshake
            .auth?.token ||
          ''
        ).trim();

      if (!token) {

        const authorization =
          String(
            socket.handshake
              .headers
              .authorization ||
            ''
          );

        if (
          authorization.startsWith(
            'Bearer '
          )
        ) {

          token =
            authorization
              .slice(7)
              .trim();

        }

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

          WHERE
            id = $1
            AND verified = TRUE

          LIMIT 1
          `,
          [
            session.userId
          ]
        );

      if (
        result.rows.length === 0
      ) {

        return next(
          new Error(
            'Usuario no válido'
          )
        );

      }

      socket.vobixUser =
        result.rows[0];

      socket.vobixToken =
        token;

      return next();

    } catch (error) {

      console.error(
        'VOBIXCHAT SOCKET AUTH ERROR:',
        error.message
      );

      return next(
        new Error(
          'Error de autenticación'
        )
      );

    }

  }
);


// ======================================================
// COMPROBAR PARTICIPACIÓN EN CONVERSACIÓN
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
// COMPROBAR BLOQUEO PARA SOCKET
// ======================================================

async function socketConversationBlocked(
  conversationId,
  userId
) {

  const result =
    await database.query(
      `
      SELECT 1

      FROM conversation_participants cp

      INNER JOIN user_blocks ub
        ON
        (
          (
            ub.blocker_user_id = $2
            AND
            ub.blocked_user_id =
              cp.user_id
          )

          OR

          (
            ub.blocker_user_id =
              cp.user_id
            AND
            ub.blocked_user_id = $2
          )
        )

      WHERE
        cp.conversation_id = $1
        AND cp.user_id <> $2

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
// CONEXIÓN SOCKET.IO
// ======================================================

io.on(
  'connection',
  async socket => {

    const user =
      socket.vobixUser;

    const userId =
      String(
        user.id
      );

    console.log(
      `VOBIXCHAT | SOCKET CONECTADO | ${user.username} | ${socket.id}`
    );


    // ==================================================
    // REGISTRAR SOCKET
    // ==================================================

    socketUsers.set(
      socket.id,
      userId
    );

    addUserSocket(
      userId,
      socket.id
    );


    // ==================================================
    // SALA PERSONAL
    // ==================================================

    socket.join(
      `user:${userId}`
    );


    // ==================================================
    // USUARIO ONLINE
    // ==================================================

    try {

      await database.query(
        `
        UPDATE users

        SET
          online = TRUE,
          last_seen = NOW(),
          updated_at = NOW()

        WHERE
          id = $1
        `,
        [
          userId
        ]
      );

    } catch (error) {

      console.error(
        'VOBIXCHAT ONLINE ERROR:',
        error.message
      );

    }


    // ==================================================
    // AVISAR PRESENCIA
    // ==================================================

    socket.broadcast.emit(
      'presence:update',
      {

        userId,

        username:
          user.username,

        online:
          true,

        lastSeen:
          new Date()
            .toISOString()

      }
    );


    // ==================================================
    // IDENTIDAD DEL SOCKET
    // ==================================================

    socket.emit(
      'session:ready',
      {

        ok: true,

        socketId:
          socket.id,

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
            user.avatar_url

        }

      }
    );


    // ==================================================
    // COMPATIBILIDAD set-user
    // ==================================================

    socket.on(
      'set-user',
      (
        payload,
        callback
      ) => {

        const response = {

          ok: true,

          userId:
            user.id,

          username:
            user.username,

          socketId:
            socket.id

        };

        if (
          typeof callback ===
          'function'
        ) {

          callback(
            response
          );

        }

      }
    );
       // ==================================================
    // ENTRAR A SALA PRIVADA DE CONVERSACIÓN
    // ==================================================

    socket.on(
      'conversation-join',
      async (
        payload,
        callback
      ) => {

        try {

          const conversationId =
            String(
              payload?.conversationId ||
              payload?.conversation_id ||
              ''
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
              userId
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


          socket.join(
            `conversation:${conversationId}`
          );


          if (
            typeof callback ===
            'function'
          ) {

            callback({

              ok: true,

              conversationId

            });

          }


        } catch (error) {

          console.error(
            'VOBIXCHAT CONVERSATION JOIN ERROR:',
            error
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
    // SALIR DE SALA
    // ==================================================

    socket.on(
      'conversation-leave',
      payload => {

        const conversationId =
          String(
            payload?.conversationId ||
            payload?.conversation_id ||
            ''
          ).trim();


        if (!conversationId) {

          return;

        }


        socket.leave(
          `conversation:${conversationId}`
        );

      }
    );


    // ==================================================
    // MENSAJE DE TEXTO
    // ==================================================

    socket.on(
      'conversation-message',
      async (
        payload,
        callback
      ) => {

        try {

          const conversationId =
            String(
              payload?.conversationId ||
              payload?.conversation_id ||
              ''
            ).trim();


          const text =
            String(
              payload?.text ||
              payload?.content ||
              ''
            )
              .trim()
              .slice(
                0,
                10000
              );


          if (
            !conversationId ||
            !text
          ) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({

                ok: false,

                msg:
                  'Mensaje no válido'

              });

            }


            return;

          }


          const allowed =
            await socketCanAccessConversation(
              conversationId,
              userId
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


          const blocked =
            await socketConversationBlocked(
              conversationId,
              userId
            );


          if (blocked) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({

                ok: false,

                msg:
                  'No se puede enviar el mensaje'

              });

            }


            return;

          }


          // ==============================================
          // GUARDAR MENSAJE
          // ==============================================

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
                reply_to_message_id,
                edited,
                deleted,
                created_at,
                updated_at
              `,
              [
                conversationId,
                userId,
                text
              ]
            );


          await database.query(
            `
            UPDATE conversations

            SET
              updated_at = NOW()

            WHERE id = $1
            `,
            [
              conversationId
            ]
          );


          const row =
            result.rows[0];


          row.sender_username =
            user.username;


          const message =
            normalizeSocketMessage(
              row
            );


          // ==============================================
          // EMITIR A SALA ABIERTA
          // ==============================================

          io
            .to(
              `conversation:${conversationId}`
            )
            .emit(
              'conversation-message',
              {

                conversationId,

                message

              }
            );


          // ==============================================
          // EMITIR TAMBIÉN A USUARIOS PARTICIPANTES
          // ==============================================

          const participants =
            await getConversationParticipants(
              conversationId
            );


          for (
            const participant
            of participants
          ) {

            if (
              String(
                participant.user_id
              ) ===
              String(
                userId
              )
            ) {

              continue;

            }


            emitToUser(
              participant.user_id,
              'conversation:new-message',
              {

                conversationId,

                message

              }
            );

          }


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
            'VOBIXCHAT MESSAGE ERROR:',
            error
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
    // NUEVO MENSAJE → ACTUALIZAR LISTA
    // ==================================================

    socket.on(
      'conversation:refresh',
      async (
        payload,
        callback
      ) => {

        if (
          typeof callback ===
          'function'
        ) {

          callback({
            ok: true
          });

        }

      }
    );


    // ==================================================
    // PRESENCIA MANUAL
    // ==================================================

    socket.on(
      'presence:ping',
      async callback => {

        try {

          await database.query(
            `
            UPDATE users

            SET
              online = TRUE,
              last_seen = NOW(),
              updated_at = NOW()

            WHERE id = $1
            `,
            [
              userId
            ]
          );


          if (
            typeof callback ===
            'function'
          ) {

            callback({

              ok: true,

              online: true

            });

          }


        } catch (error) {

          console.error(
            'VOBIXCHAT PRESENCE PING ERROR:',
            error.message
          );

        }

      }
    );


    // ==================================================
    // UTILIDAD: OBTENER EL OTRO USUARIO DE LA CONVERSACIÓN
    // ==================================================

    async function getOtherCallParticipants(
      conversationId,
      callerUserId
    ) {

      const participants =
        await getConversationParticipants(
          conversationId
        );


      return participants.filter(
        participant =>
          String(
            participant.user_id
          ) !==
          String(
            callerUserId
          )
      );

    }


    // ==================================================
    // UTILIDAD: VALIDAR LLAMADA
    // ==================================================

    function getCallById(
      callId
    ) {

      if (!callId) {

        return null;

      }


      return (
        activeCalls.get(
          String(
            callId
          )
        ) ||
        null
      );

    }


    // ==================================================
    // UTILIDAD: COMPROBAR PARTICIPANTE DE LLAMADA
    // ==================================================

    function userBelongsToCall(
      call,
      checkUserId
    ) {

      if (
        !call ||
        !checkUserId
      ) {

        return false;

      }


      return call.participants.some(
        participant =>
          String(
            participant.userId
          ) ===
          String(
            checkUserId
          )
      );

    }


    // ==================================================
    // UTILIDAD: ENCONTRAR PARTICIPANTE
    // ==================================================

    function getCallParticipant(
      call,
      participantUserId
    ) {

      if (!call) {

        return null;

      }


      return (
        call.participants.find(
          participant =>
            String(
              participant.userId
            ) ===
            String(
              participantUserId
            )
        ) ||
        null
      );

    }


    // ==================================================
    // UTILIDAD: EMITIR ESTADO DE LLAMADA
    // ==================================================

    function emitCallState(
      call
    ) {

      if (!call) {

        return;

      }


      for (
        const participant
        of call.participants
      ) {

        emitToUser(
          participant.userId,
          'call:state',
          {

            callId:
              call.id,

            conversationId:
              call.conversationId,

            type:
              call.type,

            status:
              call.status,

            createdAt:
              call.createdAt,

            startedAt:
              call.startedAt ||
              null,

            endedAt:
              call.endedAt ||
              null,

            participants:
              call.participants.map(
                item => ({

                  userId:
                    item.userId,

                  username:
                    item.username,

                  avatarUrl:
                    item.avatarUrl ||
                    null,

                  status:
                    item.status

                })
              )

          }
        );

      }

    }


    // ==================================================
    // INICIAR LLAMADA / VIDEOLLAMADA
    // ==================================================

    socket.on(
      'call:start',
      async (
        payload,
        callback
      ) => {

        try {

          const conversationId =
            String(
              payload?.conversationId ||
              payload?.conversation_id ||
              ''
            ).trim();


          const requestedType =
            String(
              payload?.type ||
              'audio'
            )
              .trim()
              .toLowerCase();


          const callType =
            requestedType ===
            'video'
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
              userId
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


          const blocked =
            await socketConversationBlocked(
              conversationId,
              userId
            );


          if (blocked) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({

                ok: false,

                msg:
                  'No se puede iniciar la llamada'

              });

            }


            return;

          }


          const others =
            await getOtherCallParticipants(
              conversationId,
              userId
            );


          if (
            others.length === 0
          ) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({

                ok: false,

                msg:
                  'No hay otro participante'

              });

            }


            return;

          }
                  }


          // ==============================================
          // CREAR ID ÚNICO PARA LA LLAMADA
          // ==============================================

          const callId =
            crypto
              .randomBytes(16)
              .toString('hex');


          // ==============================================
          // PARTICIPANTES
          // ==============================================

          const participants = [

            {
              userId:
                user.id,

              username:
                user.username,

              avatarUrl:
                user.avatar_url ||
                null,

              status:
                'connected'
            }

          ];


          for (
            const other
            of others
          ) {

            participants.push({

              userId:
                other.user_id,

              username:
                other.username,

              avatarUrl:
                other.avatar_url ||
                null,

              status:
                'ringing'

            });

          }


          // ==============================================
          // CREAR LLAMADA
          // ==============================================

          const call = {

            id:
              callId,

            conversationId,

            type:
              callType,

            status:
              'ringing',

            callerUserId:
              String(
                user.id
              ),

            participants,

            createdAt:
              new Date()
                .toISOString(),

            startedAt:
              null,

            endedAt:
              null

          };


          activeCalls.set(
            callId,
            call
          );


          // ==============================================
          // SALA SOCKET DE LA LLAMADA
          // ==============================================

          socket.join(
            `call:${callId}`
          );


          // ==============================================
          // AVISAR A LOS DESTINATARIOS
          // ==============================================

          for (
            const other
            of others
          ) {

            emitToUser(
              other.user_id,
              'call:incoming',
              {

                callId,

                conversationId,

                type:
                  callType,

                caller: {

                  userId:
                    user.id,

                  username:
                    user.username,

                  avatarUrl:
                    user.avatar_url ||
                    null

                },

                createdAt:
                  call.createdAt

              }
            );

          }


          // ==============================================
          // CONFIRMAR AL QUE LLAMA
          // ==============================================

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

              status:
                'ringing'

            });

          }


          emitCallState(
            call
          );


        } catch (error) {

          console.error(
            'VOBIXCHAT CALL START ERROR:',
            error
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
        payload,
        callback
      ) => {

        try {

          const callId =
            String(
              payload?.callId ||
              payload?.call_id ||
              ''
            ).trim();


          const call =
            getCallById(
              callId
            );


          if (!call) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({

                ok: false,

                msg:
                  'La llamada ya no está disponible'

              });

            }


            return;

          }


          const participant =
            getCallParticipant(
              call,
              userId
            );


          if (!participant) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({

                ok: false,

                msg:
                  'No perteneces a esta llamada'

              });

            }


            return;

          }


          participant.status =
            'connected';


          if (
            !call.startedAt
          ) {

            call.startedAt =
              new Date()
                .toISOString();

          }


          call.status =
            'active';


          socket.join(
            `call:${callId}`
          );


          // ==============================================
          // AVISAR A LOS PARTICIPANTES
          // ==============================================

          io
            .to(
              `call:${callId}`
            )
            .emit(
              'call:accepted',
              {

                callId,

                user: {

                  userId:
                    user.id,

                  username:
                    user.username,

                  avatarUrl:
                    user.avatar_url ||
                    null

                }

              }
            );


          emitCallState(
            call
          );


          if (
            typeof callback ===
            'function'
          ) {

            callback({

              ok: true,

              callId,

              status:
                call.status,

              type:
                call.type

            });

          }


        } catch (error) {

          console.error(
            'VOBIXCHAT CALL ACCEPT ERROR:',
            error
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
    // RECHAZAR LLAMADA
    // ==================================================

    socket.on(
      'call:reject',
      (
        payload,
        callback
      ) => {

        try {

          const callId =
            String(
              payload?.callId ||
              payload?.call_id ||
              ''
            ).trim();


          const call =
            getCallById(
              callId
            );


          if (!call) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({

                ok: false,

                msg:
                  'La llamada ya terminó'

              });

            }


            return;

          }


          const participant =
            getCallParticipant(
              call,
              userId
            );


          if (!participant) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({

                ok: false,

                msg:
                  'No perteneces a esta llamada'

              });

            }


            return;

          }


          participant.status =
            'rejected';


          // ==============================================
          // AVISAR AL RESTO
          // ==============================================

          for (
            const item
            of call.participants
          ) {

            if (
              String(
                item.userId
              ) ===
              String(
                userId
              )
            ) {

              continue;

            }


            emitToUser(
              item.userId,
              'call:rejected',
              {

                callId,

                userId,

                username:
                  user.username

              }
            );

          }


          const connected =
            call.participants.filter(
              item =>
                item.status ===
                  'connected' ||
                item.status ===
                  'ringing'
            );


          if (
            connected.length <= 1
          ) {

            call.status =
              'ended';

            call.endedAt =
              new Date()
                .toISOString();

          }


          emitCallState(
            call
          );


          if (
            call.status ===
            'ended'
          ) {

            setTimeout(
              () => {

                activeCalls.delete(
                  callId
                );

              },
              30000
            );

          }


          if (
            typeof callback ===
            'function'
          ) {

            callback({

              ok: true,

              callId

            });

          }


        } catch (error) {

          console.error(
            'VOBIXCHAT CALL REJECT ERROR:',
            error
          );


          if (
            typeof callback ===
            'function'
          ) {

            callback({

              ok: false,

              msg:
                'No se pudo rechazar la llamada'

            });

          }

        }

      }
    );


    // ==================================================
    // COLGAR / SALIR DE LLAMADA
    // ==================================================

    socket.on(
      'call:end',
      (
        payload,
        callback
      ) => {

        try {

          const callId =
            String(
              payload?.callId ||
              payload?.call_id ||
              ''
            ).trim();


          const call =
            getCallById(
              callId
            );


          if (!call) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({

                ok: true

              });

            }


            return;

          }


          const participant =
            getCallParticipant(
              call,
              userId
            );


          if (!participant) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({

                ok: false,

                msg:
                  'No perteneces a esta llamada'

              });

            }


            return;

          }


          participant.status =
            'left';


          socket.leave(
            `call:${callId}`
          );


          // ==============================================
          // AVISAR A LOS DEMÁS
          // ==============================================

          for (
            const item
            of call.participants
          ) {

            if (
              String(
                item.userId
              ) ===
              String(
                userId
              )
            ) {

              continue;

            }


            emitToUser(
              item.userId,
              'call:user-left',
              {

                callId,

                userId,

                username:
                  user.username

              }
            );

          }


          const remaining =
            call.participants.filter(
              item =>
                item.status ===
                'connected'
            );


          if (
            remaining.length <= 1
          ) {

            call.status =
              'ended';

            call.endedAt =
              new Date()
                .toISOString();


            for (
              const item
              of call.participants
            ) {

              emitToUser(
                item.userId,
                'call:ended',
                {

                  callId,

                  endedAt:
                    call.endedAt

                }
              );

            }

          }


          emitCallState(
            call
          );


          if (
            call.status ===
            'ended'
          ) {

            setTimeout(
              () => {

                activeCalls.delete(
                  callId
                );

              },
              30000
            );

          }


          if (
            typeof callback ===
            'function'
          ) {

            callback({

              ok: true,

              callId

            });

          }


        } catch (error) {

          console.error(
            'VOBIXCHAT CALL END ERROR:',
            error
          );


          if (
            typeof callback ===
            'function'
          ) {

            callback({

              ok: false,

              msg:
                'No se pudo finalizar la llamada'

            });

          }

        }

      }
    );


    // ==================================================
    // CANCELAR LLAMADA ANTES DE QUE CONTESTEN
    // ==================================================

    socket.on(
      'call:cancel',
      (
        payload,
        callback
      ) => {

        try {

          const callId =
            String(
              payload?.callId ||
              payload?.call_id ||
              ''
            ).trim();


          const call =
            getCallById(
              callId
            );


          if (!call) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({

                ok: true

              });

            }


            return;

          }


          if (
            String(
              call.callerUserId
            ) !==
            String(
              userId
            )
          ) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({

                ok: false,

                msg:
                  'Solo quien inició la llamada puede cancelarla'

              });

            }


            return;

          }


          call.status =
            'ended';

          call.endedAt =
            new Date()
              .toISOString();


          for (
            const participant
            of call.participants
          ) {

            if (
              String(
                participant.userId
              ) ===
              String(
                userId
              )
            ) {

              continue;

            }


            emitToUser(
              participant.userId,
              'call:cancelled',
              {

                callId,

                conversationId:
                  call.conversationId

              }
            );

          }


          emitCallState(
            call
          );


          setTimeout(
            () => {

              activeCalls.delete(
                callId
              );

            },
            30000
          );


          if (
            typeof callback ===
            'function'
          ) {

            callback({

              ok: true,

              callId

            });

          }


        } catch (error) {

          console.error(
            'VOBIXCHAT CALL CANCEL ERROR:',
            error
          );


          if (
            typeof callback ===
            'function'
          ) {

            callback({

              ok: false,

              msg:
                'No se pudo cancelar la llamada'

            });

          }

        }

      }
    );


    // ==================================================
    // WEBRTC: OFFER
    // ==================================================

    socket.on(
      'webrtc:offer',
      (
        payload,
        callback
      ) => {

        const callId =
          String(
            payload?.callId ||
            ''
          ).trim();


        const targetUserId =
          String(
            payload?.targetUserId ||
            ''
          ).trim();


        const offer =
          payload?.offer;


        const call =
          getCallById(
            callId
          );


        if (
          !call ||
          !offer ||
          !targetUserId ||
          !userBelongsToCall(
            call,
            userId
          ) ||
          !userBelongsToCall(
            call,
            targetUserId
          )
        ) {

          if (
            typeof callback ===
            'function'
          ) {

            callback({

              ok: false

            });

          }


          return;

        }


        emitToUser(
          targetUserId,
          'webrtc:offer',
          {

            callId,

            fromUserId:
              userId,

            fromUsername:
              user.username,

            offer

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

      }
    );


    // ==================================================
    // WEBRTC: ANSWER
    // ==================================================

    socket.on(
      'webrtc:answer',
      (
        payload,
        callback
      ) => {

        const callId =
          String(
            payload?.callId ||
            ''
          ).trim();


        const targetUserId =
          String(
            payload?.targetUserId ||
            ''
          ).trim();


        const answer =
          payload?.answer;


        const call =
          getCallById(
            callId
          );


        if (
          !call ||
          !answer ||
          !targetUserId ||
          !userBelongsToCall(
            call,
            userId
          ) ||
          !userBelongsToCall(
            call,
            targetUserId
          )
        ) {

          if (
            typeof callback ===
            'function'
          ) {

            callback({

              ok: false

            });

          }


          return;

        }


        emitToUser(
          targetUserId,
          'webrtc:answer',
          {

            callId,

            fromUserId:
              userId,

            answer

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

      }
    );


    // ==================================================
    // WEBRTC: ICE CANDIDATE
    // ==================================================

    socket.on(
      'webrtc:ice-candidate',
      (
        payload,
        callback
      ) => {

        const callId =
          String(
            payload?.callId ||
            ''
          ).trim();


        const targetUserId =
          String(
            payload?.targetUserId ||
            ''
          ).trim();


        const candidate =
          payload?.candidate;


        const call =
          getCallById(
            callId
          );


        if (
          !call ||
          !candidate ||
          !targetUserId ||
          !userBelongsToCall(
            call,
            userId
          ) ||
          !userBelongsToCall(
            call,
            targetUserId
          )
        ) {

          if (
            typeof callback ===
            'function'
          ) {

            callback({

              ok: false

            });

          }


          return;

        }


        emitToUser(
          targetUserId,
          'webrtc:ice-candidate',
          {

            callId,

            fromUserId:
              userId,

            candidate

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

      }
    );
    // ==================================================
    // AGREGAR USUARIO A LLAMADA / VIDEOLLAMADA
    // ==================================================

    socket.on(
      'call:add-user',
      async (
        payload,
        callback
      ) => {

        try {

          const callId =
            String(
              payload?.callId ||
              payload?.call_id ||
              ''
            ).trim();


          const newUserId =
            String(
              payload?.userId ||
              payload?.targetUserId ||
              ''
            ).trim();


          const call =
            getCallById(
              callId
            );


          if (!call) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({

                ok: false,

                msg:
                  'La llamada ya no está disponible'

              });

            }

            return;

          }


          // ==============================================
          // COMPROBAR QUE QUIEN INVITA ESTÁ EN LA LLAMADA
          // ==============================================

          if (
            !userBelongsToCall(
              call,
              userId
            )
          ) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({

                ok: false,

                msg:
                  'No perteneces a esta llamada'

              });

            }

            return;

          }


          if (!newUserId) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({

                ok: false,

                msg:
                  'Usuario no válido'

              });

            }

            return;

          }


          if (
            String(
              newUserId
            ) ===
            String(
              userId
            )
          ) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({

                ok: false,

                msg:
                  'No puedes invitarte a ti mismo'

              });

            }

            return;

          }


          // ==============================================
          // YA ESTÁ EN LA LLAMADA
          // ==============================================

          if (
            userBelongsToCall(
              call,
              newUserId
            )
          ) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({

                ok: false,

                msg:
                  'Ese usuario ya está en la llamada'

              });

            }

            return;

          }


          // ==============================================
          // BUSCAR USUARIO REGISTRADO
          // ==============================================

          const targetResult =
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

              WHERE
                id = $1
                AND verified = TRUE

              LIMIT 1
              `,
              [
                newUserId
              ]
            );


          if (
            targetResult.rows.length === 0
          ) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({

                ok: false,

                msg:
                  'Usuario no encontrado'

              });

            }

            return;

          }


          const targetUser =
            targetResult.rows[0];


          // ==============================================
          // AGREGAR PARTICIPANTE
          // ==============================================

          call.participants.push({

            userId:
              String(
                targetUser.id
              ),

            username:
              targetUser.username,

            avatarUrl:
              targetUser.avatar_url ||
              null,

            status:
              'ringing'

          });


          // ==============================================
          // ENVIAR LLAMADA ENTRANTE
          // ==============================================

          emitToUser(
            targetUser.id,
            'call:incoming',
            {

              callId:
                call.id,

              conversationId:
                call.conversationId,

              type:
                call.type,

              group:
                true,

              caller: {

                userId:
                  user.id,

                username:
                  user.username,

                avatarUrl:
                  user.avatar_url ||
                  null

              },

              participants:
                call.participants.map(
                  participant => ({

                    userId:
                      participant.userId,

                    username:
                      participant.username,

                    avatarUrl:
                      participant.avatarUrl ||
                      null,

                    status:
                      participant.status

                  })
                ),

              createdAt:
                call.createdAt

            }
          );


          // ==============================================
          // AVISAR A LOS QUE YA ESTÁN EN LA LLAMADA
          // ==============================================

          for (
            const participant
            of call.participants
          ) {

            if (
              String(
                participant.userId
              ) ===
              String(
                targetUser.id
              )
            ) {

              continue;

            }


            emitToUser(
              participant.userId,
              'call:user-invited',
              {

                callId:
                  call.id,

                user: {

                  userId:
                    targetUser.id,

                  username:
                    targetUser.username,

                  avatarUrl:
                    targetUser.avatar_url ||
                    null

                }

              }
            );

          }


          emitCallState(
            call
          );


          if (
            typeof callback ===
            'function'
          ) {

            callback({

              ok: true,

              callId:
                call.id,

              user: {

                userId:
                  targetUser.id,

                username:
                  targetUser.username,

                avatarUrl:
                  targetUser.avatar_url ||
                  null

              }

            });

          }


        } catch (error) {

          console.error(
            'VOBIXCHAT ADD CALL USER ERROR:',
            error
          );


          if (
            typeof callback ===
            'function'
          ) {

            callback({

              ok: false,

              msg:
                'No se pudo agregar el usuario a la llamada'

            });

          }

        }

      }
    );


    // ==================================================
    // COMPATIBILIDAD REUNIONES / MEET
    // ==================================================

    socket.on(
      'meet-join',
      async (
        payload,
        callback
      ) => {

        try {

          const room =
            String(
              payload?.room ||
              payload?.roomId ||
              ''
            )
              .trim()
              .slice(
                0,
                200
              );


          if (!room) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({

                ok: false,

                msg:
                  'Sala no válida'

              });

            }

            return;

          }


          // ==============================================
          // OBTENER USUARIOS QUE YA ESTÁN EN LA SALA
          // ==============================================

          const roomName =
            `meet:${room}`;


          const socketIds =
            await io
              .in(
                roomName
              )
              .allSockets();


          const users = [];


          for (
            const socketId
            of socketIds
          ) {

            const existingUserId =
              socketUsers.get(
                socketId
              );


            if (!existingUserId) {

              continue;

            }


            const existingSocket =
              io.sockets.sockets.get(
                socketId
              );


            if (
              !existingSocket ||
              !existingSocket.vobixUser
            ) {

              continue;

            }


            users.push({

              id:
                socketId,

              socketId,

              userId:
                existingSocket
                  .vobixUser.id,

              username:
                existingSocket
                  .vobixUser.username,

              avatarUrl:
                existingSocket
                  .vobixUser.avatar_url ||
                null

            });

          }


          // ==============================================
          // ENTRAR A LA SALA
          // ==============================================

          socket.join(
            roomName
          );


          socket.data.meetRoom =
            room;


          // ==============================================
          // DECIR AL NUEVO QUIÉN ESTÁ DENTRO
          // ==============================================

          socket.emit(
            'meet-users',
            users
          );


          // ==============================================
          // AVISAR A LOS DEMÁS
          // ==============================================

          socket
            .to(
              roomName
            )
            .emit(
              'meet-user-joined',
              {

                id:
                  socket.id,

                socketId:
                  socket.id,

                userId:
                  user.id,

                username:
                  user.username,

                avatarUrl:
                  user.avatar_url ||
                  null

              }
            );


          if (
            typeof callback ===
            'function'
          ) {

            callback({

              ok: true,

              room,

              users

            });

          }


        } catch (error) {

          console.error(
            'VOBIXCHAT MEET JOIN ERROR:',
            error
          );


          if (
            typeof callback ===
            'function'
          ) {

            callback({

              ok: false,

              msg:
                'No se pudo entrar a la llamada'

            });

          }

        }

      }
    );


    // ==================================================
    // SEÑALIZACIÓN WEBRTC COMPATIBLE CON MEET
    // ==================================================

    socket.on(
      'meet-signal',
      payload => {

        try {

          const targetSocketId =
            String(
              payload?.to ||
              payload?.targetSocketId ||
              ''
            ).trim();


          const signal =
            payload?.signal;


          if (
            !targetSocketId ||
            !signal
          ) {

            return;

          }


          const targetSocket =
            io.sockets.sockets.get(
              targetSocketId
            );


          if (!targetSocket) {

            return;

          }


          // ==============================================
          // SEGURIDAD:
          // AMBOS SOCKETS DEBEN ESTAR EN LA MISMA SALA
          // ==============================================

          const myRoom =
            socket.data.meetRoom;


          const targetRoom =
            targetSocket.data.meetRoom;


          if (
            !myRoom ||
            !targetRoom ||
            String(
              myRoom
            ) !==
            String(
              targetRoom
            )
          ) {

            return;

          }


          io
            .to(
              targetSocketId
            )
            .emit(
              'meet-signal',
              {

                from:
                  socket.id,

                fromUserId:
                  user.id,

                fromUsername:
                  user.username,

                signal

              }
            );


        } catch (error) {

          console.error(
            'VOBIXCHAT MEET SIGNAL ERROR:',
            error.message
          );

        }

      }
    );


    // ==================================================
    // SALIR DE REUNIÓN
    // ==================================================

    socket.on(
      'meet-leave',
      (
        payload,
        callback
      ) => {

        const room =
          String(
            payload?.room ||
            socket.data.meetRoom ||
            ''
          ).trim();


        if (room) {

          const roomName =
            `meet:${room}`;


          socket.leave(
            roomName
          );


          socket
            .to(
              roomName
            )
            .emit(
              'meet-user-left',
              {

                id:
                  socket.id,

                socketId:
                  socket.id,

                userId:
                  user.id,

                username:
                  user.username

              }
            );

        }


        socket.data.meetRoom =
          null;


        if (
          typeof callback ===
          'function'
        ) {

          callback({

            ok: true

          });

        }

      }
    );


    // ==================================================
    // INDICADOR "ESCRIBIENDO..."
    // ==================================================

    socket.on(
      'typing:start',
      async payload => {

        try {

          const conversationId =
            String(
              payload?.conversationId ||
              ''
            ).trim();


          if (!conversationId) {

            return;

          }


          const allowed =
            await socketCanAccessConversation(
              conversationId,
              userId
            );


          if (!allowed) {

            return;

          }


          socket
            .to(
              `conversation:${conversationId}`
            )
            .emit(
              'typing:start',
              {

                conversationId,

                userId,

                username:
                  user.username

              }
            );


        } catch (_) {}

      }
    );


    socket.on(
      'typing:stop',
      async payload => {

        try {

          const conversationId =
            String(
              payload?.conversationId ||
              ''
            ).trim();


          if (!conversationId) {

            return;

          }


          const allowed =
            await socketCanAccessConversation(
              conversationId,
              userId
            );


          if (!allowed) {

            return;

          }


          socket
            .to(
              `conversation:${conversationId}`
            )
            .emit(
              'typing:stop',
              {

                conversationId,

                userId,

                username:
                  user.username

              }
            );


        } catch (_) {}

      }
    );


    // ==================================================
    // MENSAJE LEÍDO
    // ==================================================

    socket.on(
      'message:read',
      async payload => {

        try {

          const conversationId =
            String(
              payload?.conversationId ||
              ''
            ).trim();


          const messageId =
            String(
              payload?.messageId ||
              ''
            ).trim();


          if (
            !conversationId ||
            !messageId
          ) {

            return;

          }


          const allowed =
            await socketCanAccessConversation(
              conversationId,
              userId
            );


          if (!allowed) {

            return;

          }


          socket
            .to(
              `conversation:${conversationId}`
            )
            .emit(
              'message:read',
              {

                conversationId,

                messageId,

                userId,

                readAt:
                  new Date()
                    .toISOString()

              }
            );


        } catch (error) {

          console.error(
            'VOBIXCHAT MESSAGE READ ERROR:',
            error.message
          );

        }

      }
    );


    // ==================================================
    // DESCONEXIÓN
    // ==================================================

    socket.on(
      'disconnect',
      async reason => {

        console.log(
          `VOBIXCHAT | SOCKET DESCONECTADO | ${user.username} | ${reason}`
        );


        // ================================================
        // AVISAR SI ESTABA EN REUNIÓN
        // ================================================

        const meetRoom =
          socket.data.meetRoom;


        if (meetRoom) {

          socket
            .to(
              `meet:${meetRoom}`
            )
            .emit(
              'meet-user-left',
              {

                id:
                  socket.id,

                socketId:
                  socket.id,

                userId:
                  user.id,

                username:
                  user.username

              }
            );

        }


        // ================================================
        // ELIMINAR SOCKET
        // ================================================

        socketUsers.delete(
          socket.id
        );


        const remainingSockets =
          removeUserSocket(
            userId,
            socket.id
          );


        // ================================================
        // SI TODAVÍA TIENE OTRO DISPOSITIVO CONECTADO,
        // NO MARCARLO OFFLINE
        // ================================================

        if (
          remainingSockets > 0
        ) {

          return;

        }


        // ================================================
        // MARCAR OFFLINE
        // ================================================

        try {

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
              userId
            ]
          );


          io.emit(
            'presence:update',
            {

              userId,

              username:
                user.username,

              online:
                false,

              lastSeen:
                new Date()
                  .toISOString()

            }
          );


        } catch (error) {

          console.error(
            'VOBIXCHAT OFFLINE ERROR:',
            error.message
          );

        }

      }
    );
  }
);


// ======================================================
// UTILIDAD: PARTICIPANTES DE UNA CONVERSACIÓN
// ======================================================

async function getConversationParticipants(
  conversationId
) {

  const result =
    await database.query(
      `
      SELECT
        cp.user_id,
        u.username,
        u.avatar_url,
        u.online,
        u.last_seen

      FROM conversation_participants cp

      INNER JOIN users u
        ON u.id = cp.user_id

      WHERE
        cp.conversation_id = $1

      ORDER BY
        cp.joined_at ASC
      `,
      [
        conversationId
      ]
    );


  return result.rows;

}


// ======================================================
// NORMALIZAR MENSAJE SOCKET
// ======================================================

function normalizeSocketMessage(
  row
) {

  if (!row) {

    return null;

  }


  return {

    id:
      row.id,

    conversationId:
      row.conversation_id,

    conversation_id:
      row.conversation_id,

    senderId:
      row.sender_user_id,

    sender_user_id:
      row.sender_user_id,

    senderUsername:
      row.sender_username ||
      null,

    sender_username:
      row.sender_username ||
      null,

    messageType:
      row.message_type ||
      'text',

    message_type:
      row.message_type ||
      'text',

    content:
      row.content || '',

    replyToMessageId:
      row.reply_to_message_id ||
      null,

    edited:
      Boolean(
        row.edited
      ),

    deleted:
      Boolean(
        row.deleted
      ),

    createdAt:
      row.created_at,

    created_at:
      row.created_at,

    updatedAt:
      row.updated_at,

    updated_at:
      row.updated_at

  };

}


// ======================================================
// LLAMADAS ACTIVAS EN MEMORIA
// ======================================================

const activeCalls =
  new Map();


// ======================================================
// LIMPIAR LLAMADAS ANTIGUAS
// ======================================================

function cleanOldCalls() {

  const now =
    Date.now();


  for (
    const [
      callId,
      call
    ]
    of activeCalls.entries()
  ) {

    const createdAt =
      new Date(
        call.createdAt
      ).getTime();


    if (
      !Number.isFinite(
        createdAt
      )
    ) {

      activeCalls.delete(
        callId
      );

      continue;

    }


    /*
      Eliminar llamadas que lleven
      más de 12 horas en memoria.
    */

    if (
      now - createdAt >
      12 * 60 * 60 * 1000
    ) {

      activeCalls.delete(
        callId
      );

    }

  }

}


// ======================================================
// LIMPIEZA PERIÓDICA
// ======================================================

setInterval(
  () => {

    cleanExpiredSessions();

    cleanOldCalls();

  },
  10 * 60 * 1000
);


// ======================================================
// RUTA PRINCIPAL
// ======================================================

app.get(
  '/',
  (
    req,
    res
  ) => {

    return res.sendFile(
      path.join(
        __dirname,
        'public',
        'index.html'
      )
    );

  }
);


// ======================================================
// RUTA DIRECTA AL CHAT
// ======================================================

app.get(
  '/chat',
  (
    req,
    res
  ) => {

    return res.sendFile(
      path.join(
        __dirname,
        'public',
        'chat.html'
      )
    );

  }
);


// ======================================================
// 404 PARA API
// ======================================================

app.use(
  '/api',
  (
    req,
    res
  ) => {

    return res
      .status(404)
      .json({

        ok: false,

        msg:
          'Ruta API no encontrada'

      });

  }
);


// ======================================================
// MANEJADOR GENERAL DE ERRORES
// ======================================================

app.use(
  (
    error,
    req,
    res,
    next
  ) => {

    console.error(
      'VOBIXCHAT EXPRESS ERROR:',
      error
    );


    if (
      res.headersSent
    ) {

      return next(
        error
      );

    }


    return res
      .status(500)
      .json({

        ok: false,

        msg:
          'Error interno de VOBIXCHAT'

      });

  }
);


// ======================================================
// PUERTO
// ======================================================

const PORT =
  Number(
    process.env.PORT ||
    config.PORT ||
    3000
  );


// ======================================================
// INICIAR VOBIXCHAT
// ======================================================

async function startVobixChat() {

  try {

    console.log(
      '=========================================='
    );

    console.log(
      ' VOBIXCHAT | INICIANDO'
    );

    console.log(
      '=========================================='
    );


    // ==================================================
    // COMPROBAR POSTGRESQL
    // ==================================================

    await database.query(
      'SELECT 1'
    );


    console.log(
      'VOBIXCHAT | POSTGRESQL CONECTADO'
    );


    // ==================================================
    // CREAR / ACTUALIZAR TABLAS
    // ==================================================

    await initializeDatabase();


    console.log(
      'VOBIXCHAT | DATABASE LISTA'
    );


    // ==================================================
    // INICIAR SERVIDOR HTTP + SOCKET.IO
    // ==================================================

    server.listen(
      PORT,
      '0.0.0.0',
      () => {

        console.log(
          '=========================================='
        );

        console.log(
          ` VOBIXCHAT ONLINE | PORT ${PORT}`
        );

        console.log(
          ` CHAT API: /api/chat`
        );

        console.log(
          ` USER SEARCH: /api/chat/users/search?q=`
        );

        console.log(
          ` HEALTH: /health`
        );

        console.log(
          '=========================================='
        );

      }
    );


  } catch (error) {

    console.error(
      '=========================================='
    );

    console.error(
      ' VOBIXCHAT NO PUDO INICIAR'
    );

    console.error(
      error
    );

    console.error(
      '=========================================='
    );


    process.exit(
      1
    );

  }

}


// ======================================================
// CIERRE SEGURO
// ======================================================

async function shutdown(
  signal
) {

  console.log(
    `VOBIXCHAT | CERRANDO | ${signal}`
  );


  try {

    io.emit(
      'server:shutdown',
      {

        message:
          'VOBIXCHAT se está reiniciando'

      }
    );


    server.close(
      async () => {

        try {

          if (
            database.pool &&
            typeof database.pool.end ===
              'function'
          ) {

            await database.pool.end();

          }

        } catch (error) {

          console.error(
            'VOBIXCHAT DATABASE CLOSE ERROR:',
            error.message
          );

        }


        process.exit(
          0
        );

      }
    );


    setTimeout(
      () => {

        process.exit(
          1
        );

      },
      10000
    ).unref();


  } catch (error) {

    console.error(
      'VOBIXCHAT SHUTDOWN ERROR:',
      error
    );


    process.exit(
      1
    );

  }

}


process.on(
  'SIGTERM',
  () =>
    shutdown(
      'SIGTERM'
    )
);


process.on(
  'SIGINT',
  () =>
    shutdown(
      'SIGINT'
    )
);


// ======================================================
// ERRORES NO CONTROLADOS
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
// ARRANCAR
// ======================================================

startVobixChat();


// ======================================================
// EXPORTAR PARA TESTS / FUTURO
// ======================================================

module.exports = {

  app,

  server,

  io

};


// ======================================================
// FIN VOBIXCHAT server.js
// ======================================================
