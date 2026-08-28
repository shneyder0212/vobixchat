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
//
// IMPORTANTE:
//
// routes/chat.js puede obtener Socket.IO mediante:
//
// const io = req.app.get('io');
//
// Esto permite que una ruta HTTP que guarda un mensaje,
// imagen, audio o archivo pueda emitir inmediatamente
// el evento correspondiente al destinatario.
//
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
// API PRIVADA
// CHAT / CONTACTOS / CONVERSACIONES / UPLOADS
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
// FIN BLOQUE 1/4
// EL BLOQUE 2/4 CONTINÚA JUSTO DEBAJO.
// NO CIERRES EL ARCHIVO.
// ======================================================
// ======================================================
// AUTENTICACIÓN DE SOCKET.IO
// ======================================================

io.use(
  async (
    socket,
    next
  ) => {

    try {

      const token =
        String(
          socket.handshake.auth?.token ||
          socket.handshake.query?.token ||
          ''
        ).trim();


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

        return next(
          new Error(
            'Usuario no encontrado'
          )
        );

      }


      const user =
        result.rows[0];


      if (!user.verified) {

        return next(
          new Error(
            'Usuario no verificado'
          )
        );

      }


      socket.vobixUser = {

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

      };


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
          'Error autenticando socket'
        )
      );

    }

  }
);


// ======================================================
// MAPAS DE PRESENCIA
// ======================================================
//
// Un mismo usuario puede tener varios sockets:
//
// - iPhone
// - computadora
// - otra pestaña
//
// Por eso guardamos Set<socketId> por usuario.
// ======================================================

const userSockets =
  new Map();


const socketUsers =
  new Map();


// ======================================================
// LLAMADAS ACTIVAS
// ======================================================

const activeCalls =
  new Map();


// ======================================================
// AGREGAR SOCKET A USUARIO
// ======================================================

function addUserSocket(
  userId,
  socketId
) {

  const key =
    String(
      userId
    );


  if (
    !userSockets.has(
      key
    )
  ) {

    userSockets.set(
      key,
      new Set()
    );

  }


  userSockets
    .get(key)
    .add(
      socketId
    );


  socketUsers.set(
    socketId,
    key
  );

}


// ======================================================
// QUITAR SOCKET DE USUARIO
// ======================================================

function removeUserSocket(
  userId,
  socketId
) {

  const key =
    String(
      userId
    );


  const sockets =
    userSockets.get(
      key
    );


  if (!sockets) {

    socketUsers.delete(
      socketId
    );

    return 0;

  }


  sockets.delete(
    socketId
  );


  socketUsers.delete(
    socketId
  );


  if (
    sockets.size === 0
  ) {

    userSockets.delete(
      key
    );

    return 0;

  }


  return sockets.size;

}


// ======================================================
// COMPROBAR USUARIO CONECTADO
// ======================================================

function isUserConnected(
  userId
) {

  const sockets =
    userSockets.get(
      String(
        userId
      )
    );


  return Boolean(
    sockets &&
    sockets.size > 0
  );

}


// ======================================================
// EMITIR A TODOS LOS DISPOSITIVOS DE UN USUARIO
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


  if (
    !sockets ||
    sockets.size === 0
  ) {

    return false;

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


  return true;

}


// ======================================================
// OBTENER PARTICIPANTES DE CONVERSACIÓN
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
        ON u.id =
          cp.user_id

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
// COMPROBAR ACCESO A CONVERSACIÓN DESDE SOCKET
// ======================================================

async function socketCanAccessConversation(
  conversationId,
  userId
) {

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
// COMPROBAR BLOQUEO
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
            ub.blocked_user_id = cp.user_id
          )

          OR

          (
            ub.blocker_user_id = cp.user_id
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
// NORMALIZAR MENSAJE SOCKET
// ======================================================

function normalizeSocketMessage(
  row
) {

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
      row.content ||
      '',

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
// CONEXIÓN SOCKET
// ======================================================

io.on(
  'connection',
  async socket => {

    const user =
      socket.vobixUser;


    if (!user) {

      socket.disconnect(
        true
      );

      return;

    }


    const userId =
      user.id;


    console.log(
      'VOBIXCHAT SOCKET CONNECTED:',
      user.username,
      socket.id
    );


    // ==================================================
    // REGISTRAR SOCKET DEL USUARIO
    // ==================================================

    addUserSocket(
      userId,
      socket.id
    );


    /*
      Sala permanente por usuario.

      Esto es MUY importante porque permite enviar
      eventos a un usuario aunque no tenga abierta
      una conversación concreta.
    */

    socket.join(
      `user:${userId}`
    );


    // ==================================================
    // MARCAR ONLINE
    // ==================================================

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

    } catch (error) {

      console.error(
        'VOBIXCHAT ONLINE UPDATE ERROR:',
        error.message
      );

    }


    // ==================================================
    // PRESENCIA
    // ==================================================

    io.emit(
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
    // COMPATIBILIDAD SET-USER
    // ==================================================
    //
    // El chat.html actual ejecuta:
    //
    // socket.emit('set-user', currentUser.username)
    //
    // NO confiamos en ese username para autenticar.
    // El socket ya fue autenticado por token.
    // ==================================================

    socket.on(
      'set-user',
      (
        username,
        callback
      ) => {

        if (
          typeof callback ===
          'function'
        ) {

          callback({

            ok: true,

            userId,

            username:
              user.username

          });

        }

      }
    );


    // ==================================================
    // ENTRAR EN SALA DE CONVERSACIÓN
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
          //
          // Esto permite actualizar conversaciones aunque
          // el destinatario esté dentro de VOBIXCHAT pero
          // no tenga ESTE chat abierto.
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
    // EL BLOQUE 3/4 CONTINÚA DENTRO DE ESTE io.on()
    //
    // NO PONGAS:
    //
    // });
    //
    // TODAVÍA.
    // ==================================================
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


      return call.participantIds
        .map(
          value =>
            String(value)
        )
        .includes(
          String(
            checkUserId
          )
        );

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


          const requestedCallId =
            String(
              payload?.callId ||
              payload?.call_id ||
              ''
            ).trim();


          const type =
            String(
              payload?.type ||
              payload?.callType ||
              'audio'
            ).toLowerCase() ===
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
                  'No se puede realizar esta llamada'

              });

            }


            return;

          }


          const otherParticipants =
            await getOtherCallParticipants(
              conversationId,
              userId
            );


          if (
            otherParticipants.length === 0
          ) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({

                ok: false,

                msg:
                  'No hay destinatario para esta llamada'

              });

            }


            return;

          }


          const callId =
            requestedCallId ||
            crypto
              .randomBytes(16)
              .toString('hex');


          const participantIds = [

            String(
              userId
            ),

            ...otherParticipants.map(
              participant =>
                String(
                  participant.user_id
                )
            )

          ];


          const call = {

            callId,

            conversationId:
              String(
                conversationId
              ),

            type,

            callerUserId:
              String(
                userId
              ),

            callerUsername:
              user.username,

            participantIds,

            acceptedUserIds:
              new Set(),

            createdAt:
              Date.now(),

            status:
              'ringing'

          };


          activeCalls.set(
            String(
              callId
            ),
            call
          );


          // ==============================================
          // AVISAR A LOS DESTINATARIOS CONECTADOS
          // ==============================================

          let deliveredToSocket =
            false;


          for (
            const participant
            of otherParticipants
          ) {

            const delivered =
              emitToUser(
                participant.user_id,
                'call:incoming',
                {

                  callId,

                  conversationId,

                  type,

                  fromUserId:
                    userId,

                  fromUsername:
                    user.username,

                  callerUserId:
                    userId,

                  callerUsername:
                    user.username,

                  callerAvatarUrl:
                    user.avatarUrl ||
                    null,

                  createdAt:
                    call.createdAt

                }
              );


            if (delivered) {

              deliveredToSocket =
                true;

            }

          }


          /*
          ==================================================
           MUY IMPORTANTE

           NO devolvemos:

           "El usuario no está conectado"

           simplemente porque el destinatario no tenga
           un Socket.IO activo.

           Un usuario puede tener la app cerrada,
           Safari suspendido o el teléfono bloqueado.

           Para que el iPhone SUENE con la app cerrada
           hace falta Push Notification real
           (Web Push/APNs/PWA), que conectaremos después.

           Aquí dejamos la llamada registrada como
           pendiente en lugar de rechazarla.
          ==================================================
          */


          if (
            typeof callback ===
            'function'
          ) {

            callback({

              ok: true,

              callId,

              conversationId,

              type,

              pending:
                !deliveredToSocket,

              delivered:
                deliveredToSocket

            });

          }


          // ==============================================
          // TIMEOUT DE LLAMADA
          // ==============================================

          setTimeout(
            () => {

              const pendingCall =
                getCallById(
                  callId
                );


              if (!pendingCall) {

                return;

              }


              if (
                pendingCall.status !==
                'ringing'
              ) {

                return;

              }


              pendingCall.status =
                'no-answer';


              activeCalls.delete(
                String(
                  callId
                )
              );


              emitToUser(
                pendingCall.callerUserId,
                'call:no-answer',
                {

                  callId,

                  conversationId:
                    pendingCall.conversationId,

                  reason:
                    'no-answer'

                }
              );


              for (
                const participantId
                of pendingCall.participantIds
              ) {

                if (
                  String(
                    participantId
                  ) ===
                  String(
                    pendingCall.callerUserId
                  )
                ) {

                  continue;

                }


                emitToUser(
                  participantId,
                  'call:ended',
                  {

                    callId,

                    conversationId:
                      pendingCall.conversationId,

                    reason:
                      'no-answer'

                  }
                );

              }

            },
            45000
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


          if (
            String(
              call.callerUserId
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
                  'El emisor no puede aceptar su propia llamada'

              });

            }


            return;

          }


          call.status =
            'accepted';


          call.acceptedUserIds.add(
            String(
              userId
            )
          );


          emitToUser(
            call.callerUserId,
            'call:accepted',
            {

              callId:
                call.callId,

              conversationId:
                call.conversationId,

              type:
                call.type,

              acceptedByUserId:
                userId,

              acceptedByUsername:
                user.username

            }
          );


          /*
            Si el usuario tiene VobixChat abierto
            en varios dispositivos, cerramos el aviso
            de llamada en los otros dispositivos.
          */

          emitToUser(
            userId,
            'call:accepted-device',
            {

              callId:
                call.callId,

              conversationId:
                call.conversationId

            }
          );


          if (
            typeof callback ===
            'function'
          ) {

            callback({

              ok: true,

              callId:
                call.callId,

              conversationId:
                call.conversationId,

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
                ok: true
              });

            }


            return;

          }


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


          const reason =
            String(
              payload?.reason ||
              'rejected'
            );


          /*
            En conversación privada, un rechazo
            finaliza la llamada.

            Esta estructura también conserva la lista
            de participantes para ampliar después
            videollamadas grupales.
          */

          call.status =
            'rejected';


          activeCalls.delete(
            String(
              callId
            )
          );


          emitToUser(
            call.callerUserId,
            'call:rejected',
            {

              callId:
                call.callId,

              conversationId:
                call.conversationId,

              rejectedByUserId:
                userId,

              rejectedByUsername:
                user.username,

              reason

            }
          );


          for (
            const participantId
            of call.participantIds
          ) {

            if (
              String(
                participantId
              ) ===
              String(
                userId
              )
            ) {

              continue;

            }


            if (
              String(
                participantId
              ) ===
              String(
                call.callerUserId
              )
            ) {

              continue;

            }


            emitToUser(
              participantId,
              'call:ended',
              {

                callId:
                  call.callId,

                conversationId:
                  call.conversationId,

                reason

              }
            );

          }


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
    // WEBRTC OFFER
    // ==================================================

    socket.on(
      'call:offer',
      (
        payload,
        callback
      ) => {

        try {

          const callId =
            String(
              payload?.callId ||
              ''
            ).trim();


          const call =
            getCallById(
              callId
            );


          if (
            !call ||
            !payload?.offer
          ) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({

                ok: false,

                msg:
                  'Oferta WebRTC no válida'

              });

            }


            return;

          }


          if (
            !userBelongsToCall(
              call,
              userId
            )
          ) {

            return;

          }


          /*
            El offer se envía a todos los participantes
            excepto al socket/usuario que lo originó.
          */

          for (
            const participantId
            of call.participantIds
          ) {

            if (
              String(
                participantId
              ) ===
              String(
                userId
              )
            ) {

              continue;

            }


            emitToUser(
              participantId,
              'call:offer',
              {

                callId:
                  call.callId,

                conversationId:
                  call.conversationId,

                type:
                  call.type,

                fromUserId:
                  userId,

                fromUsername:
                  user.username,

                offer:
                  payload.offer

              }
            );

          }


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
            error
          );

        }

      }
    );


    // ==================================================
    // WEBRTC ANSWER
    // ==================================================

    socket.on(
      'call:answer',
      (
        payload,
        callback
      ) => {

        try {

          const callId =
            String(
              payload?.callId ||
              ''
            ).trim();


          const call =
            getCallById(
              callId
            );


          if (
            !call ||
            !payload?.answer
          ) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({

                ok: false,

                msg:
                  'Respuesta WebRTC no válida'

              });

            }


            return;

          }


          if (
            !userBelongsToCall(
              call,
              userId
            )
          ) {

            return;

          }


          /*
            En la llamada privada actual la respuesta
            va al usuario que inició la llamada.
          */

          emitToUser(
            call.callerUserId,
            'call:answer',
            {

              callId:
                call.callId,

              conversationId:
                call.conversationId,

              fromUserId:
                userId,

              fromUsername:
                user.username,

              answer:
                payload.answer

            }
          );


          call.status =
            'connected';


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
            error
          );

        }

      }
    );


    // ==================================================
    // WEBRTC ICE CANDIDATE
    // ==================================================

    socket.on(
      'call:ice',
      (
        payload,
        callback
      ) => {

        try {

          const callId =
            String(
              payload?.callId ||
              ''
            ).trim();


          const call =
            getCallById(
              callId
            );


          const candidate =
            payload?.candidate ||
            payload?.iceCandidate;


          if (
            !call ||
            !candidate
          ) {

            return;

          }


          if (
            !userBelongsToCall(
              call,
              userId
            )
          ) {

            return;

          }


          for (
            const participantId
            of call.participantIds
          ) {

            if (
              String(
                participantId
              ) ===
              String(
                userId
              )
            ) {

              continue;

            }


            emitToUser(
              participantId,
              'call:ice',
              {

                callId:
                  call.callId,

                conversationId:
                  call.conversationId,

                fromUserId:
                  userId,

                candidate

              }
            );

          }


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
            error
          );

        }

      }
    );


    // ==================================================
    // FINALIZAR LLAMADA
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
            !userBelongsToCall(
              call,
              userId
            )
          ) {

            return;

          }


          activeCalls.delete(
            String(
              callId
            )
          );


          call.status =
            'ended';


          for (
            const participantId
            of call.participantIds
          ) {

            if (
              String(
                participantId
              ) ===
              String(
                userId
              )
            ) {

              continue;

            }


            emitToUser(
              participantId,
              'call:ended',
              {

                callId:
                  call.callId,

                conversationId:
                  call.conversationId,

                endedByUserId:
                  userId,

                endedByUsername:
                  user.username,

                reason:
                  payload?.reason ||
                  'ended'

              }
            );

          }


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
            error
          );

        }

      }
    );


    // ==================================================
    // CONSULTAR ESTADO DE LLAMADA
    // ==================================================

    socket.on(
      'call:status',
      (
        payload,
        callback
      ) => {

        if (
          typeof callback !==
          'function'
        ) {

          return;

        }


        const callId =
          String(
            payload?.callId ||
            ''
          ).trim();


        const call =
          getCallById(
            callId
          );


        if (!call) {

          callback({

            ok: false,

            active: false

          });


          return;

        }


        if (
          !userBelongsToCall(
            call,
            userId
          )
        ) {

          callback({

            ok: false,

            active: false

          });


          return;

        }


        callback({

          ok: true,

          active: true,

          call: {

            callId:
              call.callId,

            conversationId:
              call.conversationId,

            type:
              call.type,

            callerUserId:
              call.callerUserId,

            callerUsername:
              call.callerUsername,

            status:
              call.status,

            createdAt:
              call.createdAt

          }

        });

      }
    );


    // ==================================================
    // IMPORTANTE SOBRE LLAMADAS CON APP CERRADA
    // ==================================================
    //
    // Este servidor YA NO responde automáticamente:
    //
    // "El usuario no está conectado"
    //
    // si no encuentra un socket.
    //
    // Pero Socket.IO NO puede despertar por sí solo
    // un iPhone cuando Safari/VobixChat está totalmente
    // cerrado o suspendido.
    //
    // Para que el teléfono reciba aviso y sonido en ese
    // estado necesitaremos Web Push/PWA/APNs.
    //
    // El bloque 4 cerrará presencia/desconexión,
    // reuniones y arranque de Render.
    // ==================================================


    // ==================================================
    // FIN BLOQUE 3/4
    //
    // NO CIERRES io.on() TODAVÍA.
    // EL BLOQUE 4/4 CONTINÚA JUSTO DEBAJO.
    // ==================================================
     // ==================================================
    // REUNIONES - CREAR / UNIRSE
    // ==================================================

    socket.on(
      'meeting:join',
      async (
        payload,
        callback
      ) => {

        try {

          const meetingId =
            String(
              payload?.meetingId ||
              payload?.meeting_id ||
              ''
            )
              .trim()
              .slice(0, 100);


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


          /*
            Avisamos a los demás participantes
            que un usuario entró.
          */

          socket
            .to(room)
            .emit(
              'meeting:user-joined',
              {

                meetingId,

                userId,

                username:
                  user.username,

                avatarUrl:
                  user.avatarUrl ||
                  null

              }
            );


          if (
            typeof callback ===
            'function'
          ) {

            callback({

              ok: true,

              meetingId,

              user: {

                id:
                  userId,

                username:
                  user.username,

                avatarUrl:
                  user.avatarUrl ||
                  null

              }

            });

          }


        } catch (error) {

          console.error(
            'VOBIXCHAT MEETING JOIN ERROR:',
            error
          );


          if (
            typeof callback ===
            'function'
          ) {

            callback({

              ok: false,

              msg:
                'No se pudo entrar a la reunión'

            });

          }

        }

      }
    );


    // ==================================================
    // REUNIONES - WEBRTC OFFER
    // ==================================================

    socket.on(
      'meeting:offer',
      payload => {

        const meetingId =
          String(
            payload?.meetingId ||
            ''
          ).trim();


        if (
          !meetingId ||
          !payload?.offer
        ) {

          return;

        }


        socket
          .to(
            `meeting:${meetingId}`
          )
          .emit(
            'meeting:offer',
            {

              meetingId,

              fromUserId:
                userId,

              fromUsername:
                user.username,

              offer:
                payload.offer

            }
          );

      }
    );


    // ==================================================
    // REUNIONES - WEBRTC ANSWER
    // ==================================================

    socket.on(
      'meeting:answer',
      payload => {

        const meetingId =
          String(
            payload?.meetingId ||
            ''
          ).trim();


        if (
          !meetingId ||
          !payload?.answer
        ) {

          return;

        }


        /*
          Si viene targetUserId enviamos únicamente
          al usuario correspondiente.

          Si no viene, emitimos a la sala.
        */

        if (
          payload.targetUserId
        ) {

          emitToUser(
            payload.targetUserId,
            'meeting:answer',
            {

              meetingId,

              fromUserId:
                userId,

              fromUsername:
                user.username,

              answer:
                payload.answer

            }
          );


          return;

        }


        socket
          .to(
            `meeting:${meetingId}`
          )
          .emit(
            'meeting:answer',
            {

              meetingId,

              fromUserId:
                userId,

              fromUsername:
                user.username,

              answer:
                payload.answer

            }
          );

      }
    );


    // ==================================================
    // REUNIONES - ICE
    // ==================================================

    socket.on(
      'meeting:ice',
      payload => {

        const meetingId =
          String(
            payload?.meetingId ||
            ''
          ).trim();


        const candidate =
          payload?.candidate ||
          payload?.iceCandidate;


        if (
          !meetingId ||
          !candidate
        ) {

          return;

        }


        if (
          payload.targetUserId
        ) {

          emitToUser(
            payload.targetUserId,
            'meeting:ice',
            {

              meetingId,

              fromUserId:
                userId,

              candidate

            }
          );


          return;

        }


        socket
          .to(
            `meeting:${meetingId}`
          )
          .emit(
            'meeting:ice',
            {

              meetingId,

              fromUserId:
                userId,

              candidate

            }
          );

      }
    );


    // ==================================================
    // REUNIONES - SALIR
    // ==================================================

    socket.on(
      'meeting:leave',
      (
        payload,
        callback
      ) => {

        const meetingId =
          String(
            payload?.meetingId ||
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


        socket
          .to(room)
          .emit(
            'meeting:user-left',
            {

              meetingId,

              userId,

              username:
                user.username

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
    // DESCONEXIÓN
    // ==================================================

    socket.on(
      'disconnect',
      async reason => {

        console.log(
          'VOBIXCHAT SOCKET DISCONNECTED:',
          user.username,
          socket.id,
          reason
        );


        const remainingSockets =
          removeUserSocket(
            userId,
            socket.id
          );


        /*
          Si el usuario todavía tiene VobixChat abierto
          en otro dispositivo o pestaña, continúa online.
        */

        if (
          remainingSockets > 0
        ) {

          return;

        }


        // ==============================================
        // MARCAR OFFLINE
        // ==============================================

        const lastSeen =
          new Date()
            .toISOString();


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


        } catch (error) {

          console.error(
            'VOBIXCHAT OFFLINE UPDATE ERROR:',
            error.message
          );

        }


        // ==============================================
        // EMITIR PRESENCIA
        // ==============================================

        io.emit(
          'presence:update',
          {

            userId,

            username:
              user.username,

            online:
              false,

            lastSeen

          }
        );


        /*
        ==================================================
         NO BORRAMOS AUTOMÁTICAMENTE UNA LLAMADA
         SIMPLEMENTE PORQUE UN SOCKET SE DESCONECTÓ.

         Esto es importante para móviles.

         iOS puede suspender Safari temporalmente y
         Socket.IO puede desconectarse aunque WebRTC
         esté intentando recuperarse.

         La llamada se elimina por:
         - call:end
         - call:reject
         - timeout sin respuesta
        ==================================================
        */

      }
    );


    // ==================================================
    // ERROR DE SOCKET
    // ==================================================

    socket.on(
      'error',
      error => {

        console.error(
          'VOBIXCHAT CLIENT SOCKET ERROR:',
          user.username,
          error
        );

      }
    );


  }
);


// ======================================================
// LIMPIEZA PERIÓDICA DE SESIONES
// ======================================================

setInterval(
  () => {

    cleanExpiredSessions();

  },
  15 * 60 * 1000
);


// ======================================================
// LIMPIEZA DE LLAMADAS HUÉRFANAS
// ======================================================

setInterval(
  () => {

    const now =
      Date.now();


    for (
      const [
        callId,
        call
      ]
      of activeCalls.entries()
    ) {

      /*
        Seguridad adicional:
        ninguna llamada permanecerá indefinidamente
        en memoria.

        12 horas es un límite de seguridad y no
        significa que la llamada deba durar 12 horas.
      */

      if (
        now -
        call.createdAt >
        12 * 60 * 60 * 1000
      ) {

        activeCalls.delete(
          callId
        );


        for (
          const participantId
          of call.participantIds
        ) {

          emitToUser(
            participantId,
            'call:ended',
            {

              callId:
                call.callId,

              conversationId:
                call.conversationId,

              reason:
                'expired'

            }
          );

        }

      }

    }

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

    res.sendFile(
      path.join(
        __dirname,
        'public',
        'index.html'
      )
    );

  }
);


// ======================================================
// 404 API
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
// ERROR GENERAL EXPRESS
// ======================================================

app.use(
  (
    error,
    req,
    res,
    next
  ) => {

    console.error(
      'VOBIXCHAT SERVER ERROR:',
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
          'Error interno del servidor'

      });

  }
);


// ======================================================
// PUERTO RENDER
// ======================================================

const PORT =
  Number(
    process.env.PORT
  ) ||
  3000;


// ======================================================
// INICIAR VOBIXCHAT
// ======================================================

async function startVobixChat() {

  try {

    console.log(
      'VOBIXCHAT | INICIALIZANDO BASE DE DATOS...'
    );


    await initializeDatabase();


    console.log(
      'VOBIXCHAT | BASE DE DATOS PREPARADA'
    );


    server.listen(
      PORT,
      '0.0.0.0',
      () => {

        console.log(
          '========================================'
        );

        console.log(
          ' VOBIXCHAT ONLINE'
        );

        console.log(
          ` PORT: ${PORT}`
        );

        console.log(
          ` TEST PIN MODE: ${config.TEST_PIN_MODE}`
        );

        console.log(
          ' CHAT: READY'
        );

        console.log(
          ' MULTIMEDIA: READY'
        );

        console.log(
          ' SOCKET.IO: READY'
        );

        console.log(
          ' VOICE CALLS: READY'
        );

        console.log(
          ' VIDEO CALLS: READY'
        );

        console.log(
          '========================================'
        );

      }
    );


  } catch (error) {

    console.error(
      '========================================'
    );

    console.error(
      'VOBIXCHAT STARTUP ERROR'
    );

    console.error(
      error
    );

    console.error(
      '========================================'
    );


    process.exit(1);

  }

}


// ======================================================
// ERRORES NO CAPTURADOS
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
// FIN DE server.js
// ======================================================
