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
 - Chat privado 1x1
 - Historial
 - Socket.IO
 - Presencia
 - Mensajería tiempo real
 - WebRTC
 - Llamadas
 - Videollamadas
 - Videollamadas multipersona
 - Push notifications
 - Health check
==========================================================
*/

const express =
  require('express');

const http =
  require('http');

const crypto =
  require('crypto');

const path =
  require('path');

const {
  Server
} = require('socket.io');


const config =
  require('./config');

const database =
  require('./database/db');

const {
  initializeDatabase
} =
  require('./database/schema');

const {
  normalizePhone
} =
  require('./core/users');

const chatRoutes =
  require('./routes/chat');


// ======================================================
// WEB PUSH
// ======================================================

let webpush = null;

try {

  webpush =
    require('web-push');

} catch (error) {

  console.warn(
    'VOBIXCHAT | web-push no disponible'
  );

}


// ======================================================
// APP / SERVIDOR
// ======================================================

const app =
  express();

const server =
  http.createServer(
    app
  );


// ======================================================
// SOCKET.IO
// ======================================================

const io =
  new Server(
    server,
    {

      cors: {
        origin: '*'
      },

      transports: [
        'websocket',
        'polling'
      ],

      maxHttpBufferSize:
        10 * 1024 * 1024

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

// Archivos enviados en salas privadas: notas de voz, fotos y documentos.
// Sin esta ruta el mensaje llega, pero el otro móvil recibe un 404 al reproducirlo.
app.use(
  '/uploads',
  express.static(
    path.join(__dirname, 'uploads'),
    { fallthrough: false, maxAge: '1h' }
  )
);


// ======================================================
// SEGURIDAD / PIN / SESIONES
// ======================================================

const pins = {};

const pendingUsers = {};

// Las sesiones reales se guardan en PostgreSQL.
// El navegador conserva el token bruto; la base guarda únicamente SHA-256.

const SESSION_TTL_MS =
  7 *
  24 *
  60 *
  60 *
  1000;


// ======================================================
// CREAR TOKEN SEGURO
// ======================================================

function createSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}


function hashSessionToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}


// ======================================================
// OBTENER TOKEN HTTP
// ======================================================

function getToken(req) {
  const authorization = req.headers.authorization || '';
  if (authorization.startsWith('Bearer ')) {
    return authorization.slice(7).trim();
  }
  return '';
}


async function saveSession(userId, token, req = null) {
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const userAgent = String(req?.headers?.['user-agent'] || '').slice(0, 150);

  await database.query(
    `
      INSERT INTO sessions
      (user_id, token_hash, device_name, platform, created_at, last_used_at, expires_at, revoked)
      VALUES ($1, $2, $3, $4, NOW(), NOW(), $5, FALSE)
    `,
    [userId, tokenHash, userAgent || null, null, expiresAt]
  );

  return { userId, createdAt: Date.now(), expiresAt };
}


async function cleanExpiredSessions() {
  try {
    await database.query(
      `DELETE FROM sessions WHERE revoked = TRUE OR (expires_at IS NOT NULL AND expires_at <= NOW())`
    );
  } catch (error) {
    console.error('VOBIXCHAT SESSION CLEANUP ERROR:', error.message);
  }
}


async function getSessionByToken(token) {
  if (!token) return null;

  const tokenHash = hashSessionToken(token);
  const result = await database.query(
    `
      SELECT id, user_id, created_at, expires_at
      FROM sessions
      WHERE token_hash = $1
        AND revoked = FALSE
        AND (expires_at IS NULL OR expires_at > NOW())
      LIMIT 1
    `,
    [tokenHash]
  );

  if (!result.rows.length) return null;

  const row = result.rows[0];
  database.query(
    `UPDATE sessions SET last_used_at = NOW() WHERE id = $1`,
    [row.id]
  ).catch(() => {});

  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    expiresAt: row.expires_at
  };
}


async function revokeSession(token) {
  if (!token) return;
  await database.query(
    `UPDATE sessions SET revoked = TRUE, last_used_at = NOW() WHERE token_hash = $1`,
    [hashSessionToken(token)]
  );
}


// ======================================================
// MIDDLEWARE AUTENTICACIÓN
// ======================================================

async function requireAuth(
  req,
  res,
  next
) {

  try {

    const token =
      getToken(req);


    const session =
      await getSessionByToken(
        token
      );


    if (!session) {

      return res
        .status(401)
        .json({

          ok: false,

          authenticated:
            false,

          msg:
            'Sesión no válida'

        });

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
          security_reverified_at,
          online,
          last_seen

        FROM users

        WHERE
          id = $1

        LIMIT 1
        `,
        [
          session.userId
        ]
      );


    if (
      result.rows.length === 0
    ) {

      await revokeSession(token);


      return res
        .status(401)
        .json({

          ok: false,

          authenticated:
            false,

          msg:
            'Usuario no encontrado'

        });

    }


    const user =
      result.rows[0];


    if (!user.security_reverified_at) {
      await revokeSession(token);

      return res.status(428).json({
        ok:false,
        authenticated:false,
        requiresReverification:true,
        msg:'Debes reverificar tu cuenta sin perder tus chats'
      });
    }


    if (
      !user.verified
    ) {

      await revokeSession(token);


      return res
        .status(401)
        .json({

          ok: false,

          authenticated:
            false,

          msg:
            'Usuario no verificado'

        });

    }


    req.vobixToken =
      token;


    req.vobixSession =
      session;


    req.vobixUser =
      user;


    return next();


  } catch (error) {

    console.error(
      'VOBIXCHAT AUTH ERROR:',
      error
    );


    return res
      .status(500)
      .json({

        ok: false,

        msg:
          'Error de autenticación'

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
      req.body.phone ||
      ''
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

    attempts:
      0

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

    testMode:
      true

  });

}


// ======================================================
// RUTAS PARA SOLICITAR PIN
// ======================================================

app.post(
  '/api/send-pin',
  sendPin
);


app.post(
  '/api/auth/send-pin',
  sendPin
);


// ======================================================
// VERIFICAR PIN / REGISTRO / LOGIN
// ======================================================

async function verifyPin(
  req,
  res
) {

  const phone =
    normalizePhone(
      req.body.phone ||
      ''
    );


  const pin =
    String(
      req.body.pin ||
      ''
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
          'Falta teléfono o PIN'

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


  // ====================================================
  // PIN VENCIDO: 10 MINUTOS
  // ====================================================

  if (
    Date.now() -
    pinData.createdAt >
    10 * 60 * 1000
  ) {

    delete pins[phone];


    return res
      .status(400)
      .json({

        ok: false,

        msg:
          'El PIN ha vencido'

      });

  }


  pinData.attempts++;


  if (
    pinData.attempts > 10
  ) {

    delete pins[phone];


    return res
      .status(429)
      .json({

        ok: false,

        msg:
          'Demasiados intentos'

      });

  }


  if (
    pinData.pin !== pin
  ) {

    return res
      .status(400)
      .json({

        ok: false,

        msg:
          'PIN incorrecto'

      });

  }


  try {

    let result =
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
          phone = $1

        LIMIT 1
        `,
        [phone]
      );


    let user =
      result.rows[0];


    // ==================================================
    // CREAR USUARIO SI TODAVÍA NO EXISTE
    // ==================================================

    if (!user) {

      const pending =
        pendingUsers[phone];


      if (
        !pending ||
        !pending.username
      ) {

        return res
          .status(400)
          .json({

            ok: false,

            msg:
              'Faltan los datos de registro'

          });

      }


      const created =
        await database.query(
          `
          INSERT INTO users
          (
            username,
            phone,
            verified,
            online,
            last_seen
          )

          VALUES
          (
            $1,
            $2,
            TRUE,
            FALSE,
            NOW()
          )

          RETURNING
            id,
            username,
            phone,
            vobix_id,
            avatar_url,
            verified,
            online,
            last_seen
          `,
          [
            pending.username,
            phone
          ]
        );


      user =
        created.rows[0];

    }


    // ==================================================
    // ASEGURAR USUARIO VERIFICADO
    // ==================================================

    if (
      !user.verified
    ) {

      const verified =
        await database.query(
          `
          UPDATE users

          SET
            verified = TRUE

          WHERE
            id = $1

          RETURNING
            id,
            username,
            phone,
            vobix_id,
            avatar_url,
            verified,
            online,
            last_seen
          `,
          [
            user.id
          ]
        );


      user =
        verified.rows[0];

    }


    await database.query(
      `UPDATE users SET security_reverified_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [user.id]
    );


    // ==================================================
    // CREAR SESIÓN
    // ==================================================

    const token =
      createSessionToken();

    await saveSession(
      user.id,
      token,
      req
    );


    delete pins[phone];

    delete pendingUsers[phone];


    return res.json({

      ok: true,

      authenticated:
        true,

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
          user.verified,

        online:
          user.online,

        lastSeen:
          user.last_seen

      }

    });


  } catch (error) {

    console.error(
      'VOBIXCHAT VERIFY PIN ERROR:',
      error
    );


    return res
      .status(500)
      .json({

        ok: false,

        msg:
          'No se pudo verificar el PIN'

      });

  }

}


// ======================================================
// RUTAS VERIFICACIÓN
// ======================================================

app.post(
  '/api/verify-pin',
  verifyPin
);


app.post(
  '/api/auth/verify-pin',
  verifyPin
);


// ======================================================
// FIN BLOQUE 1/6
// CONTINÚA DIRECTAMENTE CON BLOQUE 2/6
// ======================================================
// ======================================================
// BLOQUE 2/6
// SESIÓN / LOGOUT / CHAT API / HEALTH / SOCKET AUTH
// ======================================================


// ======================================================
// COMPROBAR SESIÓN ACTUAL
// ======================================================

app.get(
  '/api/session',
  async (req, res) => {

    const token =
      getToken(req);


    const session =
      await getSessionByToken(
        token
      );


    if (!session) {

      return res
        .status(401)
        .json({

          ok: false,

          authenticated:
            false

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

          WHERE
            id = $1

          LIMIT 1
          `,
          [
            session.userId
          ]
        );


      if (
        result.rows.length === 0
      ) {

        await revokeSession(token);


        return res
          .status(401)
          .json({

            ok: false,

            authenticated:
              false

          });

      }


      const user =
        result.rows[0];


      if (!user.verified) {

        await revokeSession(token);


        return res
          .status(401)
          .json({

            ok: false,

            authenticated:
              false

          });

      }


      return res.json({

        ok: true,

        authenticated:
          true,

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
        error
      );


      return res
        .status(500)
        .json({

          ok: false,

          authenticated:
            false

        });

    }

  }
);


// ======================================================
// ALIAS DE SESIÓN PARA COMPATIBILIDAD
// ======================================================

app.get(
  '/api/auth/session',
  async (req, res) => {

    const token =
      getToken(req);


    const session =
      await getSessionByToken(
        token
      );


    if (!session) {

      return res
        .status(401)
        .json({

          ok: false,

          authenticated:
            false

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

          WHERE
            id = $1

          LIMIT 1
          `,
          [
            session.userId
          ]
        );


      if (
        result.rows.length === 0
      ) {

        await revokeSession(token);


        return res
          .status(401)
          .json({

            ok: false,

            authenticated:
              false

          });

      }


      const user =
        result.rows[0];


      if (!user.verified) {

        await revokeSession(token);


        return res
          .status(401)
          .json({

            ok: false,

            authenticated:
              false

          });

      }


      return res.json({

        ok: true,

        authenticated:
          true,

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
        'VOBIXCHAT AUTH SESSION ERROR:',
        error
      );


      return res
        .status(500)
        .json({

          ok: false,

          authenticated:
            false

        });

    }

  }
);


// ======================================================
// CERRAR SESIÓN
// ======================================================

app.post(
  '/api/logout',
  async (req, res) => {

    const token =
      getToken(req);


    if (token) {

      await revokeSession(token);

    }


    return res.json({

      ok: true

    });

  }
);


// ======================================================
// ALIAS LOGOUT
// ======================================================

app.post(
  '/api/auth/logout',
  async (req, res) => {

    const token =
      getToken(req);


    if (token) {

      await revokeSession(token);

    }


    return res.json({

      ok: true

    });

  }
);


// ======================================================
// API PRIVADA DEL CHAT
// ======================================================
//
// IMPORTANTE:
//
// Aquí conectamos el routes/chat.js que acabas
// de colocar en los 6 bloques anteriores.
//
// Todas estas rutas quedan detrás de requireAuth.
//
// Ejemplos:
//
// GET  /api/chat/users/search
// GET  /api/chat/conversations
// POST /api/chat/conversations
// GET  /api/chat/conversations/:id/messages
// POST /api/chat/conversations/:id/messages
// POST /api/chat/upload
//
// ======================================================

app.use(
  '/api/chat',
  requireAuth,
  chatRoutes
);

// ======================================================
// VOBIX TE ENSEÑA · CATÁLOGO Y PROGRESO
// ======================================================
const learningCatalog = [
  { key:'english-us', language:'Inglés americano', level:'Desde cero', icon:'🇺🇸', lessons:[
    { key:'hello', title:'Saludos y presentación', video:'Di y escucha: Hello, my name is…', task:'Graba una presentación de 20 segundos.' },
    { key:'daily', title:'Conversación diaria', video:'Pedir ayuda y responder con cortesía.', task:'Escribe tres frases de tu rutina.' },
    { key:'work', title:'Inglés para trabajo', video:'Reuniones, correo y entrevistas.', task:'Practica una entrevista breve.' }
  ]},
  { key:'english-uk', language:'Inglés británico', level:'Desde cero', icon:'🇬🇧', lessons:[
    { key:'hello', title:'Saludos británicos', video:'Presentarte con pronunciación británica.', task:'Practica tres saludos.' },
    { key:'city', title:'La ciudad', video:'Direcciones, transporte y compras.', task:'Describe tu ciudad.' }
  ]},
  { key:'spanish', language:'Español', level:'Desde cero', icon:'🇪🇸', lessons:[
    { key:'hello', title:'Hola y presentación', video:'Saludos y alfabeto español.', task:'Preséntate por escrito.' },
    { key:'daily', title:'Vida diaria', video:'Familia, comida y horarios.', task:'Cuenta cómo es tu día.' }
  ]},
  { key:'french', language:'Francés', level:'Desde cero', icon:'🇫🇷', lessons:[
    { key:'hello', title:'Bonjour', video:'Saludos y presentación.', task:'Practica cinco palabras.' },
    { key:'travel', title:'Viajes', video:'Restaurante y direcciones.', task:'Pide una comida.' }
  ]},
  { key:'german', language:'Alemán', level:'Desde cero', icon:'🇩🇪', lessons:[
    { key:'hello', title:'Hallo', video:'Saludos y pronunciación.', task:'Di tu nombre y país.' },
    { key:'daily', title:'Día a día', video:'Números y horarios.', task:'Escribe cinco números.' }
  ]},
  { key:'italian', language:'Italiano', level:'Desde cero', icon:'🇮🇹', lessons:[
    { key:'hello', title:'Ciao', video:'Saludos y presentación.', task:'Preséntate en italiano.' },
    { key:'food', title:'Comida', video:'Pedir en un restaurante.', task:'Elige tu plato favorito.' }
  ]}
];

app.get('/api/learn/catalog', requireAuth, (req, res) => res.json({ok:true,courses:learningCatalog}));

app.get('/api/learn/progress', requireAuth, async (req,res) => {
  try {
    const result=await database.query('SELECT course_key, lesson_key, completed, score, updated_at FROM learning_progress WHERE user_id=$1 ORDER BY updated_at DESC',[req.vobixUser.id]);
    res.json({ok:true,progress:result.rows});
  } catch(error) { res.status(500).json({ok:false,msg:'No se pudo cargar tu progreso'}); }
});

app.post('/api/learn/progress', requireAuth, async (req,res) => {
  const courseKey=String(req.body.courseKey||'').trim();
  const lessonKey=String(req.body.lessonKey||'').trim();
  const score=Number.isFinite(Number(req.body.score)) ? Math.max(0,Math.min(100,Number(req.body.score))) : null;
  const valid=learningCatalog.some(c=>c.key===courseKey && c.lessons.some(l=>l.key===lessonKey));
  if(!valid) return res.status(400).json({ok:false,msg:'Lección no válida'});
  try {
    const result=await database.query(`INSERT INTO learning_progress(user_id,course_key,lesson_key,completed,score,updated_at) VALUES($1,$2,$3,TRUE,$4,NOW()) ON CONFLICT(user_id,course_key,lesson_key) DO UPDATE SET completed=TRUE,score=EXCLUDED.score,updated_at=NOW() RETURNING course_key,lesson_key,completed,score,updated_at`,[req.vobixUser.id,courseKey,lessonKey,score]);
    res.json({ok:true,progress:result.rows[0]});
  } catch(error) { res.status(500).json({ok:false,msg:'No se pudo guardar tu progreso'}); }
});


// ======================================================
// HEALTH CHECK
// ======================================================

app.get(
  '/api/health',
  async (req, res) => {

    try {

      const result =
        await database.query(
          `
          SELECT
            NOW()
              AS server_time
          `
        );


      return res.json({

        ok: true,

        app:
          'VobixChat',

        database:
          'connected',

        socket:
          true,

        serverTime:
          result.rows[0]
            .server_time

      });


    } catch (error) {

      console.error(
        'VOBIXCHAT DATABASE ERROR:',
        error
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
// AUTENTICACIÓN DE SOCKET.IO
// ======================================================
//
// El frontend debe conectar con:
//
// io({
//   auth: {
//     token: TOKEN
//   }
// })
//
// También aceptamos ?token= para compatibilidad.
//
// ======================================================

io.use(
  async (
    socket,
    next
  ) => {

    try {

      const token =
        String(

          socket.handshake
            .auth?.token ||

          socket.handshake
            .query?.token ||

          ''

        ).trim();


      const session =
        await getSessionByToken(
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


      // ================================================
      // DATOS AUTENTICADOS DEL SOCKET
      // ================================================

      socket.vobixToken =
        token;


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
          user.avatar_url,

        verified:
          user.verified,

        online:
          user.online,

        lastSeen:
          user.last_seen

      };


      return next();


    } catch (error) {

      console.error(
        'VOBIXCHAT SOCKET AUTH ERROR:',
        error
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
// USUARIOS CONECTADOS
// ======================================================
//
// Map:
//
// userId -> Set(socketId)
//
// Un usuario puede tener VOBIXCHAT abierto simultáneamente
// en móvil y portátil.
//
// ======================================================

const onlineUsers =
  new Map();


// ======================================================
// LLAMADAS ACTIVAS
// ======================================================
//
// callId -> {
//   id,
//   conversationId,
//   callerId,
//   type,
//   participants: Set(),
//   createdAt
// }
//
// ======================================================

const activeCalls =
  new Map();


// ======================================================
// OBTENER NOMBRE DE SALA PERSONAL
// ======================================================

function userRoom(
  userId
) {

  return (
    `user:${String(userId)}`
  );

}


// ======================================================
// OBTENER NOMBRE DE SALA DE CONVERSACIÓN
// ======================================================

function conversationRoom(
  conversationId
) {

  return (
    `conversation:${String(
      conversationId
    )}`
  );

}


// ======================================================
// OBTENER NOMBRE DE SALA DE LLAMADA
// ======================================================

function callRoom(
  callId
) {

  return (
    `call:${String(callId)}`
  );

}


// ======================================================
// REGISTRAR SOCKET ONLINE
// ======================================================

function addOnlineSocket(
  userId,
  socketId
) {

  const key =
    String(userId);


  if (
    !onlineUsers.has(
      key
    )
  ) {

    onlineUsers.set(
      key,
      new Set()
    );

  }


  onlineUsers
    .get(key)
    .add(socketId);

}


// ======================================================
// QUITAR SOCKET ONLINE
// ======================================================

function removeOnlineSocket(
  userId,
  socketId
) {

  const key =
    String(userId);


  const sockets =
    onlineUsers.get(
      key
    );


  if (!sockets) {

    return false;

  }


  sockets.delete(
    socketId
  );


  if (
    sockets.size === 0
  ) {

    onlineUsers.delete(
      key
    );

    return true;

  }


  return false;

}


// ======================================================
// SABER SI UN USUARIO ESTÁ ONLINE
// ======================================================

function isUserOnline(
  userId
) {

  const sockets =
    onlineUsers.get(
      String(userId)
    );


  return Boolean(
    sockets &&
    sockets.size > 0
  );

}


// ======================================================
// COMPROBAR ACCESO SOCKET A CONVERSACIÓN
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
        ON
          u.id = cp.user_id

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
// EMITIR A TODOS LOS PARTICIPANTES
// ======================================================

async function emitConversationUpdate(
  conversationId,
  eventName,
  payload
) {

  const participants =
    await getConversationParticipants(
      conversationId
    );


  for (
    const participant
    of participants
  ) {

    io
      .to(
        userRoom(
          participant.user_id
        )
      )
      .emit(
        eventName,
        payload
      );

  }

}


// ======================================================
// FIN BLOQUE 2/6
// CONTINÚA DIRECTAMENTE CON BLOQUE 3/6
// ======================================================
// ======================================================
// BLOQUE 3/6
// SOCKET.IO
// PRESENCIA / SALAS PRIVADAS / MENSAJES TIEMPO REAL
// ======================================================

io.on(
  'connection',
  async socket => {

    const user =
      socket.vobixUser;

    const userId =
      user.id;


    console.log(
      `VOBIXCHAT | SOCKET CONECTADO | ${user.username}`
    );


    // ==================================================
    // REGISTRAR DISPOSITIVO / SOCKET
    // ==================================================

    addOnlineSocket(
      userId,
      socket.id
    );


    // ==================================================
    // SALA PERSONAL DEL USUARIO
    // ==================================================

    socket.join(
      userRoom(
        userId
      )
    );


    // ==================================================
    // MARCAR ONLINE EN POSTGRESQL
    // ==================================================

    try {

      await database.query(
        `
        UPDATE users

        SET
          online = TRUE,
          last_seen = NOW()

        WHERE
          id = $1
        `,
        [
          userId
        ]
      );

    } catch (error) {

      console.error(
        'VOBIXCHAT ONLINE UPDATE ERROR:',
        error
      );

    }


    // ==================================================
    // AVISAR PRESENCIA
    // ==================================================

    socket.broadcast.emit(
      'presence:update',
      {

        userId,

        online:
          true,

        lastSeen:
          new Date()
            .toISOString()

      }
    );


    // ==================================================
    // UNIRSE A SALA PRIVADA
    // ==================================================

    socket.on(
      'conversation-join',
      async (
        payload = {},
        callback
      ) => {

        try {

          const conversationId =
            String(
              payload.conversationId ||
              payload.conversation_id ||
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


          await socket.join(
            conversationRoom(
              conversationId
            )
          );


          socket.emit(
            'conversation:joined',
            {

              conversationId

            }
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
    // SALIR DE SALA PRIVADA
    // ==================================================

    socket.on(
      'conversation-leave',
      async (
        payload = {},
        callback
      ) => {

        const conversationId =
          String(
            payload.conversationId ||
            payload.conversation_id ||
            ''
          ).trim();


        if (!conversationId) {

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


        try {

          await socket.leave(
            conversationRoom(
              conversationId
            )
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
            'VOBIXCHAT CONVERSATION LEAVE ERROR:',
            error
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
    // MENSAJE DE TEXTO EN TIEMPO REAL
    // ==================================================

    socket.on(
      'conversation-message',
      async (
        payload = {},
        callback
      ) => {

        try {

          const conversationId =
            String(
              payload.conversationId ||
              payload.conversation_id ||
              ''
            ).trim();


          const text =
            String(
              payload.text ||
              payload.content ||
              payload.message ||
              ''
            )
              .trim()
              .slice(
                0,
                10000
              );


          // ==============================================
          // VALIDACIONES
          // ==============================================

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


          if (!text) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({

                ok: false,

                msg:
                  'El mensaje está vacío'

              });

            }


            return;

          }


          // ==============================================
          // COMPROBAR PARTICIPACIÓN
          // ==============================================

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


          // ==============================================
          // COMPROBAR BLOQUEO
          // ==============================================

          const blocked =
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


          if (
            blocked.rows.length > 0
          ) {

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


          const row =
            result.rows[0];


          // ==============================================
          // ACTUALIZAR HISTORIAL
          // ==============================================

          await database.query(
            `
            UPDATE conversations

            SET
              updated_at = NOW()

            WHERE
              id = $1
            `,
            [
              conversationId
            ]
          );


          // ==============================================
          // MENSAJE NORMALIZADO
          // ==============================================

          const message = {

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
              user.username,

            senderAvatarUrl:
              user.avatarUrl,

            messageType:
              row.message_type,

            message_type:
              row.message_type,

            content:
              row.content,

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


          // ==============================================
          // EMITIR A LA SALA ABIERTA
          // ==============================================

          io
            .to(
              conversationRoom(
                conversationId
              )
            )
            .emit(
              'conversation-message',
              {

                conversationId,

                message

              }
            );


          // ==============================================
          // AVISAR A TODOS LOS PARTICIPANTES
          //
          // Esto permite actualizar el historial incluso
          // si el destinatario no tiene esa sala abierta.
          // ==============================================

          await emitConversationUpdate(
            conversationId,
            'conversation:new-message',
            {

              conversationId,

              message

            }
          );


          // Push al otro participante cuando el mensaje llega por Socket.IO.
          const realtimeParticipants =
            await getConversationParticipants(conversationId);

          for (const participant of realtimeParticipants) {
            if (String(participant.user_id) === String(userId)) continue;

            await sendPushToUser(participant.user_id, {
              type: 'message',
              title: user.username || 'VOBIXCHAT',
              body: String(text).slice(0, 180),
              conversationId,
              fromUserId: userId,
              senderUsername: user.username,
              messageType: 'text',
              url: `/chat.html?conversationId=${encodeURIComponent(conversationId)}&userId=${encodeURIComponent(userId)}`
            });
          }


          // ==============================================
          // CONFIRMAR AL EMISOR
          // ==============================================

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
            'VOBIXCHAT REALTIME MESSAGE ERROR:',
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
    // INDICADOR "ESCRIBIENDO..."
    // ==================================================

    socket.on(
      'conversation:typing',
      async (
        payload = {}
      ) => {

        try {

          const conversationId =
            String(
              payload.conversationId ||
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
              conversationRoom(
                conversationId
              )
            )
            .emit(
              'conversation:typing',
              {

                conversationId,

                userId,

                username:
                  user.username,

                typing:
                  Boolean(
                    payload.typing
                  )

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
    // MENSAJE LEÍDO
    // ==================================================

    socket.on(
      'conversation:read',
      async (
        payload = {}
      ) => {

        try {

          const conversationId =
            String(
              payload.conversationId ||
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


          /*
            Intentamos guardar last_read_at.

            Si la instalación todavía no tiene esa
            columna, no rompemos Socket.IO.
          */

          try {

            await database.query(
              `
              UPDATE conversation_participants

              SET
                last_read_at = NOW()

              WHERE
                conversation_id = $1
                AND user_id = $2
              `,
              [
                conversationId,
                userId
              ]
            );

          } catch (readError) {

            if (
              readError.code !==
              '42703'
            ) {

              throw readError;

            }

          }


          socket
            .to(
              conversationRoom(
                conversationId
              )
            )
            .emit(
              'conversation:read',
              {

                conversationId,

                userId,

                readAt:
                  new Date()
                    .toISOString()

              }
            );


        } catch (error) {

          console.error(
            'VOBIXCHAT READ SOCKET ERROR:',
            error.message
          );

        }

      }
    );


    // ==================================================
    // PING DE PRESENCIA
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
              last_seen = NOW()

            WHERE
              id = $1
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

              serverTime:
                new Date()
                  .toISOString()

            });

          }


        } catch (error) {

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


// ======================================================
// NO CERRAMOS io.on TODAVÍA.
// BLOQUE 4 CONTINÚA DENTRO DE ESTA MISMA CONEXIÓN.
//
// BLOQUE 4 = LLAMADAS + VIDEOLLAMADAS + AGREGAR PERSONAS
// ======================================================
     // ==================================================
    // INICIAR LLAMADA / VIDEOLLAMADA
    // ==================================================

    socket.on(
      'call:start',
      async (
        payload = {},
        callback
      ) => {

        try {

          const conversationId =
            String(
              payload.conversationId ||
              payload.conversation_id ||
              ''
            ).trim();


          const type =
            String(
              payload.type ||
              'audio'
            ).toLowerCase() === 'video'
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


          // ==============================================
          // COMPROBAR QUE QUIEN LLAMA PERTENECE A LA SALA
          // ==============================================

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


          // ==============================================
          // OBTENER PARTICIPANTES DE LA CONVERSACIÓN
          // ==============================================

          const participants =
            await getConversationParticipants(
              conversationId
            );


          const otherParticipants =
            participants.filter(
              participant =>
                String(
                  participant.user_id
                ) !==
                String(
                  userId
                )
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
                  'No hay otro usuario en esta conversación'
              });

            }

            return;

          }


          // ==============================================
          // CREAR IDENTIFICADOR ÚNICO DE LLAMADA
          // ==============================================

          const callId =
            crypto
              .randomBytes(18)
              .toString('hex');


          const call = {

            id:
              callId,

            callId,

            conversationId,

            callerId:
              userId,

            caller: {

              id:
                userId,

              username:
                user.username,

              avatarUrl:
                user.avatarUrl

            },

            type,

            participants:
              new Set([
                String(userId)
              ]),

            invited:
              new Set(
                otherParticipants.map(
                  participant =>
                    String(
                      participant.user_id
                    )
                )
              ),

            createdAt:
              Date.now()

          };


          activeCalls.set(
            callId,
            call
          );


          // ==============================================
          // EL EMISOR ENTRA EN LA SALA DE LLAMADA
          // ==============================================

          await socket.join(
            callRoom(
              callId
            )
          );


          // ==============================================
          // AVISAR A LOS DESTINATARIOS
          // ==============================================

          for (
            const participant
            of otherParticipants
          ) {

            io
              .to(
                userRoom(
                  participant.user_id
                )
              )
              .emit(
                'call:incoming',
                {

                  callId,

                  conversationId,

                  type,

                  caller: {

                    id:
                      userId,

                    username:
                      user.username,

                    avatarUrl:
                      user.avatarUrl

                  }

                }
              );

          }


          // ==============================================
          // RESPUESTA AL QUE LLAMA
          // ==============================================

          if (
            typeof callback ===
            'function'
          ) {

            callback({

              ok: true,

              callId,

              conversationId,

              type,

              participants:
                otherParticipants.map(
                  participant => ({

                    userId:
                      participant.user_id,

                    username:
                      participant.username,

                    avatarUrl:
                      participant.avatar_url,

                    online:
                      isUserOnline(
                        participant.user_id
                      )

                  })
                )

            });

          }


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
        payload = {},
        callback
      ) => {

        try {

          const callId =
            String(
              payload.callId ||
              payload.call_id ||
              ''
            ).trim();


          const call =
            activeCalls.get(
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


          const allowed =
            call.invited.has(
              String(userId)
            ) ||
            call.participants.has(
              String(userId)
            );


          if (!allowed) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({
                ok: false,
                msg:
                  'No estás invitado a esta llamada'
              });

            }

            return;

          }


          call.participants.add(
            String(userId)
          );


          call.invited.delete(
            String(userId)
          );


          await socket.join(
            callRoom(
              callId
            )
          );


          // ==============================================
          // AVISAR A TODOS LOS PARTICIPANTES
          // ==============================================

          io
            .to(
              callRoom(
                callId
              )
            )
            .emit(
              'call:accepted',
              {

                callId,

                user: {

                  id:
                    userId,

                  username:
                    user.username,

                  avatarUrl:
                    user.avatarUrl

                },

                participants:
                  Array.from(
                    call.participants
                  )

              }
            );


          if (
            typeof callback ===
            'function'
          ) {

            callback({

              ok: true,

              callId,

              type:
                call.type,

              conversationId:
                call.conversationId,

              participants:
                Array.from(
                  call.participants
                ),

              candidates:
                (call.pendingIce || [])
                  .filter(item => String(item.fromUserId) !== String(userId))
                  .map(item => item.candidate)

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
      async (
        payload = {},
        callback
      ) => {

        try {

          const callId =
            String(
              payload.callId ||
              ''
            ).trim();


          const call =
            activeCalls.get(
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


          call.invited.delete(
            String(userId)
          );


          io
            .to(
              userRoom(
                call.callerId
              )
            )
            .emit(
              'call:rejected',
              {

                callId,

                userId

              }
            );


          if (
            call.participants.size <= 1 &&
            call.invited.size === 0
          ) {

            activeCalls.delete(
              callId
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
              ok: false
            });

          }

        }

      }
    );


    // ==================================================
    // AGREGAR PERSONA A LLAMADA / VIDEOLLAMADA
    // ==================================================

    socket.on(
      'call:add-user',
      async (
        payload = {},
        callback
      ) => {

        try {

          const callId =
            String(
              payload.callId ||
              ''
            ).trim();


          const targetUserId =
            String(
              payload.userId ||
              payload.targetUserId ||
              ''
            ).trim();


          if (
            !callId ||
            !targetUserId
          ) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({
                ok: false,
                msg:
                  'Datos de invitación incompletos'
              });

            }

            return;

          }


          const call =
            activeCalls.get(
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


          // ==============================================
          // SOLO UN PARTICIPANTE ACTIVO PUEDE INVITAR
          // ==============================================

          if (
            !call.participants.has(
              String(userId)
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
            String(targetUserId) ===
            String(userId)
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


          if (
            call.participants.has(
              targetUserId
            ) ||
            call.invited.has(
              targetUserId
            )
          ) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({
                ok: false,
                msg:
                  'El usuario ya está agregado o invitado'
              });

            }

            return;

          }


          // ==============================================
          // COMPROBAR QUE EL USUARIO EXISTE
          // ==============================================

          const targetResult =
            await database.query(
              `
              SELECT
                id,
                username,
                avatar_url,
                verified,
                online

              FROM users

              WHERE
                id = $1
                AND verified = TRUE

              LIMIT 1
              `,
              [
                targetUserId
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


          const target =
            targetResult.rows[0];


          // ==============================================
          // COMPROBAR BLOQUEO ENTRE QUIEN INVITA
          // Y LA PERSONA INVITADA
          // ==============================================

          const blockResult =
            await database.query(
              `
              SELECT 1

              FROM user_blocks

              WHERE
                (
                  blocker_user_id = $1
                  AND blocked_user_id = $2
                )

                OR

                (
                  blocker_user_id = $2
                  AND blocked_user_id = $1
                )

              LIMIT 1
              `,
              [
                userId,
                targetUserId
              ]
            );


          if (
            blockResult.rows.length > 0
          ) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({
                ok: false,
                msg:
                  'No se puede agregar este usuario'
              });

            }

            return;

          }


          // ==============================================
          // REGISTRAR INVITACIÓN
          // ==============================================

          call.invited.add(
            targetUserId
          );


          // ==============================================
          // ENVIAR LLAMADA ENTRANTE AL NUEVO USUARIO
          // ==============================================

          io
            .to(
              userRoom(
                targetUserId
              )
            )
            .emit(
              'call:incoming',
              {

                callId,

                conversationId:
                  call.conversationId,

                type:
                  call.type,

                group:
                  true,

                invitedBy: {

                  id:
                    userId,

                  username:
                    user.username,

                  avatarUrl:
                    user.avatarUrl

                },

                caller:
                  call.caller

              }
            );


          // ==============================================
          // INFORMAR A LA SALA DE LLAMADA
          // ==============================================

          io
            .to(
              callRoom(
                callId
              )
            )
            .emit(
              'call:user-invited',
              {

                callId,

                user: {

                  id:
                    target.id,

                  username:
                    target.username,

                  avatarUrl:
                    target.avatar_url,

                  online:
                    target.online

                },

                invitedBy:
                  userId

              }
            );


          if (
            typeof callback ===
            'function'
          ) {

            callback({

              ok: true,

              callId,

              user: {

                id:
                  target.id,

                username:
                  target.username,

                avatarUrl:
                  target.avatar_url,

                online:
                  target.online

              }

            });

          }


        } catch (error) {

          console.error(
            'VOBIXCHAT CALL ADD USER ERROR:',
            error
          );


          if (
            typeof callback ===
            'function'
          ) {

            callback({
              ok: false,
              msg:
                'No se pudo agregar el usuario'
            });

          }

        }

      }
    );


    // ==================================================
    // TERMINAR / SALIR DE LLAMADA
    // ==================================================

    socket.on(
      'call:end',
      async (
        payload = {},
        callback
      ) => {

        try {

          const callId =
            String(
              payload.callId ||
              ''
            ).trim();


          const call =
            activeCalls.get(
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


          const currentUserKey =
            String(userId);


          // ==============================================
          // EL CREADOR TERMINA LA LLAMADA COMPLETA
          // ==============================================

          if (
            String(
              call.callerId
            ) ===
            currentUserKey
          ) {

            io
              .to(
                callRoom(
                  callId
                )
              )
              .emit(
                'call:ended',
                {

                  callId,

                  endedBy:
                    userId

                }
              );


            for (
              const invitedUserId
              of call.invited
            ) {

              io
                .to(
                  userRoom(
                    invitedUserId
                  )
                )
                .emit(
                  'call:ended',
                  {

                    callId,

                    endedBy:
                      userId

                  }
                );

            }


            activeCalls.delete(
              callId
            );


          } else {

            // ============================================
            // OTRO PARTICIPANTE SOLO SALE DE LA LLAMADA
            // ============================================

            call.participants.delete(
              currentUserKey
            );


            call.invited.delete(
              currentUserKey
            );


            await socket.leave(
              callRoom(
                callId
              )
            );


            io
              .to(
                callRoom(
                  callId
                )
              )
              .emit(
                'call:user-left',
                {

                  callId,

                  userId

                }
              );


            if (
              call.participants.size === 0
            ) {

              activeCalls.delete(
                callId
              );

            }

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


// ======================================================
// NO CERRAMOS io.on TODAVÍA.
//
// BLOQUE 5/6:
// - WebRTC offer
// - WebRTC answer
// - ICE candidates
// - desconexión
// - presencia
// - limpieza de llamadas
// ======================================================
     // ==================================================
    // COMPATIBILIDAD DEL CHAT ACTUAL
    // call:offer / call:answer / call:ice
    // ==================================================

    socket.on('call:offer', async (payload = {}, callback) => {
      try {
        const conversationId = String(payload.conversationId || payload.conversation_id || '').trim();
        const callId = String(payload.callId || crypto.randomBytes(18).toString('hex')).trim();
        const type = String(payload.type || 'audio').toLowerCase() === 'video' ? 'video' : 'audio';
        const offer = payload.offer || null;

        if (!conversationId || !offer) {
          if (typeof callback === 'function') callback({ ok:false, msg:'Oferta de llamada incompleta' });
          return;
        }

        const allowed = await socketCanAccessConversation(conversationId, userId);
        if (!allowed) {
          if (typeof callback === 'function') callback({ ok:false, msg:'No tienes acceso a esta conversación' });
          return;
        }

        const participants = await getConversationParticipants(conversationId);
        const targets = participants.filter(p => String(p.user_id) !== String(userId));
        if (!targets.length) {
          if (typeof callback === 'function') callback({ ok:false, msg:'No hay destinatario' });
          return;
        }

        const call = activeCalls.get(callId) || {
          id: callId,
          callId,
          conversationId,
          callerId: userId,
          caller: { id:userId, username:user.username, avatarUrl:user.avatarUrl },
          type,
          participants: new Set([String(userId)]),
          invited: new Set(),
          createdAt: Date.now()
        };

        // Guardamos la oferta mientras suena la llamada. Así el móvil puede
        // abrir VOBIXCHAT desde una notificación Push y recuperar la llamada.
        call.offer = offer;
        call.type = type;
        call.pendingIce = call.pendingIce || [];

        for (const target of targets) {
          // El destinatario sigue siendo invitado hasta pulsar Aceptar.
          // Esto evita activar cámara/micrófono o negociar WebRTC sin consentimiento.
          call.invited.add(String(target.user_id));
          io.to(userRoom(target.user_id)).emit('call:offer', {
            callId,
            conversationId,
            type,
            offer,
            fromUserId: userId,
            caller: { id:userId, username:user.username, avatarUrl:user.avatarUrl }
          });

          await sendPushToUser(target.user_id, {
            type: type === 'video' ? 'video-call' : 'call',
            title: type === 'video' ? `Videollamada de ${user.username}` : `Llamada de ${user.username}`,
            body: type === 'video' ? 'Videollamada entrante' : 'Llamada entrante',
            callId,
            conversationId,
            fromUserId: userId,
            callerName: user.username,
            callType: type,
            url: `/chat.html?conversationId=${encodeURIComponent(conversationId)}&incomingCall=1&call=${encodeURIComponent(callId)}&from=${encodeURIComponent(userId)}&callType=${encodeURIComponent(type)}`
          });
        }

        activeCalls.set(callId, call);
        if (typeof callback === 'function') callback({ ok:true, callId, conversationId, type });
      } catch (error) {
        console.error('VOBIXCHAT LEGACY CALL OFFER ERROR:', error);
        if (typeof callback === 'function') callback({ ok:false, msg:'No se pudo iniciar la llamada' });
      }
    });

    socket.on('call:answer', async (payload = {}, callback) => {
      try {
        const callId = String(payload.callId || '').trim();
        const answer = payload.answer || null;
        const call = activeCalls.get(callId);
        if (!call || !answer) {
          if (typeof callback === 'function') callback({ ok:false });
          return;
        }

        const targetUserId = String(call.callerId) === String(userId)
          ? Array.from(call.participants).find(id => String(id) !== String(userId))
          : String(call.callerId);

        if (targetUserId) {
          io.to(userRoom(targetUserId)).emit('call:answer', {
            callId,
            conversationId: call.conversationId,
            answer,
            fromUserId: userId
          });
        }
        if (typeof callback === 'function') callback({ ok:true });
      } catch (error) {
        console.error('VOBIXCHAT LEGACY CALL ANSWER ERROR:', error);
        if (typeof callback === 'function') callback({ ok:false });
      }
    });

    socket.on('call:ice', async (payload = {}, callback) => {
      try {
        const callId = String(payload.callId || '').trim();
        const candidate = payload.candidate || null;
        const call = activeCalls.get(callId);
        if (!call || !candidate) {
          if (typeof callback === 'function') callback({ ok:false });
          return;
        }

        call.pendingIce = call.pendingIce || [];
        call.pendingIce.push({
          fromUserId:String(userId),
          candidate
        });

        if (call.pendingIce.length > 80) {
          call.pendingIce.splice(0, call.pendingIce.length - 80);
        }

        const recipients = new Set([
          ...call.participants,
          ...call.invited
        ]);

        for (const targetUserId of recipients) {
          if (String(targetUserId) === String(userId)) continue;
          io.to(userRoom(targetUserId)).emit('call:ice', {
            callId,
            conversationId: call.conversationId,
            candidate,
            fromUserId: userId
          });
        }
        if (typeof callback === 'function') callback({ ok:true });
      } catch (error) {
        console.error('VOBIXCHAT LEGACY CALL ICE ERROR:', error);
        if (typeof callback === 'function') callback({ ok:false });
      }
    });

    socket.on('call:resume', async (payload = {}, callback) => {
      try {
        const callId = String(payload.callId || payload.call_id || '').trim();
        const call = activeCalls.get(callId);

        if (!call || !call.offer) {
          if (typeof callback === 'function') {
            callback({ ok:false, msg:'La llamada ya no está disponible' });
          }
          return;
        }

        const allowed =
          call.invited.has(String(userId)) ||
          call.participants.has(String(userId));

        if (!allowed) {
          if (typeof callback === 'function') {
            callback({ ok:false, msg:'No estás invitado a esta llamada' });
          }
          return;
        }

        if (typeof callback === 'function') {
          callback({
            ok:true,
            callId,
            conversationId:call.conversationId,
            type:call.type,
            offer:call.offer,
            caller:call.caller
            ,
            candidates:(call.pendingIce || [])
              .filter(item => String(item.fromUserId) !== String(userId))
              .map(item => item.candidate)
          });
        }
      } catch (error) {
        console.error('VOBIXCHAT CALL RESUME ERROR:', error);
        if (typeof callback === 'function') callback({ ok:false });
      }
    });

    // ==================================================
    // WEBRTC - OFFER
    // ==================================================

    socket.on(
      'webrtc:offer',
      async (
        payload = {},
        callback
      ) => {

        try {

          const callId =
            String(
              payload.callId ||
              ''
            ).trim();

          const targetUserId =
            String(
              payload.targetUserId ||
              payload.userId ||
              ''
            ).trim();

          const offer =
            payload.offer ||
            payload.sdp ||
            null;


          if (
            !callId ||
            !targetUserId ||
            !offer
          ) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({
                ok: false,
                msg:
                  'Oferta WebRTC incompleta'
              });

            }

            return;

          }


          const call =
            activeCalls.get(
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


          if (
            !call.participants.has(
              String(userId)
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
            !call.participants.has(
              targetUserId
            ) &&
            !call.invited.has(
              targetUserId
            )
          ) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({
                ok: false,
                msg:
                  'El destinatario no pertenece a esta llamada'
              });

            }

            return;

          }


          io
            .to(
              userRoom(
                targetUserId
              )
            )
            .emit(
              'webrtc:offer',
              {

                callId,

                fromUserId:
                  userId,

                fromUser: {

                  id:
                    userId,

                  username:
                    user.username,

                  avatarUrl:
                    user.avatarUrl

                },

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


        } catch (error) {

          console.error(
            'VOBIXCHAT WEBRTC OFFER ERROR:',
            error
          );


          if (
            typeof callback ===
            'function'
          ) {

            callback({
              ok: false,
              msg:
                'No se pudo enviar la oferta WebRTC'
            });

          }

        }

      }
    );


    // ==================================================
    // WEBRTC - ANSWER
    // ==================================================

    socket.on(
      'webrtc:answer',
      async (
        payload = {},
        callback
      ) => {

        try {

          const callId =
            String(
              payload.callId ||
              ''
            ).trim();

          const targetUserId =
            String(
              payload.targetUserId ||
              payload.userId ||
              ''
            ).trim();

          const answer =
            payload.answer ||
            payload.sdp ||
            null;


          if (
            !callId ||
            !targetUserId ||
            !answer
          ) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({
                ok: false,
                msg:
                  'Respuesta WebRTC incompleta'
              });

            }

            return;

          }


          const call =
            activeCalls.get(
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


          if (
            !call.participants.has(
              String(userId)
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
            !call.participants.has(
              targetUserId
            )
          ) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({
                ok: false,
                msg:
                  'El destinatario no está en la llamada'
              });

            }

            return;

          }


          io
            .to(
              userRoom(
                targetUserId
              )
            )
            .emit(
              'webrtc:answer',
              {

                callId,

                fromUserId:
                  userId,

                fromUser: {

                  id:
                    userId,

                  username:
                    user.username,

                  avatarUrl:
                    user.avatarUrl

                },

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


        } catch (error) {

          console.error(
            'VOBIXCHAT WEBRTC ANSWER ERROR:',
            error
          );


          if (
            typeof callback ===
            'function'
          ) {

            callback({
              ok: false,
              msg:
                'No se pudo enviar la respuesta WebRTC'
            });

          }

        }

      }
    );


    // ==================================================
    // WEBRTC - ICE CANDIDATE
    // ==================================================

    socket.on(
      'webrtc:ice-candidate',
      async (
        payload = {},
        callback
      ) => {

        try {

          const callId =
            String(
              payload.callId ||
              ''
            ).trim();

          const targetUserId =
            String(
              payload.targetUserId ||
              payload.userId ||
              ''
            ).trim();

          const candidate =
            payload.candidate ||
            null;


          if (
            !callId ||
            !targetUserId ||
            !candidate
          ) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({
                ok: false,
                msg:
                  'ICE candidate incompleto'
              });

            }

            return;

          }


          const call =
            activeCalls.get(
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


          if (
            !call.participants.has(
              String(userId)
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
            !call.participants.has(
              targetUserId
            ) &&
            !call.invited.has(
              targetUserId
            )
          ) {

            if (
              typeof callback ===
              'function'
            ) {

              callback({
                ok: false,
                msg:
                  'Destinatario WebRTC no válido'
              });

            }

            return;

          }


          io
            .to(
              userRoom(
                targetUserId
              )
            )
            .emit(
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


        } catch (error) {

          console.error(
            'VOBIXCHAT WEBRTC ICE ERROR:',
            error
          );


          if (
            typeof callback ===
            'function'
          ) {

            callback({
              ok: false,
              msg:
                'No se pudo enviar ICE candidate'
            });

          }

        }

      }
    );


    // ==================================================
    // COMPATIBILIDAD CON EVENTOS WEBRTC ANTIGUOS
    // ==================================================

    socket.on(
      'webrtc-offer',
      payload => {

        socket.emit(
          'webrtc:compatibility-warning',
          {
            event:
              'webrtc-offer',
            use:
              'webrtc:offer'
          }
        );

      }
    );


    // ==================================================
    // DESCONEXIÓN DEL SOCKET
    // ==================================================

    socket.on(
      'disconnect',
      async reason => {

        console.log(
          `VOBIXCHAT | SOCKET DESCONECTADO | ${user.username} | ${reason}`
        );


        // ================================================
        // QUITAR ESTE DISPOSITIVO
        // ================================================

        const completelyOffline =
          removeOnlineSocket(
            userId,
            socket.id
          );


        // ================================================
        // SOLO MARCAR OFFLINE SI NO TIENE OTRO
        // DISPOSITIVO CONECTADO
        // ================================================

        if (
          completelyOffline
        ) {

          try {

            await database.query(
              `
              UPDATE users

              SET
                online = FALSE,
                last_seen = NOW()

              WHERE
                id = $1
              `,
              [
                userId
              ]
            );


          } catch (error) {

            console.error(
              'VOBIXCHAT OFFLINE UPDATE ERROR:',
              error
            );

          }


          io.emit(
            'presence:update',
            {

              userId,

              online:
                false,

              lastSeen:
                new Date()
                  .toISOString()

            }
          );

        }


        // ================================================
        // LIMPIAR PARTICIPACIÓN EN LLAMADAS
        // ================================================

        for (
          const [
            callId,
            call
          ]
          of activeCalls.entries()
        ) {

          const userKey =
            String(userId);


          const wasParticipant =
            call.participants.has(
              userKey
            );


          const wasInvited =
            call.invited.has(
              userKey
            );


          if (
            !wasParticipant &&
            !wasInvited
          ) {

            continue;

          }


          /*
            Si el usuario todavía tiene VOBIXCHAT abierto
            en otro dispositivo, NO lo sacamos de la llamada
            automáticamente por desconectar este socket.
          */

          if (
            isUserOnline(
              userId
            )
          ) {

            continue;

          }


          call.participants.delete(
            userKey
          );


          call.invited.delete(
            userKey
          );


          io
            .to(
              callRoom(
                callId
              )
            )
            .emit(
              'call:user-left',
              {

                callId,

                userId,

                disconnected:
                  true

              }
            );


          // ==============================================
          // SI ERA EL CREADOR Y YA NO ESTÁ CONECTADO
          // TERMINAR LA LLAMADA
          // ==============================================

          if (
            String(
              call.callerId
            ) ===
            userKey
          ) {

            io
              .to(
                callRoom(
                  callId
                )
              )
              .emit(
                'call:ended',
                {

                  callId,

                  endedBy:
                    userId,

                  reason:
                    'caller-disconnected'

                }
              );


            for (
              const invitedUserId
              of call.invited
            ) {

              io
                .to(
                  userRoom(
                    invitedUserId
                  )
                )
                .emit(
                  'call:ended',
                  {

                    callId,

                    endedBy:
                      userId,

                    reason:
                      'caller-disconnected'

                  }
                );

            }


            activeCalls.delete(
              callId
            );


            continue;

          }


          // ==============================================
          // SI NO QUEDA NADIE, BORRAR LLAMADA
          // ==============================================

          if (
            call.participants.size === 0
          ) {

            activeCalls.delete(
              callId
            );

          }

        }

      }
    );


// ======================================================
// AHORA SÍ CERRAMOS io.on('connection')
// ======================================================

  }
);


// ======================================================
// LIMPIEZA PERIÓDICA DE LLAMADAS ABANDONADAS
// ======================================================

const CALL_MAX_AGE_MS =
  6 *
  60 *
  60 *
  1000;


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

      if (
        now -
        call.createdAt >
        CALL_MAX_AGE_MS
      ) {

        io
          .to(
            callRoom(
              callId
            )
          )
          .emit(
            'call:ended',
            {

              callId,

              reason:
                'expired'

            }
          );


        for (
          const invitedUserId
          of call.invited
        ) {

          io
            .to(
              userRoom(
                invitedUserId
              )
            )
            .emit(
              'call:ended',
              {

                callId,

                reason:
                  'expired'

              }
            );

        }


        activeCalls.delete(
          callId
        );

      }

    }

  },

  10 * 60 * 1000

);


// ======================================================
// LIMPIAR SESIONES VENCIDAS PERIÓDICAMENTE
// ======================================================

setInterval(
  () => { cleanExpiredSessions(); },
  60 * 60 * 1000
);


// ======================================================
// FIN BLOQUE 5/6
//
// BLOQUE 6 CIERRA server.js:
// - push notifications
// - fallback frontend
// - inicialización BD
// - arranque del servidor
// ======================================================
// ======================================================
// BLOQUE 6/6
// PUSH / FRONTEND / INICIALIZACIÓN / ARRANQUE
// ======================================================


// ======================================================
// CONFIGURAR WEB PUSH
// ======================================================

let pushEnabled =
  false;


if (
  webpush &&
  config.VAPID_PUBLIC_KEY &&
  config.VAPID_PRIVATE_KEY
) {

  try {

    webpush.setVapidDetails(

      config.VAPID_SUBJECT ||
      'mailto:admin@vobixchat.com',

      config.VAPID_PUBLIC_KEY,

      config.VAPID_PRIVATE_KEY

    );


    pushEnabled =
      true;


    console.log(
      'VOBIXCHAT | PUSH NOTIFICATIONS ACTIVADAS'
    );


  } catch (error) {

    console.error(
      'VOBIXCHAT WEB PUSH CONFIG ERROR:',
      error
    );

  }

}


// ======================================================
// CLAVE PÚBLICA PUSH
// ======================================================

app.get(
  '/api/push/public-key',
  requireAuth,
  (req, res) => {

    if (
      !pushEnabled
    ) {

      return res
        .status(503)
        .json({

          ok: false,

          enabled:
            false,

          msg:
            'Push notifications todavía no configuradas'

        });

    }


    return res.json({

      ok: true,

      enabled:
        true,

      publicKey:
        config.VAPID_PUBLIC_KEY

    });

  }
);


// ======================================================
// GUARDAR SUSCRIPCIÓN PUSH
// ======================================================

app.post(
  '/api/push/subscribe',
  requireAuth,
  async (req, res) => {

    const userId =
      req.vobixUser.id;


    const subscription =
      req.body.subscription ||
      req.body;


    if (
      !subscription ||
      !subscription.endpoint ||
      !subscription.keys
    ) {

      return res
        .status(400)
        .json({

          ok: false,

          msg:
            'Suscripción push no válida'

        });

    }


    try {

      /*
        Guardamos la suscripción si la tabla existe.

        Esto permite que el Service Worker reciba
        notificaciones incluso con VOBIXCHAT cerrado
        o el teléfono en reposo, dependiendo de las
        restricciones del sistema operativo.
      */

      await database.query(
        `
        INSERT INTO push_subscriptions
        (
          user_id,
          endpoint,
          p256dh,
          auth,
          created_at,
          updated_at
        )

        VALUES
        (
          $1,
          $2,
          $3,
          $4,
          NOW(),
          NOW()
        )

        ON CONFLICT
        (
          endpoint
        )

        DO UPDATE SET
          user_id =
            EXCLUDED.user_id,

          p256dh =
            EXCLUDED.p256dh,

          auth =
            EXCLUDED.auth,

          updated_at =
            NOW()
        `,
        [
          userId,
          subscription.endpoint,
          subscription.keys.p256dh,
          subscription.keys.auth
        ]
      );


      return res.json({

        ok: true

      });


    } catch (error) {

      console.error(
        'VOBIXCHAT PUSH SUBSCRIBE ERROR:',
        error
      );


      return res
        .status(500)
        .json({

          ok: false,

          msg:
            'No se pudo guardar la suscripción push'

        });

    }

  }
);


// ======================================================
// AMIGOS Y SOLICITUDES
// ======================================================

app.get('/api/friends', requireAuth, async (req, res) => {
  try {
    const userId = String(req.vobixUser.id);
    const result = await database.query(
      `
      SELECT f.id AS friendship_id, f.status, f.requester_id, f.addressee_id,
             u.id, u.username, u.phone, u.vobix_id, u.avatar_url, u.online, u.last_seen
      FROM friendships f
      JOIN users u ON u.id = CASE
        WHEN f.requester_id = $1 THEN f.addressee_id
        ELSE f.requester_id
      END
      WHERE (f.requester_id = $1 OR f.addressee_id = $1)
      ORDER BY f.updated_at DESC
      `,
      [userId]
    );

    res.json({ ok:true, friends:result.rows });
  } catch (error) {
    console.error('VOBIXCHAT FRIENDS LIST ERROR:', error);
    res.status(500).json({ ok:false, msg:'No se pudieron cargar los amigos' });
  }
});

app.post('/api/friends/request', requireAuth, async (req, res) => {
  try {
    const requesterId = String(req.vobixUser.id);
    const addresseeId = String(req.body.userId || '').trim();

    if (!addresseeId || addresseeId === requesterId) {
      return res.status(400).json({ ok:false, msg:'Usuario no válido' });
    }

    const existing = await database.query(
      `
      SELECT id, status FROM friendships
      WHERE (requester_id=$1 AND addressee_id=$2)
         OR (requester_id=$2 AND addressee_id=$1)
      LIMIT 1
      `,
      [requesterId, addresseeId]
    );

    if (existing.rows.length) {
      return res.json({ ok:true, friendship:existing.rows[0], alreadyExists:true });
    }

    const created = await database.query(
      `
      INSERT INTO friendships(requester_id, addressee_id, status)
      VALUES($1,$2,'pending')
      RETURNING *
      `,
      [requesterId, addresseeId]
    );

    res.json({ ok:true, friendship:created.rows[0] });
  } catch (error) {
    console.error('VOBIXCHAT FRIEND REQUEST ERROR:', error);
    res.status(500).json({ ok:false, msg:'No se pudo enviar la solicitud' });
  }
});

app.post('/api/friends/:id/accept', requireAuth, async (req, res) => {
  try {
    const result = await database.query(
      `
      UPDATE friendships
      SET status='accepted', updated_at=NOW()
      WHERE id=$1 AND addressee_id=$2 AND status='pending'
      RETURNING *
      `,
      [req.params.id, req.vobixUser.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ ok:false, msg:'Solicitud no encontrada' });
    }

    res.json({ ok:true, friendship:result.rows[0] });
  } catch (error) {
    res.status(500).json({ ok:false, msg:'No se pudo aceptar la solicitud' });
  }
});

app.post('/api/friends/:id/reject', requireAuth, async (req, res) => {
  try {
    await database.query(
      `DELETE FROM friendships WHERE id=$1 AND addressee_id=$2 AND status='pending'`,
      [req.params.id, req.vobixUser.id]
    );
    res.json({ ok:true });
  } catch (error) {
    res.status(500).json({ ok:false, msg:'No se pudo rechazar la solicitud' });
  }
});


// ======================================================
// CONFIGURACIÓN WEBRTC / TURN
// ======================================================

app.get('/api/rtc-config', requireAuth, (req, res) => {
  const iceServers = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
  ];

  const turnUrls = String(process.env.TURN_URL || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

  if (
    turnUrls.length &&
    process.env.TURN_USERNAME &&
    process.env.TURN_CREDENTIAL
  ) {
    iceServers.push({
      urls: turnUrls,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL
    });
  }

  res.json({ ok:true, iceServers });
});


// ======================================================
// ELIMINAR SUSCRIPCIÓN PUSH
// ======================================================

app.post(
  '/api/push/unsubscribe',
  requireAuth,
  async (req, res) => {

    const userId =
      req.vobixUser.id;


    const endpoint =
      String(
        req.body.endpoint ||
        ''
      ).trim();


    if (!endpoint) {

      return res
        .status(400)
        .json({

          ok: false,

          msg:
            'Endpoint no válido'

        });

    }


    try {

      await database.query(
        `
        DELETE FROM push_subscriptions

        WHERE
          user_id = $1
          AND endpoint = $2
        `,
        [
          userId,
          endpoint
        ]
      );


      return res.json({

        ok: true

      });


    } catch (error) {

      console.error(
        'VOBIXCHAT PUSH UNSUBSCRIBE ERROR:',
        error
      );


      return res
        .status(500)
        .json({

          ok: false,

          msg:
            'No se pudo eliminar la suscripción'

        });

    }

  }
);


// ======================================================
// ENVIAR PUSH A UN USUARIO
// ======================================================

async function sendPushToUser(
  targetUserId,
  payload
) {

  if (
    !pushEnabled ||
    !targetUserId
  ) {

    return;

  }


  try {

    const result =
      await database.query(
        `
        SELECT
          id,
          endpoint,
          p256dh,
          auth

        FROM push_subscriptions

        WHERE
          user_id = $1
        `,
        [
          targetUserId
        ]
      );


    for (
      const row
      of result.rows
    ) {

      const subscription = {

        endpoint:
          row.endpoint,

        keys: {

          p256dh:
            row.p256dh,

          auth:
            row.auth

        }

      };


      try {

        await webpush.sendNotification(

          subscription,

          JSON.stringify(
            payload
          )

        );


      } catch (error) {

        /*
          404 / 410 significa normalmente que
          la suscripción del navegador venció.
        */

        if (
          error.statusCode === 404 ||
          error.statusCode === 410
        ) {

          try {

            await database.query(
              `
              DELETE FROM push_subscriptions

              WHERE
                id = $1
              `,
              [
                row.id
              ]
            );

          } catch (
            deleteError
          ) {

            console.error(
              'VOBIXCHAT DELETE DEAD PUSH ERROR:',
              deleteError.message
            );

          }


          continue;

        }


        console.error(
          'VOBIXCHAT SEND PUSH ERROR:',
          error.message
        );

      }

    }


  } catch (error) {

    console.error(
      'VOBIXCHAT PUSH QUERY ERROR:',
      error
    );

  }

}


// ======================================================
// HACER FUNCIÓN PUSH DISPONIBLE EN EXPRESS
// ======================================================

app.set(
  'sendPushToUser',
  sendPushToUser
);


// ======================================================
// HACER FUNCIÓN PUSH DISPONIBLE GLOBALMENTE
// PARA SOCKET / OTROS MÓDULOS DEL PROYECTO
// ======================================================

global.vobixSendPushToUser =
  sendPushToUser;


// ======================================================
// INFORMACIÓN DE PUSH
// ======================================================

app.get(
  '/api/push/status',
  requireAuth,
  (req, res) => {

    return res.json({

      ok: true,

      enabled:
        pushEnabled

    });

  }
);


// ======================================================
// RUTA PRINCIPAL
// ======================================================

app.get(
  '/',
  (req, res) => {

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
// FALLBACK DEL FRONTEND
// ======================================================
//
// IMPORTANTE:
//
// No interceptamos /api/*.
//
// Si la ruta no pertenece a la API,
// servimos la aplicación principal.
//
// Esto permite navegar dentro de VOBIXCHAT
// sin modificar la pantalla exterior.
//
// ======================================================

app.use(
  (req, res, next) => {

    if (
      req.path.startsWith(
        '/api/'
      )
    ) {

      return next();

    }


    if (
      req.method !== 'GET'
    ) {

      return next();

    }


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
// API 404
// ======================================================

app.use(
  (req, res, next) => {

    if (
      req.path.startsWith(
        '/api/'
      )
    ) {

      return res
        .status(404)
        .json({

          ok: false,

          msg:
            'Ruta API no encontrada'

        });

    }


    return next();

  }
);


// ======================================================
// MANEJADOR GENERAL DE ERRORES EXPRESS
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
// EVITAR CAÍDA SILENCIOSA POR PROMESAS
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


// ======================================================
// MOSTRAR ERRORES NO CONTROLADOS
// ======================================================

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
// APAGADO CONTROLADO
// ======================================================

let shuttingDown =
  false;


async function shutdown(
  signal
) {

  if (
    shuttingDown
  ) {

    return;

  }


  shuttingDown =
    true;


  console.log(
    `VOBIXCHAT | APAGANDO | ${signal}`
  );


  try {

    io.emit(
      'server:shutdown',
      {

        reason:
          'server-restart'

      }
    );

  } catch (error) {

    console.error(
      'VOBIXCHAT SOCKET SHUTDOWN ERROR:',
      error.message
    );

  }


  server.close(
    () => {

      console.log(
        'VOBIXCHAT | SERVIDOR HTTP CERRADO'
      );


      process.exit(0);

    }
  );


  /*
    Seguridad:
    si alguna conexión queda colgada,
    terminar después de 10 segundos.
  */

  setTimeout(
    () => {

      console.error(
        'VOBIXCHAT | APAGADO FORZADO'
      );


      process.exit(1);

    },

    10000
  ).unref();

}


process.on(
  'SIGTERM',
  () => {

    shutdown(
      'SIGTERM'
    );

  }
);


process.on(
  'SIGINT',
  () => {

    shutdown(
      'SIGINT'
    );

  }
);


// ======================================================
// INICIALIZAR VOBIXCHAT
// ======================================================

async function startVobixChat() {

  try {

    console.log(
      '=========================================='
    );

    console.log(
      ' VOBIXCHAT'
    );

    console.log(
      ' INICIANDO SERVIDOR'
    );

    console.log(
      '=========================================='
    );


    // ==================================================
    // INICIALIZAR / ACTUALIZAR BASE DE DATOS
    // ==================================================

    console.log(
      'VOBIXCHAT | INICIALIZANDO BASE DE DATOS...'
    );


    await initializeDatabase();


    console.log(
      'VOBIXCHAT | BASE DE DATOS LISTA'
    );


    // ==================================================
    // COMPROBAR CONEXIÓN POSTGRESQL
    // ==================================================

    await database.query(
      'SELECT 1'
    );


    console.log(
      'VOBIXCHAT | POSTGRESQL CONECTADO'
    );


    // ==================================================
    // PUERTO
    // ==================================================

    const port =
      Number(
        process.env.PORT ||
        config.PORT ||
        3000
      );


    // ==================================================
    // ESCUCHAR
    // ==================================================

    server.listen(
      port,
      '0.0.0.0',
      () => {

        console.log(
          '=========================================='
        );

        console.log(
          ` VOBIXCHAT ACTIVO EN PUERTO ${port}`
        );

        console.log(
          ` SOCKET.IO: ACTIVO`
        );

        console.log(
          ` CHAT PRIVADO 1X1: ACTIVO`
        );

        console.log(
          ` LLAMADAS: ACTIVAS`
        );

        console.log(
          ` VIDEOLLAMADAS: ACTIVAS`
        );

        console.log(
          ` MULTILLAMADA: ACTIVA`
        );

        console.log(
          ` PUSH: ${
            pushEnabled
              ? 'ACTIVO'
              : 'PENDIENTE DE VAPID'
          }`
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


    process.exit(1);

  }

}


// ======================================================
// ARRANCAR
// ======================================================

startVobixChat();


// ======================================================
// EXPORTS PARA PRUEBAS / OTROS MÓDULOS
// ======================================================

module.exports = {

  app,

  server,

  io,

  requireAuth,

  sendPushToUser

};


// ======================================================
// FIN server.js
// VOBIXCHAT
// ======================================================
