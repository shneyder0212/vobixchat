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

const vobixGuardian = require('./core/vobix-guardian');
const vobixEmergency = require('./core/vobix-emergency');
const vobixRescue = require('./core/vobix-rescue');
const vobixChildProtection = require('./core/vobix-child-protection');
const vobixSignSupport = require('./core/vobix-sign-support');
const vobixProtectedRoute = require('./core/vobix-protected-route');
const vobixFamilyRecovery = require('./core/vobix-family-recovery');
const { matchesPersistedMessage } = require('./core/message-intent');
const { normalizeCallId, matchesCallIntent } = require('./core/call-intent');
const { terminateCall } = require('./core/call-termination');

const packageMetadata =
  require('./package.json');

// Capa 2.1.1 — el secreto del SFU nunca se envía al móvil.
// Solo se usa aquí para generar permisos temporales de sala.
const jwt =
  require('jsonwebtoken');

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

const {
  getVobixLayers
} = require('./core/vobix-layers');

const {
  getCapabilityAccess,
  getPremiumCatalog,
  isConfigurableCapability
} = require('./core/vobix-premium');

const { containsSensitiveData, localPremiumHelp } = require('./core/premium-help');

const vobixLearn = require('./core/vobix-learn');
const { localTutorReply, tutorSystemPrompt } = require('./core/learning-tutor');
const { buildLessonMaterial } = require('./core/learning-content');
const { normalizeLearningPreferences } = require('./core/learning-preferences');

const {
  createMeetingCode,
  hashMeetingCode,
  normalizeMeetingCode,
  normalizeMeetingOptions
} = require('./core/vobix-meet');

const r2Storage = require('./core/r2-storage');

const premiumHelpRate = new Map();
const meetJoinRate = new Map();
const emergencyTriggerRate = new Map();
const learningTutorRate = new Map();
const familyRecoveryRate = new Map();
const SAFETY_CONSENT_VERSION = '2026-09-04.1';

function familyRecoveryRateLimit(req, res, action, limit, windowMs) {
  const fingerprint = crypto.createHash('sha256')
    .update(`${req.ip || req.socket?.remoteAddress || 'unknown'}|${req.get('user-agent') || 'unknown'}`)
    .digest('hex');
  const attempt = vobixFamilyRecovery.consumeAttempt(
    familyRecoveryRate,
    `${action}:${fingerprint}`,
    limit,
    windowMs
  );
  if (attempt.allowed) return true;
  res.set('Retry-After', String(Math.ceil(attempt.retryAfterMs / 1000)));
  res.status(429).json({ok:false,msg:'Demasiados intentos. Espere antes de volver a probar.'});
  return false;
}


// ======================================================
// WEB PUSH
// ======================================================

let webpush = null;

let firebaseAdmin = null;

let firebasePushEnabled = false;

try {

  webpush =
    require('web-push');

} catch (error) {

  console.warn(
    'VOBIXCHAT | web-push no disponible'
  );

}


// ======================================================
// FIREBASE CLOUD MESSAGING (APK ANDROID NATIVA)
// La clave privada se guarda exclusivamente en Render como
// FIREBASE_SERVICE_ACCOUNT_JSON (JSON o Base64), nunca en el ZIP.
// ======================================================

function getFirebaseServiceAccount() {

  const value = String(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 ||
    ''
  ).trim();

  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch (error) {
    try {
      return JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
    } catch (decodeError) {
      console.error('VOBIXCHAT | FIREBASE SERVICE ACCOUNT INVÁLIDA');
      return null;
    }
  }
}

try {
  firebaseAdmin = require('firebase-admin');
  const serviceAccount = getFirebaseServiceAccount();

  if (firebaseAdmin && serviceAccount) {
    if (serviceAccount.private_key) {
      serviceAccount.private_key = String(serviceAccount.private_key).replace(/\\n/g, '\n');
    }

    firebaseAdmin.initializeApp({
      credential: firebaseAdmin.credential.cert(serviceAccount)
    });

    firebasePushEnabled = true;
    console.log('VOBIXCHAT | FIREBASE CLOUD MESSAGING ACTIVADO');
  }
} catch (error) {
  console.error('VOBIXCHAT | FIREBASE CONFIG ERROR:', error.message);
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
        10 * 1024 * 1024,

      // Reduce CPU por compresión y permite recuperar conexiones móviles
      // breves sin reconstruir toda la sesión.
      perMessageDeflate: false,
      pingInterval: 25000,
      pingTimeout: 20000,
      connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000,
        skipMiddlewares: false
      }

    }
  );

server.keepAliveTimeout = 65000;
server.headersTimeout = 70000;
server.requestTimeout = 30000;
server.maxRequestsPerSocket = 1000;


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
    ),
    {
      // Las pantallas HTML cambian con frecuencia durante el desarrollo.
      // Evita que el navegador siga mostrando una versión vieja de inbox.html.
      setHeaders(res, filePath) {
        if (path.extname(filePath).toLowerCase() === '.html') {
          res.setHeader('Cache-Control', 'no-store, max-age=0');
        }
      }
    }
  )
);

// CAPA 4.1 — Los nuevos medios viven en R2 privado. Mantenemos exactamente
// la misma URL /uploads/chat/... para no romper mensajes ya enviados.
app.get('/uploads/chat/:filename', async (req, res, next) => {
  if (!r2Storage.isConfigured()) return next();

  try {
    const name = String(req.params.filename || '');
    if (!name || name.includes('/') || name.includes('..')) return res.sendStatus(400);

    const object = await r2Storage.getChatFile(`chat/${name}`);
    const stream = r2Storage.toNodeStream(object.Body);
    if (!stream) return res.sendStatus(404);

    if (object.ContentType) res.type(object.ContentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    stream.on('error', next);
    stream.pipe(res);
  } catch (error) {
    const code = error?.$metadata?.httpStatusCode;
    if (code === 404 || error?.name === 'NoSuchKey') return next();
    console.error('VOBIXCHAT R2 READ ERROR:', error.message);
    return res.sendStatus(503);
  }
});

// Archivos antiguos y la fase de transición se conservan localmente.
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

// Capa 3.3 — defensa prudente de registro.
// Se activa únicamente por variable de entorno al tener SMS real probado.
// Los contadores protegen contra abuso, no clasifican ni rechazan VoIP.
const registrationGuard = {
  sendsByPhone: new Map(),
  sendsByIp: new Map()
};

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || 'unknown';
}

function takeRegistrationSlot(store, key, limit, windowMs) {
  const now = Date.now();
  const previous = store.get(key) || [];
  const recent = previous.filter((time) => now - time < windowMs);

  if (recent.length >= limit) {
    store.set(key, recent);
    return false;
  }

  recent.push(now);
  store.set(key, recent);
  return true;
}

function registrationGuardAllows(req, phone) {
  if (!config.REGISTRATION_GUARD_ENABLED) return true;

  const windowMs = Math.max(60 * 1000, Number(config.REGISTRATION_GUARD_WINDOW_MS) || 0);
  const phoneLimit = Math.max(1, Number(config.REGISTRATION_SENDS_PER_PHONE) || 0);
  const ipLimit = Math.max(1, Number(config.REGISTRATION_SENDS_PER_IP) || 0);

  const phoneAllowed = takeRegistrationSlot(registrationGuard.sendsByPhone, phone, phoneLimit, windowMs);
  const ipAllowed = takeRegistrationSlot(registrationGuard.sendsByIp, getClientIp(req), ipLimit, windowMs);

  return phoneAllowed && ipAllowed;
}

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
      (user_id, token_hash, device_name, platform, created_at, last_used_at, expires_at, revoked, recognized_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW(), $5, FALSE, NOW())
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
      SELECT id, user_id, created_at, expires_at, recognized_at
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
    ,recognizedAt: row.recognized_at
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

  if (!registrationGuardAllows(req, phone)) {
    return res.status(429).json({
      ok: false,
      msg: 'Demasiadas solicitudes. Espera unos minutos e inténtalo de nuevo.',
      retryable: true
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

  if (!config.TEST_PIN) {
    return res.status(503).json({
      ok: false,
      msg: 'El PIN privado de pruebas no está configurado'
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
const learningLanguages = [
  { key:'english-us', language:'Inglés americano', icon:'🇺🇸', greeting:'Hello', country:'Estados Unidos' },
  { key:'english-uk', language:'Inglés británico', icon:'🇬🇧', greeting:'Hello', country:'Reino Unido' },
  { key:'spanish', language:'Español', icon:'🇪🇸', greeting:'Hola', country:'España' },
  { key:'french', language:'Francés', icon:'🇫🇷', greeting:'Bonjour', country:'Francia' },
  { key:'german', language:'Alemán', icon:'🇩🇪', greeting:'Hallo', country:'Alemania' },
  { key:'italian', language:'Italiano', icon:'🇮🇹', greeting:'Ciao', country:'Italia' }
];
const learningThemes = ['Presentarte con seguridad','Sonidos y pronunciación','Familia y personas','Rutinas diarias','Comida y compras','Direcciones y transporte','Tiempo y planes','Conversación real','Trabajo y estudio','Viajes','Salud y ayuda','Tecnología','Opiniones','Historias','Cultura','Negociación','Presentaciones','Entrevistas','Debate profesional','Dominio y certificación'];
const assessmentQuestions = (language, theme, phase) => {
  const greeting = language.greeting;
  const purpose = phase === 'final' ? 'final assessment' : 'mid-course assessment';
  const questions = [
    [`Choose the correct greeting in ${language.language}.`, [greeting, 'Goodbye', 'Please'], 0],
    ['Complete the sentence: “I ___ a student.”', ['am', 'is', 'are'], 0],
    ['Choose the correct sentence.', ['She is my teacher.', 'She are my teacher.', 'She am my teacher.'], 0],
    ['Which word is a pronoun?', ['They', 'University', 'Lesson'], 0],
    ['Complete: “We ___ from Spain.”', ['are', 'am', 'is'], 0],
    ['Choose the correct question.', ['What is your name?', 'What your name is?', 'What is name your?'], 0],
    ['Choose the opposite of “small”.', ['big', 'short', 'quiet'], 0],
    ['Complete: “He ___ English every day.”', ['studies', 'study', 'studying'], 0],
    ['Which sentence uses a capital letter correctly?', ['I live in Madrid.', 'i live in Madrid.', 'I live in madrid.'], 0],
    ['Choose the correct article: “___ apple”.', ['an', 'a', 'the'], 0],
    ['Complete: “There ___ two books on the table.”', ['are', 'is', 'am'], 0],
    ['Choose the correct response to “How are you?”', ['I am well, thank you.', 'My name is well.', 'I are fine.'], 0],
    ['Complete: “Can you ___ that again, please?”', ['say', 'says', 'said'], 0],
    ['Which word is a verb?', ['learn', 'lesson', 'student'], 0],
    ['Choose the correct time expression.', ['at 8 o’clock', 'in Monday', 'on the morning'], 0],
    ['Complete: “I have ___ brother.”', ['one', 'an', 'a'], 0],
    ['Choose the polite request.', ['Could you help me, please?', 'You help me now.', 'Help I, please.'], 0],
    ['Complete: “My class ___ at nine.”', ['starts', 'start', 'starting'], 0],
    ['Which sentence is in the present continuous?', ['She is reading.', 'She read yesterday.', 'She reads yesterday.'], 0],
    [`For this ${purpose}, choose the best learning action for “${theme}”.`, ['Practice, check feedback, and apply it.', 'Skip the task.', 'Guess without reading.'], 0]
  ];
  return questions.map(([prompt, options, answer], index) => ({ id:`${phase}-${index + 1}`, prompt, options, answer }));
};
const learningCatalog = learningLanguages.map(language => ({
  ...language,
  level:'20 niveles · 400 lecciones',
  levels:Array.from({length:20},(_,levelIndex)=>({
    number:levelIndex+1,
    name:levelIndex<10?'Fundamentos '+(levelIndex+1):'Profesional '+(levelIndex+1),
    lessons:Array.from({length:20},(_,lessonIndex)=>{
      const n=lessonIndex+1, key=`n${String(levelIndex+1).padStart(2,'0')}-l${String(n).padStart(2,'0')}`;
      const theme=learningThemes[(lessonIndex+levelIndex)%learningThemes.length];
      return {key,number:n,title:theme,objective:`Nivel ${levelIndex+1}: usar ${theme.toLowerCase()} en una situación real.`,task:`Crea una respuesta personal usando el vocabulario de la lección ${n}.`,practice:`Pronuncia: “${language.greeting}, I am ready to learn.” y escucha tu grabación.`,assessments:{checkpoint:{title:'Mid-course assessment · 20 questions',questions:assessmentQuestions(language,theme,'checkpoint')},final:{title:'Final assessment · 20 questions',questions:assessmentQuestions(language,theme,'final')}}};
    })
  }))
}));
const findLearningLesson=(courseKey,lessonKey)=>{
  const course=learningCatalog.find(c=>c.key===courseKey);
  if(!course) return null;
  for(const level of course.levels){ const lesson=level.lessons.find(l=>l.key===lessonKey); if(lesson) return {course,level,lesson}; }
  return null;
};

app.get('/api/learn/catalog', requireAuth, (req, res) => res.json({ok:true,courses:learningCatalog,requirements:{passingScore:80,levels:20,lessonsPerLevel:20,assessmentsPerLesson:2}}));

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
  const valid=Boolean(findLearningLesson(courseKey,lessonKey));
  if(!valid) return res.status(400).json({ok:false,msg:'Lección no válida'});
  try {
    const result=await database.query(`INSERT INTO learning_progress(user_id,course_key,lesson_key,completed,score,updated_at) VALUES($1,$2,$3,TRUE,$4,NOW()) ON CONFLICT(user_id,course_key,lesson_key) DO UPDATE SET completed=TRUE,score=EXCLUDED.score,updated_at=NOW() RETURNING course_key,lesson_key,completed,score,updated_at`,[req.vobixUser.id,courseKey,lessonKey,score]);
    res.json({ok:true,progress:result.rows[0]});
  } catch(error) { res.status(500).json({ok:false,msg:'No se pudo guardar tu progreso'}); }
});

app.post('/api/learn/assess', requireAuth, async (req,res) => {
  const courseKey=String(req.body.courseKey||'').trim();
  const lessonKey=String(req.body.lessonKey||'').trim();
  const kind=req.body.kind==='checkpoint'?'checkpoint':req.body.kind==='final'?'final':'';
  const answers=Array.isArray(req.body.answers)?req.body.answers:[];
  const found=findLearningLesson(courseKey,lessonKey);
  if(!found || !kind) return res.status(400).json({ok:false,msg:'Evaluación no válida'});
  const lessonNumber=(found.level.number-1)*20+found.lesson.number;
  if(lessonNumber>1){
    const previousNumber=lessonNumber-1; const previousLevel=Math.ceil(previousNumber/20); const previousLesson=((previousNumber-1)%20)+1;
    const previousKey=`n${String(previousLevel).padStart(2,'0')}-l${String(previousLesson).padStart(2,'0')}`;
    const prior=await database.query('SELECT completed FROM learning_progress WHERE user_id=$1 AND course_key=$2 AND lesson_key=$3',[req.vobixUser.id,courseKey,previousKey]);
    if(!prior.rows[0]?.completed) return res.status(403).json({ok:false,msg:'Completa la lección anterior para desbloquear esta.'});
  }
  if(kind==='final'){
    const checkpoint=await database.query('SELECT checkpoint_passed FROM learning_progress WHERE user_id=$1 AND course_key=$2 AND lesson_key=$3',[req.vobixUser.id,courseKey,lessonKey]);
    if(!checkpoint.rows[0]?.checkpoint_passed) return res.status(403).json({ok:false,msg:'Primero aprueba el control de mitad con 80%.'});
  }
  const questions=found.lesson.assessments[kind].questions;
  const score=Math.round(100*questions.reduce((total,q,index)=>total+(Number(answers[index])===q.answer?1:0),0)/questions.length);
  const passed=score>=80;
  try {
    await database.query('INSERT INTO learning_attempts(user_id,course_key,lesson_key,assessment_kind,score,answers) VALUES($1,$2,$3,$4,$5,$6)',[req.vobixUser.id,courseKey,lessonKey,kind,score,JSON.stringify(answers)]);
    const result=await database.query(`INSERT INTO learning_progress(user_id,course_key,lesson_key,completed,score,checkpoint_score,final_score,checkpoint_passed,final_passed,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
      ON CONFLICT(user_id,course_key,lesson_key) DO UPDATE SET
        checkpoint_score=CASE WHEN $10='checkpoint' THEN $6 ELSE learning_progress.checkpoint_score END,
        final_score=CASE WHEN $10='final' THEN $7 ELSE learning_progress.final_score END,
        checkpoint_passed=learning_progress.checkpoint_passed OR ($10='checkpoint' AND $8),
        final_passed=learning_progress.final_passed OR ($10='final' AND $9),
        completed=learning_progress.completed OR ($10='final' AND $9),
        score=GREATEST(COALESCE(learning_progress.score,0),$5),updated_at=NOW()
      RETURNING course_key,lesson_key,completed,checkpoint_passed,final_passed,checkpoint_score,final_score`,[req.vobixUser.id,courseKey,lessonKey,kind==='final'&&passed,score,kind==='checkpoint'?score:null,kind==='final'?score:null,kind==='checkpoint'&&passed,kind==='final'&&passed,kind]);
    res.json({ok:true,score,passed,kind,progress:result.rows[0]});
  } catch(error) { console.error('learn assess',error); res.status(500).json({ok:false,msg:'No se pudo guardar la evaluación'}); }
});

app.get('/api/learn/room/:courseKey', requireAuth, async (req,res)=>{
  const courseKey=String(req.params.courseKey||'');
  if(!learningCatalog.some(c=>c.key===courseKey)) return res.status(404).json({ok:false,msg:'Aula no encontrada'});
  try { const result=await database.query('SELECT body,updated_at FROM learning_room_notes WHERE user_id=$1 AND course_key=$2',[req.vobixUser.id,courseKey]); res.json({ok:true,note:result.rows[0]||{body:'',updated_at:null}}); }
  catch(error){res.status(500).json({ok:false,msg:'No se pudo abrir tu aula'});}
});

app.put('/api/learn/room/:courseKey', requireAuth, async (req,res)=>{
  const courseKey=String(req.params.courseKey||''); const body=String(req.body.body||'').trim();
  if(!learningCatalog.some(c=>c.key===courseKey)||body.length>3000) return res.status(400).json({ok:false,msg:'Nota no válida'});
  try { const result=await database.query(`INSERT INTO learning_room_notes(user_id,course_key,body,updated_at) VALUES($1,$2,$3,NOW()) ON CONFLICT(user_id,course_key) DO UPDATE SET body=EXCLUDED.body,updated_at=NOW() RETURNING body,updated_at`,[req.vobixUser.id,courseKey,body]);res.json({ok:true,note:result.rows[0]}); }
  catch(error){res.status(500).json({ok:false,msg:'No se pudo guardar tu nota'});}
});

// Capa 156 — API de aprendizaje progresivo. El catálogo es ligero y cada
// nivel se descarga únicamente cuando el estudiante lo abre.
app.get('/api/learn/v2/catalog', requireAuth, (req, res) => {
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json({
    ok:true,
    courses:vobixLearn.catalogSummary(),
    requirements:{
      levels:vobixLearn.LEVEL_COUNT,
      lessonsPerLevel:vobixLearn.LESSONS_PER_LEVEL,
      assessmentsPerLesson:vobixLearn.ASSESSMENT_TYPES.length,
      writtenAssessments:2,
      spokenAssessments:2,
      passingScore:vobixLearn.PASSING_SCORE,
      assessmentLanguage:'en'
    }
  });
});

app.get('/api/learn/v2/courses/:courseKey/levels/:levelNumber', requireAuth, (req, res) => {
  const level = vobixLearn.buildLevel(req.params.courseKey, req.params.levelNumber);
  if (!level) return res.status(404).json({ ok:false, code:'learning_level_not_found' });
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json({ ok:true, level });
});

app.get('/api/learn/v2/courses/:courseKey/levels/:levelNumber/lessons/:lessonNumber/content', requireAuth, (req, res) => {
  const course = vobixLearn.getCourse(req.params.courseKey);
  const lesson = vobixLearn.buildLesson(req.params.courseKey, req.params.levelNumber, req.params.lessonNumber);
  const content = buildLessonMaterial(course, lesson);
  if (!content) return res.status(404).json({ ok:false, code:'learning_content_not_found' });
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json({ ok:true, lesson, content });
});

app.get('/api/learn/v2/profile/:courseKey', requireAuth, async (req, res) => {
  const course = vobixLearn.getCourse(req.params.courseKey);
  if (!course) return res.status(404).json({ ok:false, code:'learning_course_not_found' });
  try {
    await database.query(
      `INSERT INTO learning_profiles (user_id, course_key)
       VALUES ($1, $2) ON CONFLICT (user_id, course_key) DO NOTHING`,
      [req.vobixUser.id, course.key]
    );
    const result = await database.query(
      `SELECT course_key, current_level, current_lesson, xp, streak_days,
              last_activity_on, review_queue, updated_at
       FROM learning_profiles WHERE user_id=$1 AND course_key=$2 LIMIT 1`,
      [req.vobixUser.id, course.key]
    );
    return res.json({ ok:true, profile:result.rows[0] });
  } catch (error) {
    console.error('VOBIX APRENDE | No se pudo cargar el perfil:', error.message);
    return res.status(500).json({ ok:false, code:'learning_profile_unavailable' });
  }
});

app.get('/api/learn/v2/preferences', requireAuth, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    await database.query(
      `INSERT INTO learning_preferences (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [req.vobixUser.id]
    );
    const result = await database.query(
      `SELECT theme, dark_mode AS "darkMode", high_contrast AS "highContrast",
              tutor_voice AS "tutorVoice", accent, voice_speed AS "voiceSpeed"
       FROM learning_preferences WHERE user_id=$1 LIMIT 1`,
      [req.vobixUser.id]
    );
    return res.json({ ok:true, preferences:result.rows[0] });
  } catch (error) {
    return res.status(500).json({ ok:false, code:'learning_preferences_unavailable' });
  }
});

app.put('/api/learn/v2/preferences', requireAuth, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const preferences = normalizeLearningPreferences(req.body);
  try {
    const result = await database.query(
      `INSERT INTO learning_preferences
         (user_id,theme,dark_mode,high_contrast,tutor_voice,accent,voice_speed,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         theme=EXCLUDED.theme, dark_mode=EXCLUDED.dark_mode,
         high_contrast=EXCLUDED.high_contrast, tutor_voice=EXCLUDED.tutor_voice,
         accent=EXCLUDED.accent, voice_speed=EXCLUDED.voice_speed, updated_at=NOW()
       RETURNING theme, dark_mode AS "darkMode", high_contrast AS "highContrast",
                 tutor_voice AS "tutorVoice", accent, voice_speed AS "voiceSpeed"`,
      [req.vobixUser.id, preferences.theme, preferences.darkMode, preferences.highContrast,
        preferences.tutorVoice, preferences.accent, preferences.voiceSpeed]
    );
    return res.json({ ok:true, saved:true, preferences:result.rows[0] });
  } catch (error) {
    return res.status(500).json({ ok:false, code:'learning_preferences_save_failed' });
  }
});

app.get('/api/learn/v2/resume/:courseKey', requireAuth, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const course = vobixLearn.getCourse(req.params.courseKey);
  if (!course) return res.status(404).json({ ok:false, code:'learning_course_not_found' });
  try {
    await database.query(
      `INSERT INTO learning_profiles (user_id, course_key)
       VALUES ($1,$2) ON CONFLICT (user_id,course_key) DO NOTHING`,
      [req.vobixUser.id, course.key]
    );
    const result = await database.query(
      `SELECT p.current_level, p.current_lesson, p.xp, p.streak_days,
              p.last_activity_on, p.review_queue,
              m.lesson_key, m.last_segment, m.session_state,
              m.written_1_passed, m.spoken_1_passed,
              m.written_2_passed, m.spoken_2_passed,
              m.final_score, m.final_passed, m.updated_at
       FROM learning_profiles p
       LEFT JOIN learning_lesson_mastery m
         ON m.user_id=p.user_id AND m.course_key=p.course_key
        AND m.lesson_key=('n' || LPAD(p.current_level::text,2,'0') || '-l' || LPAD(p.current_lesson::text,2,'0'))
       WHERE p.user_id=$1 AND p.course_key=$2 LIMIT 1`,
      [req.vobixUser.id, course.key]
    );
    return res.json({ ok:true, courseKey:course.key, resume:result.rows[0] });
  } catch (error) {
    console.error('VOBIX APRENDE | No se pudo recuperar el avance:', error.message);
    return res.status(500).json({ ok:false, code:'learning_resume_unavailable' });
  }
});

app.put('/api/learn/v2/position', requireAuth, async (req, res) => {
  const course = vobixLearn.getCourse(req.body?.courseKey);
  const levelNumber = Number.parseInt(req.body?.levelNumber, 10);
  const lessonNumber = Number.parseInt(req.body?.lessonNumber, 10);
  const segment = String(req.body?.segment || 'warm-up').trim().slice(0, 40);
  const validLesson = course && vobixLearn.buildLesson(course.key, levelNumber, lessonNumber);
  if (!validLesson || !['warm-up','vocabulary','grammar','verbs','listening','speaking','writing','review','final-exam'].includes(segment)) {
    return res.status(400).json({ ok:false, code:'invalid_learning_position' });
  }

  const ordinal = ((levelNumber - 1) * vobixLearn.LESSONS_PER_LEVEL) + lessonNumber;
  if (ordinal > 1) {
    const previousOrdinal = ordinal - 1;
    const previousLevel = Math.ceil(previousOrdinal / vobixLearn.LESSONS_PER_LEVEL);
    const previousLesson = ((previousOrdinal - 1) % vobixLearn.LESSONS_PER_LEVEL) + 1;
    const previousKey = vobixLearn.lessonKey(previousLevel, previousLesson);
    const gate = await database.query(
      `SELECT final_passed FROM learning_lesson_mastery
       WHERE user_id=$1 AND course_key=$2 AND lesson_key=$3 LIMIT 1`,
      [req.vobixUser.id, course.key, previousKey]
    );
    if (!gate.rows[0]?.final_passed) {
      return res.status(403).json({ ok:false, code:'previous_final_exam_required', previousLessonKey:previousKey });
    }
  }

  let client;
  try {
    client = await database.pool.connect();
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO learning_profiles (user_id,course_key,current_level,current_lesson,last_activity_on,updated_at)
       VALUES ($1,$2,$3,$4,CURRENT_DATE,NOW())
       ON CONFLICT (user_id,course_key) DO UPDATE SET
         current_level=EXCLUDED.current_level, current_lesson=EXCLUDED.current_lesson,
         last_activity_on=CURRENT_DATE, updated_at=NOW()`,
      [req.vobixUser.id, course.key, levelNumber, lessonNumber]
    );
    await client.query(
      `INSERT INTO learning_lesson_mastery (user_id,course_key,lesson_key,last_segment,session_state,updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (user_id,course_key,lesson_key) DO UPDATE SET
         last_segment=EXCLUDED.last_segment, session_state=EXCLUDED.session_state, updated_at=NOW()`,
      [req.vobixUser.id, course.key, validLesson.key, segment, JSON.stringify({savedAt:new Date().toISOString()})]
    );
    await client.query('COMMIT');
    return res.json({ ok:true, saved:true, courseKey:course.key, levelNumber, lessonNumber, segment });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(()=>{});
    return res.status(500).json({ ok:false, code:'learning_position_save_failed' });
  } finally {
    if (client) client.release();
  }
});

app.post('/api/learn/v2/tutor', requireAuth, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const course = vobixLearn.getCourse(req.body?.courseKey);
  const lesson = vobixLearn.buildLesson(req.body?.courseKey, req.body?.levelNumber, req.body?.lessonNumber);
  const question = String(req.body?.question || '').trim().slice(0, 800);
  if (!course || !lesson || !question) {
    return res.status(400).json({ ok:false, code:'invalid_tutor_request' });
  }
  if (containsSensitiveData(question)) {
    return res.status(400).json({ ok:false, code:'sensitive_data_rejected', msg:'No compartas contraseñas, códigos ni datos bancarios con el tutor' });
  }

  const userId = String(req.vobixUser.id);
  const now = Date.now();
  const attempts = (learningTutorRate.get(userId) || []).filter(at => now - at < 60000);
  if (attempts.length >= 30) return res.status(429).json({ ok:false, code:'tutor_rate_limited' });
  attempts.push(now);
  learningTutorRate.set(userId, attempts);

  const fallback = localTutorReply({course, lesson, question});
  const providerUrl = String(process.env.VOBIX_LEARN_AI_URL || process.env.VOBIX_AI_API_URL || '').trim();
  const providerKey = String(process.env.VOBIX_LEARN_AI_KEY || process.env.VOBIX_AI_API_KEY || '').trim();
  const providerModel = String(process.env.VOBIX_LEARN_AI_MODEL || process.env.VOBIX_AI_MODEL || '').trim();
  if (!providerUrl || !providerKey || !providerModel) {
    return res.json({ ok:true, answer:fallback, source:'local-tutor', level:lesson.cefr });
  }

  try {
    const response = await fetch(providerUrl, {
      method:'POST',
      headers:{'Content-Type':'application/json', Authorization:`Bearer ${providerKey}`},
      body:JSON.stringify({
        model:providerModel,
        temperature:0.2,
        max_tokens:320,
        messages:[
          {role:'system', content:tutorSystemPrompt(course, lesson)},
          {role:'user', content:question}
        ]
      }),
      signal:AbortSignal.timeout(9000)
    });
    if (!response.ok) throw new Error(`provider_${response.status}`);
    const data = await response.json();
    const answer = String(data?.choices?.[0]?.message?.content || '').trim().slice(0, 1600);
    return res.json({ ok:true, answer:answer || fallback, source:answer ? 'ai-tutor' : 'local-tutor', level:lesson.cefr });
  } catch (error) {
    console.warn('VOBIX APRENDE | Tutor externo no disponible:', error.message);
    return res.json({ ok:true, answer:fallback, source:'local-tutor', level:lesson.cefr });
  }
});

app.get('/api/learn/v2/rooms', requireAuth, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const result = await database.query(
      `SELECT r.id, r.course_key, r.title, r.max_participants, r.status,
              m.role, m.state, r.created_at
       FROM learning_room_members m
       JOIN learning_practice_rooms r ON r.id=m.room_id
       WHERE m.user_id=$1 AND m.state IN ('invited','active')
       ORDER BY r.updated_at DESC LIMIT 50`,
      [req.vobixUser.id]
    );
    return res.json({ ok:true, rooms:result.rows });
  } catch (error) {
    return res.status(500).json({ ok:false, code:'learning_rooms_unavailable' });
  }
});

app.post('/api/learn/v2/rooms', requireAuth, async (req, res) => {
  const course = vobixLearn.getCourse(req.body?.courseKey);
  const title = String(req.body?.title || 'Sala de práctica').trim().replace(/\s+/g, ' ').slice(0, 100);
  const maxParticipants = Math.max(2, Math.min(12, Number.parseInt(req.body?.maxParticipants, 10) || 6));
  if (!course || !title) return res.status(400).json({ ok:false, code:'invalid_learning_room' });
  let client;
  try {
    client = await database.pool.connect();
    await client.query('BEGIN');
    const roomResult = await client.query(
      `INSERT INTO learning_practice_rooms (owner_id, course_key, title, max_participants)
       VALUES ($1,$2,$3,$4)
       RETURNING id, course_key, title, max_participants, status, created_at`,
      [req.vobixUser.id, course.key, title, maxParticipants]
    );
    await client.query(
      `INSERT INTO learning_room_members (room_id,user_id,role,state,joined_at)
       VALUES ($1,$2,'owner','active',NOW())`,
      [roomResult.rows[0].id, req.vobixUser.id]
    );
    await client.query('COMMIT');
    return res.status(201).json({ ok:true, room:roomResult.rows[0] });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(()=>{});
    return res.status(500).json({ ok:false, code:'learning_room_create_failed' });
  } finally {
    if (client) client.release();
  }
});

app.post('/api/learn/v2/rooms/:roomId/invite', requireAuth, async (req, res) => {
  const roomId = String(req.params.roomId || '');
  const inviteeId = String(req.body?.userId || '');
  if (!/^[0-9a-f-]{36}$/i.test(roomId) || !/^[0-9a-f-]{36}$/i.test(inviteeId) || inviteeId === String(req.vobixUser.id)) {
    return res.status(400).json({ ok:false, code:'invalid_learning_invite' });
  }
  let client;
  try {
    client = await database.pool.connect();
    await client.query('BEGIN');
    const roomResult = await client.query(
      `SELECT id, course_key, max_participants FROM learning_practice_rooms
       WHERE id=$1 AND owner_id=$2 AND status='active' FOR UPDATE`,
      [roomId, req.vobixUser.id]
    );
    const room = roomResult.rows[0];
    if (!room) {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok:false, code:'learning_room_owner_required' });
    }
    const eligible = await client.query(
      `SELECT 1 FROM learning_profiles WHERE user_id=$1 AND course_key=$2 LIMIT 1`,
      [inviteeId, room.course_key]
    );
    if (!eligible.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok:false, code:'learner_not_in_course' });
    }
    const count = await client.query(
      `SELECT COUNT(*)::int AS total FROM learning_room_members
       WHERE room_id=$1 AND state IN ('invited','active')`,
      [roomId]
    );
    if (count.rows[0].total >= room.max_participants) {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok:false, code:'learning_room_full' });
    }
    await client.query(
      `INSERT INTO learning_room_members (room_id,user_id,role,state)
       VALUES ($1,$2,'learner','invited')
       ON CONFLICT (room_id,user_id) DO UPDATE SET state='invited', invited_at=NOW(), joined_at=NULL`,
      [roomId, inviteeId]
    );
    await client.query('COMMIT');
    return res.status(201).json({ ok:true, invited:true });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(()=>{});
    return res.status(500).json({ ok:false, code:'learning_invite_failed' });
  } finally {
    if (client) client.release();
  }
});

app.post('/api/learn/v2/rooms/:roomId/respond', requireAuth, async (req, res) => {
  const roomId = String(req.params.roomId || '');
  if (!/^[0-9a-f-]{36}$/i.test(roomId)) return res.status(400).json({ ok:false, code:'invalid_learning_room' });
  const state = req.body?.accept === true ? 'active' : 'declined';
  try {
    const result = await database.query(
      `UPDATE learning_room_members SET state=$3, joined_at=CASE WHEN $3='active' THEN NOW() ELSE NULL END
       WHERE room_id=$1 AND user_id=$2 AND state='invited'
       RETURNING room_id, role, state, joined_at`,
      [roomId, req.vobixUser.id, state]
    );
    if (!result.rows[0]) return res.status(404).json({ ok:false, code:'learning_invite_not_found' });
    return res.json({ ok:true, membership:result.rows[0] });
  } catch (error) {
    return res.status(500).json({ ok:false, code:'learning_invite_response_failed' });
  }
});


// ======================================================
// HEALTH CHECK
// ======================================================

// Capa 108 — sonda mínima para navegadores que no ofrecen Network
// Information API (especialmente Safari/iOS). No consulta la base de
// datos, no crea sesión y no devuelve información del usuario.
app.get('/api/network-probe', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(204).end();
});

app.get(
  '/api/health',
  async (req, res) => {

    res.setHeader(
      'Cache-Control',
      'no-store, max-age=0'
    );

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

        release: {
          version:
            packageMetadata.version,

          commit:
            String(process.env.RENDER_GIT_COMMIT || 'local')
              .slice(0, 12),

          environment:
            process.env.RENDER
              ? 'render'
              : 'local'
        },

        capabilities: {
          adaptiveNetwork:
            true,

          offlineOutbox:
            true,

          messageReceipts:
            true,

          receiptReconnectSync:
            true,

          turnRelayConfigured:
            Boolean(
              String(process.env.TURN_URL || '').trim() &&
              process.env.TURN_USERNAME &&
              process.env.TURN_CREDENTIAL
            ),

          androidCallPush:
            firebasePushEnabled,

          mediaStorageConfigured:
            r2Storage.isConfigured()
        },

        uptimeSeconds:
          Math.floor(process.uptime()),

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
            'disconnected',

          release: {
            version:
              packageMetadata.version,

            commit:
              String(process.env.RENDER_GIT_COMMIT || 'local')
                .slice(0, 12),

            environment:
              process.env.RENDER
                ? 'render'
                : 'local'
          },

          capabilities: {
            adaptiveNetwork:
              true,

            offlineOutbox:
              true,

            messageReceipts:
              true,

            receiptReconnectSync:
              true,

            turnRelayConfigured:
              Boolean(
                String(process.env.TURN_URL || '').trim() &&
                process.env.TURN_USERNAME &&
                process.env.TURN_CREDENTIAL
              ),

            androidCallPush:
              firebasePushEnabled,

            mediaStorageConfigured:
              r2Storage.isConfigured()
          }

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

const endedCalls =
  new Map();

function endActiveCall(callId, endedBy, reason) {
  return terminateCall({
    activeCalls,
    endedCalls,
    io,
    userRoom,
    callId,
    endedBy,
    reason
  });
}


// ======================================================
// CAPA 2.1 — SALA PRIVADA AMPLIABLE
//
// Una llamada nace desde un chat 1×1, pero puede invitar
// usuarios verificados hasta un máximo de seis personas
// en total. El límite se aplica en servidor: nunca se
// confía en un botón del navegador para controlar aforo.
// ======================================================

const MAX_CALL_PARTICIPANTS = 6;


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

          const rawClientMessageId = String(
            payload.clientMessageId ||
            payload.client_message_id ||
            ''
          ).trim();

          const clientMessageId = /^[A-Za-z0-9_-]{8,100}$/.test(rawClientMessageId)
            ? rawClientMessageId
            : null;


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


          if (!clientMessageId) {

            if (typeof callback === 'function') {
              callback({
                ok: false,
                code: 'client_message_id_required',
                msg: 'El mensaje necesita un identificador seguro'
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


          const participants =
            await getConversationParticipants(
              conversationId
            );


          for (const participant of participants) {

            if (String(participant.user_id) === String(userId)) {
              continue;
            }

            const childPolicy =
              await vobixChildProtection.communicationDecision(
                database,
                userId,
                participant.user_id
              );

            if (!childPolicy.allowed) {

              if (typeof callback === 'function') {
                callback({
                  ok: false,
                  msg:
                    'Mensaje no autorizado por la protección familiar'
                });
              }

              return;

            }

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
                client_message_id,
                created_at,
                updated_at
              )

              VALUES
              (
                $1,
                $2,
                'text',
                $3,
                $4,
                NOW(),
                NOW()
              )

              ON CONFLICT (sender_user_id, client_message_id)
              WHERE client_message_id IS NOT NULL
              DO UPDATE SET client_message_id = EXCLUDED.client_message_id

              RETURNING
                id,
                conversation_id,
                sender_user_id,
                message_type,
                content,
                client_message_id,
                reply_to_message_id,
                edited,
                deleted,
                created_at,
                updated_at,
                (xmax = 0) AS inserted
              `,
              [
                conversationId,
                userId,
                text,
                clientMessageId
              ]
            );


          const row =
            result.rows[0];

          if (!matchesPersistedMessage(row, {
            conversationId,
            content:text,
            messageType:'text'
          })) {

            if (typeof callback === 'function') {
              callback({
                ok:false,
                code:'client_message_id_conflict',
                msg:'El identificador ya pertenece a otro mensaje'
              });
            }

            return;

          }

          const inserted = row.inserted !== false;


          // ==============================================
          // ACTUALIZAR HISTORIAL
          // ==============================================

          if (inserted) {
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
          }


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

            clientMessageId:
              row.client_message_id,

            client_message_id:
              row.client_message_id,

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


          if (!inserted) {

            if (typeof callback === 'function') {
              callback({
                ok: true,
                duplicate: true,
                message
              });
            }

            return;

          }


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
              body: String(text).startsWith('VOBIX-E2E-1:') ? '🔒 Mensaje cifrado' : String(text).slice(0, 180),
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

              duplicate: false,

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

    // Capa 113 — recibos por mensaje. Se valida que el usuario pertenece
    // a la conversación y que el mensaje fue enviado por la otra persona.
    const receiptRate = { startedAt: Date.now(), count: 0 };
    const receiptUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    async function saveMessageReceipt(payload = {}, receiptType = 'delivered') {
      const conversationId = String(payload.conversationId || payload.conversation_id || '').trim();
      const messageId = String(payload.messageId || payload.message_id || payload.id || '').trim();

      const now = Date.now();
      if (now - receiptRate.startedAt >= 60000) {
        receiptRate.startedAt = now;
        receiptRate.count = 0;
      }
      receiptRate.count += 1;

      if (receiptRate.count > 240) return false;
      if (!receiptUuidPattern.test(conversationId) || !receiptUuidPattern.test(messageId)) return false;
      if (!['delivered', 'read'].includes(receiptType)) return false;
      if (!(await socketCanAccessConversation(conversationId, userId))) return false;

      const messageResult = await database.query(
        `SELECT sender_user_id
         FROM messages
         WHERE id=$1 AND conversation_id=$2 AND sender_user_id<>$3
         LIMIT 1`,
        [messageId, conversationId, userId]
      );
      const senderUserId = messageResult.rows[0]?.sender_user_id;
      if (!senderUserId) return false;

      const isRead = receiptType === 'read';
      const receiptResult = await database.query(
        `INSERT INTO message_receipts(message_id,user_id,delivered_at,read_at,created_at)
         VALUES($1,$2,NOW(),CASE WHEN $3 THEN NOW() ELSE NULL END,NOW())
         ON CONFLICT(message_id,user_id) DO UPDATE SET
           delivered_at=COALESCE(message_receipts.delivered_at,NOW()),
           read_at=CASE WHEN $3 THEN COALESCE(message_receipts.read_at,NOW()) ELSE message_receipts.read_at END
         RETURNING delivered_at,read_at`,
        [messageId, userId, isRead]
      );

      const receipt = receiptResult.rows[0] || {};
      const eventPayload = {
        conversationId,
        messageId,
        userId,
        deliveredAt: receipt.delivered_at || null,
        readAt: receipt.read_at || null
      };

      io.to(`user:${String(senderUserId)}`).emit(`chat:${receiptType}`, eventPayload);
      io.to(`user:${String(senderUserId)}`).emit(`message:${receiptType}`, eventPayload);
      return true;
    }

    async function saveMessageReceiptBatch(payload = {}) {
      const conversationId = String(payload.conversationId || payload.conversation_id || '').trim();
      const receiptType = String(payload.type || '').trim().toLowerCase();
      const messageIds = [...new Set(
        (Array.isArray(payload.messageIds) ? payload.messageIds : [])
          .map(value => String(value || '').trim())
          .filter(value => receiptUuidPattern.test(value))
      )].slice(0, 100);

      const now = Date.now();
      if (now - receiptRate.startedAt >= 60000) {
        receiptRate.startedAt = now;
        receiptRate.count = 0;
      }
      receiptRate.count += 1;

      if (receiptRate.count > 240) return [];
      if (!receiptUuidPattern.test(conversationId) || !messageIds.length) return [];
      if (!['delivered', 'read'].includes(receiptType)) return [];

      const isRead = receiptType === 'read';
      const result = await database.query(
        `WITH allowed_messages AS (
           SELECT m.id AS message_id, m.sender_user_id
           FROM messages m
           WHERE m.conversation_id=$1
             AND m.id=ANY($3::uuid[])
             AND m.sender_user_id<>$2
             AND EXISTS (
               SELECT 1 FROM conversation_participants cp
               WHERE cp.conversation_id=$1 AND cp.user_id=$2
             )
         ), saved AS (
           INSERT INTO message_receipts(message_id,user_id,delivered_at,read_at,created_at)
           SELECT message_id,$2,NOW(),CASE WHEN $4 THEN NOW() ELSE NULL END,NOW()
           FROM allowed_messages
           ON CONFLICT(message_id,user_id) DO UPDATE SET
             delivered_at=COALESCE(message_receipts.delivered_at,NOW()),
             read_at=CASE WHEN $4 THEN COALESCE(message_receipts.read_at,NOW()) ELSE message_receipts.read_at END
           RETURNING message_id,delivered_at,read_at
         )
         SELECT saved.message_id,saved.delivered_at,saved.read_at,allowed_messages.sender_user_id
         FROM saved
         JOIN allowed_messages USING(message_id)`,
        [conversationId, userId, messageIds, isRead]
      );

      for (const row of result.rows) {
        const eventPayload = {
          conversationId,
          messageId: row.message_id,
          userId,
          deliveredAt: row.delivered_at || null,
          readAt: row.read_at || null
        };
        io.to(userRoom(row.sender_user_id)).emit(`chat:${receiptType}`, eventPayload);
        io.to(userRoom(row.sender_user_id)).emit(`message:${receiptType}`, eventPayload);
      }

      return result.rows;
    }

    socket.on('chat:receipts', async (payload, callback) => {
      try {
        const saved = await saveMessageReceiptBatch(payload);
        if (typeof callback === 'function') callback({ ok:true, saved:saved.length });
      } catch (error) {
        console.error('VOBIXCHAT BATCH RECEIPT ERROR:', error.message);
        if (typeof callback === 'function') callback({ ok:false });
      }
    });

    socket.on('chat:delivered', async (payload, callback) => {
      try {
        const saved = await saveMessageReceipt(payload, 'delivered');
        if (typeof callback === 'function') callback({ ok:true, saved });
      } catch (error) {
        console.error('VOBIXCHAT DELIVERED RECEIPT ERROR:', error.message);
        if (typeof callback === 'function') callback({ ok:false });
      }
    });

    socket.on('chat:read', async (payload, callback) => {
      try {
        const saved = await saveMessageReceipt(payload, 'read');
        if (typeof callback === 'function') callback({ ok:true, saved });
      } catch (error) {
        console.error('VOBIXCHAT READ RECEIPT ERROR:', error.message);
        if (typeof callback === 'function') callback({ ok:false });
      }
    });

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

            group: true,

            members:
              new Set([
                String(userId)
              ]),

            expelled:
              new Set(),

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

          for (const participant of otherParticipants) {
            call.members.add(String(participant.user_id));
          }


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


          // La sala privada ampliable admite como máximo seis
          // participantes activos. Se comprueba otra vez al aceptar
          // para evitar carreras entre varias invitaciones simultáneas.
          if (
            !call.participants.has(String(userId)) &&
            call.participants.size >= MAX_CALL_PARTICIPANTS
          ) {

            call.invited.delete(String(userId));

            if (typeof callback === 'function') {
              callback({
                ok: false,
                msg: `La sala ya alcanzó el máximo de ${MAX_CALL_PARTICIPANTS} personas`
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


          // Contamos participantes e invitaciones pendientes. Así no
          // se puede enviar una séptima invitación mientras otras seis
          // personas están aceptando la misma sala.
          const reservedSeats =
            call.participants.size +
            call.invited.size;

          if (reservedSeats >= MAX_CALL_PARTICIPANTS) {

            if (typeof callback === 'function') {
              callback({
                ok: false,
                msg: `La sala admite un máximo de ${MAX_CALL_PARTICIPANTS} personas`
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

          call.group = true;
          call.members = call.members || new Set([
            String(call.callerId),
            ...Array.from(call.participants || []),
            ...Array.from(call.invited || [])
          ]);
          call.expelled = call.expelled || new Set();
          call.invited.add(targetUserId);
          call.members.add(targetUserId);
          call.expelled.delete(targetUserId);


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
    // CAPA 130 — FINALIZACIÓN SINCRONIZADA DE LLAMADAS
    // ==================================================

    socket.on('call:end', async (payload = {}, callback) => {
      try {
        const callId = normalizeCallId(payload.callId);
        const call = callId ? activeCalls.get(callId) : null;
        const currentUserKey = String(userId);
        const allowed = call && (
          call.participants.has(currentUserKey) ||
          call.invited.has(currentUserKey) ||
          (call.group && call.members?.has(currentUserKey))
        );

        if (!allowed) {
          if (typeof callback === 'function') callback({
            ok: true,
            ended: false,
            code: callId && endedCalls.has(callId) ? 'call_already_ended' : 'call_not_found'
          });
          return;
        }

        if (call.group) {
          call.participants.delete(currentUserKey);
          call.invited.delete(currentUserKey);
          await socket.leave(callRoom(callId));
          if (call.participants.size === 0) {
            const result = endActiveCall(callId, userId, 'group-empty');
            if (typeof callback === 'function') callback({
              ok:true,
              ended:result.ended,
              code:result.code,
              callId
            });
            return;
          }
          io.to(callRoom(callId)).emit('call:user-left', {
            callId,
            conversationId: call.conversationId,
            userId,
            canRejoin: true,
            participants: Array.from(call.participants)
          });
          io.to(userRoom(userId)).emit('call:rejoin-available', {
            callId,
            conversationId: call.conversationId,
            type: call.type,
            participants: Array.from(call.participants)
          });
          if (typeof callback === 'function') callback({
            ok: true,
            ended: false,
            code: 'group_call_left',
            canRejoin: true,
            callId
          });
          return;
        }

        const result = endActiveCall(callId, userId, payload.reason || 'ended');
        if (typeof callback === 'function') callback({
          ok: true,
          ended: result.ended,
          code: result.code,
          callId,
          reason: result.payload?.reason,
          endedBy: result.payload?.endedBy
        });
      } catch (error) {
        console.error('VOBIXCHAT CALL END ERROR:', error);
        if (typeof callback === 'function') callback({ ok:false });
      }
    });

    socket.on('call:rejoin', async (payload = {}, callback) => {
      try {
        const callId = normalizeCallId(payload.callId);
        const call = callId ? activeCalls.get(callId) : null;
        const currentUserKey = String(userId);
        if (!call || !call.group) {
          if (typeof callback === 'function') callback({ ok:false, code:'call_not_found' });
          return;
        }
        if (call.expelled?.has(currentUserKey) || !call.members?.has(currentUserKey)) {
          if (typeof callback === 'function') callback({ ok:false, code:'call_rejoin_forbidden' });
          return;
        }
        call.rejoining = call.rejoining || new Set();
        if (call.rejoining.has(currentUserKey)) {
          if (typeof callback === 'function') callback({ ok:false, code:'call_rejoin_in_progress' });
          return;
        }
        call.rejoining.add(currentUserKey);
        call.participants.add(currentUserKey);
        call.invited.delete(currentUserKey);
        await socket.join(callRoom(callId));
        const participants = Array.from(call.participants);
        io.to(callRoom(callId)).emit('call:participant-rejoined', {
          callId,
          conversationId: call.conversationId,
          userId,
          type: call.type,
          participants
        });
        if (typeof callback === 'function') callback({
          ok:true,
          callId,
          conversationId:call.conversationId,
          type:call.type,
          participants
        });
        call.rejoining.delete(currentUserKey);
      } catch (error) {
        console.error('VOBIXCHAT CALL REJOIN ERROR:', error);
        if (typeof callback === 'function') callback({ ok:false, code:'call_rejoin_failed' });
      }
    });

    socket.on('call:remove-user', async (payload = {}, callback) => {
      const callId = normalizeCallId(payload.callId);
      const targetUserId = String(payload.userId || payload.targetUserId || '').trim();
      const call = callId ? activeCalls.get(callId) : null;
      if (!call?.group || String(call.callerId) !== String(userId) || !targetUserId) {
        if (typeof callback === 'function') callback({ ok:false, code:'call_remove_forbidden' });
        return;
      }
      call.members.delete(targetUserId);
      call.participants.delete(targetUserId);
      call.invited.delete(targetUserId);
      call.expelled = call.expelled || new Set();
      call.expelled.add(targetUserId);
      io.to(callRoom(callId)).emit('call:participant-removed', {
        callId,
        conversationId:call.conversationId,
        userId:targetUserId,
        participants:Array.from(call.participants)
      });
      io.to(userRoom(targetUserId)).emit('call:removed', {
        callId,
        conversationId:call.conversationId,
        reason:'removed'
      });
      if (typeof callback === 'function') callback({ ok:true, callId, userId:targetUserId });
    });

    // ==================================================
    // TERMINAR / SALIR DE LLAMADA (LEGACY)
    // ==================================================

    socket.on(
      'call:end:legacy',
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

    // Señalización dirigida para la malla de llamadas ampliables. Cada par
    // negocia su propia conexión WebRTC; una oferta o candidato nunca se
    // difunde a participantes que no sean su destinatario.
    socket.on('call:peer-offer', async (payload = {}, callback) => {
      const callId = normalizeCallId(payload.callId);
      const targetUserId = String(payload.targetUserId || '').trim();
      const call = callId ? activeCalls.get(callId) : null;
      const currentUserKey = String(userId);
      if (!call?.group || !targetUserId || !payload.offer ||
          !call.participants.has(currentUserKey) ||
          (!call.members?.has(targetUserId) && !call.invited.has(targetUserId))) {
        if (typeof callback === 'function') callback({ok:false, code:'call_peer_forbidden'});
        return;
      }
      io.to(userRoom(targetUserId)).emit('call:peer-offer', {
        callId,
        conversationId:call.conversationId,
        type:call.type,
        offer:payload.offer,
        fromUserId:userId,
        group:true,
        caller:call.caller
      });
      if (typeof callback === 'function') callback({ok:true});
    });

    socket.on('call:peer-answer', async (payload = {}, callback) => {
      const callId = normalizeCallId(payload.callId);
      const targetUserId = String(payload.targetUserId || '').trim();
      const call = callId ? activeCalls.get(callId) : null;
      const currentUserKey = String(userId);
      const canJoin = call && (
        call.participants.has(currentUserKey) ||
        call.invited.has(currentUserKey) ||
        call.members?.has(currentUserKey)
      );
      if (!call?.group || !targetUserId || !payload.answer || !canJoin ||
          call.expelled?.has(currentUserKey) || !call.participants.has(targetUserId)) {
        if (typeof callback === 'function') callback({ok:false, code:'call_peer_forbidden'});
        return;
      }
      if (!call.participants.has(currentUserKey) && call.participants.size >= MAX_CALL_PARTICIPANTS) {
        if (typeof callback === 'function') callback({ok:false, code:'call_full'});
        return;
      }
      call.participants.add(currentUserKey);
      call.invited.delete(currentUserKey);
      await socket.join(callRoom(callId));
      io.to(userRoom(targetUserId)).emit('call:peer-answer', {
        callId,
        answer:payload.answer,
        fromUserId:userId
      });
      io.to(callRoom(callId)).emit('call:participant-joined', {
        callId,
        userId,
        participants:Array.from(call.participants)
      });
      if (typeof callback === 'function') callback({ok:true});
    });

    socket.on('call:peer-ice', async (payload = {}, callback) => {
      const callId = normalizeCallId(payload.callId);
      const targetUserId = String(payload.targetUserId || '').trim();
      const call = callId ? activeCalls.get(callId) : null;
      const currentUserKey = String(userId);
      let candidateSize = Infinity;
      try { candidateSize = Buffer.byteLength(JSON.stringify(payload.candidate), 'utf8'); } catch (_) {}
      const senderAllowed = call && (
        call.participants.has(currentUserKey) ||
        call.invited.has(currentUserKey) ||
        call.members?.has(currentUserKey)
      );
      if (!call?.group || !targetUserId || !payload.candidate || candidateSize > 8192 ||
          !senderAllowed || call.expelled?.has(currentUserKey) ||
          (!call.participants.has(targetUserId) && !call.invited.has(targetUserId))) {
        if (typeof callback === 'function') callback({ok:false, code:'call_peer_forbidden'});
        return;
      }
      io.to(userRoom(targetUserId)).emit('call:peer-ice', {
        callId,
        candidate:payload.candidate,
        fromUserId:userId
      });
      if (typeof callback === 'function') callback({ok:true});
    });


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
        const callId = normalizeCallId(payload.callId || crypto.randomBytes(18).toString('hex'));
        const type = String(payload.type || 'audio').toLowerCase() === 'video' ? 'video' : 'audio';
        const offer = payload.offer || null;

        if (!conversationId || !callId || !offer) {
          if (typeof callback === 'function') callback({ ok:false, msg:'Oferta de llamada incompleta' });
          return;
        }

        if (endedCalls.has(callId)) {
          if (typeof callback === 'function') callback({ ok:false, code:'call_already_ended', msg:'La llamada ya terminó' });
          return;
        }

        const allowed = await socketCanAccessConversation(conversationId, userId);
        if (!allowed) {
          if (typeof callback === 'function') callback({ ok:false, msg:'No tienes acceso a esta conversación' });
          return;
        }

        const participants = await getConversationParticipants(conversationId);
        const targets = participants.filter(p => String(p.user_id) !== String(userId));
        for (const target of targets) {
          const childPolicy = await vobixChildProtection.communicationDecision(database,userId,target.user_id);
          if (!childPolicy.allowed) {
            if (typeof callback === 'function') callback({ok:false,msg:childPolicy.reason==='outside_schedule'
              ? 'La llamada no está disponible en este horario' : 'Contacto no autorizado'});
            return;
          }
        }
        if (!targets.length) {
          if (typeof callback === 'function') callback({ ok:false, msg:'No hay destinatario' });
          return;
        }

        const existingCall = activeCalls.get(callId);
        if (existingCall && !matchesCallIntent(existingCall, { callerId:userId, conversationId, type })) {
          if (existingCall.group && existingCall.members?.has(String(userId)) && !existingCall.expelled?.has(String(userId))) {
            existingCall.offer = offer;
            existingCall.type = type;
            existingCall.pendingIce = existingCall.pendingIce || [];
            await socket.join(callRoom(callId));
            for (const targetUserId of existingCall.participants) {
              if (String(targetUserId) === String(userId)) continue;
              io.to(userRoom(targetUserId)).emit('call:rejoin-offer', {
                callId,
                conversationId,
                type,
                offer,
                fromUserId:userId
              });
            }
            if (typeof callback === 'function') callback({ ok:true, callId, rejoin:true });
            return;
          }
          if (typeof callback === 'function') callback({ ok:false, code:'call_id_conflict', msg:'El identificador pertenece a otra llamada' });
          return;
        }

        const call = existingCall || {
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

        // Registrar y unir al llamante ANTES de enviar notificaciones.
        // Si no, los candidatos ICE que genera el móvil rápidamente podían
        // perderse y dejar vídeo negro o audio sin conexión.
        activeCalls.set(callId, call);
        await socket.join(callRoom(callId));

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
        if (typeof callback === 'function') callback({
          ok:true,
          callId,
          conversationId,
          type,
          recipientOnline:targets.some(target => isUserOnline(target.user_id)),
          notificationQueued:(pushEnabled || firebasePushEnabled) && targets.length > 0
        });
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
          if (typeof callback === 'function') callback({ ok:false, code:endedCalls.has(callId) ? 'call_already_ended' : 'call_not_found' });
          return;
        }

        const currentUserKey = String(userId);
        if (!call.participants.has(currentUserKey) && !call.invited.has(currentUserKey)) {
          if (typeof callback === 'function') callback({ ok:false, msg:'No estás invitado a esta llamada' });
          return;
        }

        // Capa 129 — el primer socket que llega gana; no hay await entre
        // comprobar y registrar para que respuestas simultáneas no se intercalen.
        if (call.answeredSocketId || call.answeredBy) {
          if (!call.group) {
            if (typeof callback === 'function') callback({
              ok:false,
              code:'call_already_answered',
              answeredSocketId:call.answeredSocketId || null,
              msg:'La llamada ya fue atendida'
            });
            return;
          }
        }
        if (!call.group) {
          call.answeredBy = currentUserKey;
          call.answeredSocketId = socket.id;
          call.acceptedAt = call.acceptedAt || Date.now();
        }

        call.participants.add(currentUserKey);
        call.invited.delete(currentUserKey);
        await socket.join(callRoom(callId));

        io.to(userRoom(userId)).emit('call:accepted-device', {
          callId,
          conversationId:call.conversationId,
          answeredSocketId:socket.id
        });

        const targetUserIds = call.group
          ? Array.from(call.participants).filter(id => String(id) !== String(userId))
          : [String(call.callerId) === String(userId)
              ? Array.from(call.participants).find(id => String(id) !== String(userId))
              : String(call.callerId)];

        for (const targetUserId of targetUserIds.filter(Boolean)) {
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
        const callId = normalizeCallId(payload.callId);
        const candidate = payload.candidate || null;
        const call = callId ? activeCalls.get(callId) : null;
        if (!call || !candidate) {
          if (typeof callback === 'function') callback({ ok:false, code:callId && endedCalls.has(callId) ? 'call_already_ended' : 'call_not_found' });
          return;
        }

        const currentUserKey = String(userId);
        const allowed = call.participants.has(currentUserKey) || call.invited.has(currentUserKey);
        let candidateSize = Infinity;
        try { candidateSize = Buffer.byteLength(JSON.stringify(candidate), 'utf8'); } catch (_) {}
        if (!allowed || candidateSize > 8192) {
          if (typeof callback === 'function') callback({ ok:false, code:allowed ? 'ice_candidate_too_large' : 'call_access_denied' });
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
            callback({ ok:false, code:endedCalls.has(callId) ? 'call_already_ended' : 'call_not_found', msg:'La llamada ya no está disponible' });
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

        if (call.answeredSocketId || call.answeredBy) {
          io.to(userRoom(userId)).emit('call:accepted-device', {
            callId,
            conversationId:call.conversationId,
            answeredSocketId:call.answeredSocketId || null
          });
          if (typeof callback === 'function') callback({
            ok:false,
            code:'call_already_answered',
            answeredSocketId:call.answeredSocketId || null,
            msg:'La llamada ya fue atendida'
          });
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

    // Capa 145 — una persona que estaba sin conexión no pudo recibir
    // call:offer por Socket.IO. Al reconectar puede recuperar de forma
    // autenticada la invitación pendiente y los candidatos ICE guardados.
    socket.on('call:pending', async (_payload = {}, callback) => {
      try {
        const currentUserKey = String(userId);
        const rejoinable = Array.from(activeCalls.values())
          .filter(call =>
            call?.group &&
            call.members?.has(currentUserKey) &&
            !call.participants?.has(currentUserKey) &&
            !call.expelled?.has(currentUserKey) &&
            call.participants?.size > 0
          )
          .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0))[0];

        if (rejoinable) {
          if (typeof callback === 'function') callback({
            ok:true,
            pending:true,
            rejoin:true,
            callId:rejoinable.callId || rejoinable.id,
            conversationId:rejoinable.conversationId,
            type:rejoinable.type,
            participants:Array.from(rejoinable.participants)
          });
          return;
        }
        const pending = Array.from(activeCalls.values())
          .filter(call =>
            call?.offer &&
            call.invited?.has(currentUserKey) &&
            !call.answeredSocketId &&
            !call.answeredBy
          )
          .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0))[0];

        if (!pending) {
          if (typeof callback === 'function') callback({ ok:true, pending:false });
          return;
        }

        if (typeof callback === 'function') {
          callback({
            ok:true,
            pending:true,
            callId:pending.callId || pending.id,
            conversationId:pending.conversationId,
            type:pending.type,
            offer:pending.offer,
            caller:pending.caller,
            candidates:(pending.pendingIce || [])
              .filter(item => String(item.fromUserId) !== currentUserKey)
              .map(item => item.candidate)
          });
        }
      } catch (error) {
        console.error('VOBIXCHAT PENDING CALL ERROR:', error);
        if (typeof callback === 'function') callback({ ok:false, msg:'No se pudo recuperar la llamada pendiente' });
      }
    });

    socket.on('call:captions-consent', async (payload = {}, callback) => {
      try {
        const callId = String(payload.callId || payload.call_id || '').trim();
        const call = activeCalls.get(callId);
        const currentUserKey = String(userId);

        if (!call || !call.participants.has(currentUserKey)) {
          if (typeof callback === 'function') {
            callback({ ok:false, msg:'No participas en esta llamada' });
          }
          return;
        }

        call.captionConsents = call.captionConsents || new Set();
        if (payload.accepted === true) {
          call.captionConsents.add(currentUserKey);
        } else {
          call.captionConsents.delete(currentUserKey);
        }

        const allConsented =
          call.participants.size >= 2 &&
          Array.from(call.participants).every(id => call.captionConsents.has(String(id)));

        const consentState = {
          callId,
          conversationId:call.conversationId,
          userId,
          accepted:payload.accepted === true,
          allConsented
        };

        io.to(callRoom(callId)).emit('call:captions-consent', consentState);
        if (typeof callback === 'function') callback({ ok:true, allConsented });
      } catch (error) {
        console.error('VOBIXCHAT CAPTIONS CONSENT ERROR:', error);
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


          if (call.group) {
            call.participants.delete(userKey);
            call.invited.delete(userKey);
            if (call.participants.size === 0) {
              endActiveCall(callId, userId, 'group-empty');
              continue;
            }
            io.to(callRoom(callId)).emit('call:user-left', {
              callId,
              conversationId: call.conversationId,
              userId,
              disconnected: true,
              canRejoin: true,
              participants: Array.from(call.participants)
            });
            continue;
          }

          endActiveCall(
            callId,
            userId,
            String(call.callerId) === userKey ? 'caller-disconnected' : 'disconnected'
          );

          continue;


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

        endActiveCall(callId, call.endedBy || null, 'expired');
        continue;

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
             u.id, u.username, u.vobix_id, u.avatar_url, u.online, u.last_seen
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

    const childPolicy = addresseeId && addresseeId !== requesterId
      ? await vobixChildProtection.communicationDecision(database,requesterId,addresseeId)
      : {allowed:true};
    if (!childPolicy.allowed) return res.status(403).json({ok:false,msg:'Contacto no autorizado por la protección familiar'});

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
    const pending = await database.query(
      `SELECT id,requester_id,addressee_id,status
       FROM friendships
       WHERE id=$1 AND addressee_id=$2 AND status='pending'
       LIMIT 1`,
      [req.params.id, req.vobixUser.id]
    );

    if (!pending.rows.length) {
      return res.status(404).json({ ok:false, msg:'Solicitud no encontrada' });
    }

    const friendship = pending.rows[0];
    const childPolicy = await vobixChildProtection.communicationDecision(
      database,
      friendship.requester_id,
      friendship.addressee_id
    );

    if (!childPolicy.allowed) {
      return res.status(403).json({
        ok:false,
        msg:'Contacto no autorizado por la protección familiar'
      });
    }

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
// CAPA 166 — VOBIX GUARDIÁN FAMILIAR
// ======================================================

app.get('/api/guardian', requireAuth, async (req, res) => {
  try {
    const result = await database.query(
      `SELECT g.id, g.status, g.created_at, g.updated_at,
              CASE WHEN g.protected_user_id=$1 THEN 'protected' ELSE 'guardian' END AS role,
              u.id AS other_user_id, u.username AS other_username,
              u.vobix_id AS other_vobix_id, u.avatar_url AS other_avatar_url
       FROM guardian_relationships g
       JOIN users u ON u.id=CASE WHEN g.protected_user_id=$1 THEN g.guardian_user_id ELSE g.protected_user_id END
       WHERE g.protected_user_id=$1 OR g.guardian_user_id=$1
       ORDER BY g.updated_at DESC`,
      [req.vobixUser.id]
    );
    return res.json({ ok:true, relationships:result.rows });
  } catch (error) {
    console.error('VOBIX GUARDIAN LIST ERROR:', error);
    return res.status(500).json({ ok:false, msg:'No se pudieron cargar los guardianes' });
  }
});

app.post('/api/guardian/invite', requireAuth, async (req, res) => {
  const protectedUserId = String(req.vobixUser.id);
  const guardianUserId = String(req.body?.guardianUserId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(guardianUserId) || guardianUserId === protectedUserId) {
    return res.status(400).json({ ok:false, msg:'Familiar no válido' });
  }
  try {
    const friendship = await database.query(
      `SELECT 1 FROM friendships WHERE status='accepted'
       AND ((requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)) LIMIT 1`,
      [protectedUserId, guardianUserId]
    );
    if (!friendship.rows.length) {
      return res.status(403).json({ ok:false, msg:'El guardián debe ser primero un contacto aceptado' });
    }
    const result = await database.query(
      `INSERT INTO guardian_relationships(protected_user_id,guardian_user_id,status,updated_at)
       VALUES($1,$2,'invited',NOW())
       ON CONFLICT(protected_user_id,guardian_user_id) DO UPDATE SET status='invited',updated_at=NOW()
       RETURNING id,status,created_at,updated_at`,
      [protectedUserId, guardianUserId]
    );
    await sendPushToUser(guardianUserId, {
      type:'guardian-invite', title:'Vobix Guardián Familiar',
      body:`${req.vobixUser.username} quiere añadirte como familiar de confianza.`,
      url:'/chat.html?guardian=1'
    });
    return res.status(201).json({ ok:true, relationship:result.rows[0] });
  } catch (error) {
    console.error('VOBIX GUARDIAN INVITE ERROR:', error);
    return res.status(500).json({ ok:false, msg:'No se pudo invitar al familiar' });
  }
});

app.post('/api/guardian/:relationshipId/respond', requireAuth, async (req, res) => {
  const accept = req.body?.accept === true;
  try {
    const result = await database.query(
      `UPDATE guardian_relationships SET status=$1,updated_at=NOW()
       WHERE id=$2 AND guardian_user_id=$3 AND status='invited'
       RETURNING id,status,protected_user_id`,
      [accept ? 'active' : 'rejected', req.params.relationshipId, req.vobixUser.id]
    );
    if (!result.rows.length) return res.status(404).json({ ok:false, msg:'Invitación no disponible' });
    return res.json({ ok:true, relationship:result.rows[0] });
  } catch (error) {
    return res.status(500).json({ ok:false, msg:'No se pudo responder' });
  }
});

app.post('/api/guardian/reviews', requireAuth, async (req, res) => {
  const category = vobixGuardian.normalizeCategory(req.body?.category);
  const summary = vobixGuardian.safeSummary(category, req.body?.summary);
  const relationshipId = String(req.body?.relationshipId || '').trim();
  if (!category || !summary || !/^[0-9a-f-]{36}$/i.test(relationshipId)) {
    return res.status(400).json({ ok:false, msg:'Solicitud de consulta no válida' });
  }
  try {
    const relationship = await database.query(
      `SELECT id,guardian_user_id FROM guardian_relationships
       WHERE id=$1 AND protected_user_id=$2 AND status='active' LIMIT 1`,
      [relationshipId, req.vobixUser.id]
    );
    if (!relationship.rows.length) return res.status(403).json({ ok:false, msg:'Guardián no autorizado' });
    const guardianUserId = relationship.rows[0].guardian_user_id;
    const result = await database.query(
      `INSERT INTO guardian_review_requests
       (relationship_id,protected_user_id,guardian_user_id,category,summary,expires_at)
       VALUES($1,$2,$3,$4,$5,NOW()+INTERVAL '30 minutes')
       RETURNING id,category,summary,status,expires_at,created_at`,
      [relationshipId, req.vobixUser.id, guardianUserId, category, summary]
    );
    await sendPushToUser(guardianUserId, {
      type:'guardian-review', title:'Consulta de seguridad Vobix',
      body:`${req.vobixUser.username} solicita tu orientación antes de continuar.`,
      url:'/chat.html?guardian=1'
    });
    return res.status(201).json({ ok:true, review:result.rows[0] });
  } catch (error) {
    console.error('VOBIX GUARDIAN REVIEW ERROR:', error);
    return res.status(500).json({ ok:false, msg:'No se pudo enviar la consulta' });
  }
});

app.get('/api/guardian/reviews', requireAuth, async (req, res) => {
  try {
    await database.query(
      `UPDATE guardian_review_requests SET status='expired'
       WHERE status='pending' AND expires_at<=NOW()
       AND (protected_user_id=$1 OR guardian_user_id=$1)`,
      [req.vobixUser.id]
    );
    const result = await database.query(
      `SELECT r.id,r.category,r.summary,r.status,r.expires_at,r.decided_at,r.created_at,
              r.protected_user_id,r.guardian_user_id,u.username AS protected_username,u.vobix_id AS protected_vobix_id
       FROM guardian_review_requests r JOIN users u ON u.id=r.protected_user_id
       WHERE r.protected_user_id=$1 OR r.guardian_user_id=$1
       ORDER BY r.created_at DESC LIMIT 100`,
      [req.vobixUser.id]
    );
    return res.json({ ok:true, reviews:result.rows });
  } catch (error) {
    return res.status(500).json({ ok:false, msg:'No se pudieron cargar las consultas' });
  }
});

app.post('/api/guardian/reviews/:reviewId/decision', requireAuth, async (req, res) => {
  const decision = vobixGuardian.normalizeDecision(req.body?.decision);
  if (!decision) return res.status(400).json({ ok:false, msg:'Decisión no válida' });
  try {
    const result = await database.query(
      `UPDATE guardian_review_requests SET status=$1,decided_at=NOW()
       WHERE id=$2 AND guardian_user_id=$3 AND status='pending' AND expires_at>NOW()
       RETURNING id,status,protected_user_id,category`,
      [decision, req.params.reviewId, req.vobixUser.id]
    );
    if (!result.rows.length) return res.status(404).json({ ok:false, msg:'La consulta ya no está disponible' });
    await sendPushToUser(result.rows[0].protected_user_id, {
      type:'guardian-decision', title:'Respuesta de tu Guardián Vobix',
      body:decision === 'approved' ? 'Tu familiar considera que puedes continuar.' : 'Tu familiar recomienda detenerte y revisar.',
      url:'/chat.html?guardian=1'
    });
    return res.json({ ok:true, review:result.rows[0] });
  } catch (error) {
    return res.status(500).json({ ok:false, msg:'No se pudo guardar la decisión' });
  }
});

// ======================================================
// CAPA 100 — VOBIX PRUEBA DE VIDA Y CONFIANZA ACTIVA
// Solo funciona con un Guardián Familiar aceptado y consentimiento previo.
// ======================================================

app.get('/api/emergency/settings', requireAuth, async (req, res) => {
  try {
    const result = await database.query(
      `SELECT s.enabled,s.consented_at,s.updated_at,s.relationship_id,
              g.status AS relationship_status,u.username AS guardian_username,u.vobix_id AS guardian_vobix_id
       FROM emergency_settings s
       JOIN guardian_relationships g ON g.id=s.relationship_id AND g.protected_user_id=s.user_id
       JOIN users u ON u.id=g.guardian_user_id
       WHERE s.user_id=$1 LIMIT 1`,
      [req.vobixUser.id]
    );
    const row = result.rows[0];
    return res.json({ ok:true, settings:row ? {
      enabled:row.enabled === true && row.relationship_status === 'active',
      hasPhrase:true, relationshipId:row.relationship_id,
      guardianUsername:row.guardian_username, guardianVobixId:row.guardian_vobix_id,
      consentedAt:row.consented_at, updatedAt:row.updated_at
    } : { enabled:false, hasPhrase:false } });
  } catch (error) {
    return res.status(500).json({ ok:false, msg:'No se pudo cargar la alerta silenciosa' });
  }
});

app.put('/api/emergency/settings', requireAuth, async (req, res) => {
  const relationshipId = String(req.body?.relationshipId || '').trim();
  const phraseHash = vobixEmergency.validPhraseHash(req.body?.phraseHash);
  const enabled = req.body?.enabled === true;
  const consent = req.body?.consent === true;
  const limitationsAccepted = req.body?.limitationsAccepted === true;
  if (!/^[0-9a-f-]{36}$/i.test(relationshipId) || !phraseHash || !consent || !limitationsAccepted) {
    return res.status(400).json({ ok:false, msg:'Configuración o consentimiento no válidos' });
  }
  try {
    const guardian = await database.query(
      `SELECT id FROM guardian_relationships
       WHERE id=$1 AND protected_user_id=$2 AND status='active' LIMIT 1`,
      [relationshipId, req.vobixUser.id]
    );
    if (!guardian.rows.length) return res.status(403).json({ ok:false, msg:'El familiar debe aceptar primero ser tu Guardián Vobix' });
    await database.query(
      `INSERT INTO emergency_settings(user_id,relationship_id,phrase_hash,enabled,consented_at,updated_at,consent_version,limitations_accepted_at)
       VALUES($1,$2,$3,$4,NOW(),NOW(),$5,NOW())
       ON CONFLICT(user_id) DO UPDATE SET relationship_id=EXCLUDED.relationship_id,
       phrase_hash=EXCLUDED.phrase_hash,enabled=EXCLUDED.enabled,consented_at=NOW(),updated_at=NOW(),
       consent_version=EXCLUDED.consent_version,limitations_accepted_at=NOW()`,
      [req.vobixUser.id, relationshipId, phraseHash, enabled, SAFETY_CONSENT_VERSION]
    );
    return res.json({ ok:true, settings:{ enabled, hasPhrase:true, relationshipId } });
  } catch (error) {
    console.error('VOBIX EMERGENCY SETTINGS ERROR:', error);
    return res.status(500).json({ ok:false, msg:'No se pudo guardar la alerta silenciosa' });
  }
});

app.post('/api/emergency/trigger', requireAuth, async (req, res) => {
  const phraseHash = vobixEmergency.validPhraseHash(req.body?.phraseHash);
  const location = vobixEmergency.safeLocation(req.body?.latitude, req.body?.longitude, req.body?.accuracy);
  if (!phraseHash || !location) return res.status(400).json({ ok:false, msg:'No se pudo validar la frase o ubicación' });
  const userKey = String(req.vobixUser.id);
  const now = Date.now();
  const recent = (emergencyTriggerRate.get(userKey) || []).filter(at => now - at < 10 * 60 * 1000);
  if (recent.length >= 3) return res.status(429).json({ ok:false, msg:'Límite temporal de alertas alcanzado' });
  try {
    const setting = await database.query(
      `SELECT s.phrase_hash,s.relationship_id,g.guardian_user_id
       FROM emergency_settings s JOIN guardian_relationships g ON g.id=s.relationship_id
       WHERE s.user_id=$1 AND s.enabled=TRUE AND g.protected_user_id=$1 AND g.status='active' LIMIT 1`,
      [req.vobixUser.id]
    );
    const row = setting.rows[0];
    if (!row || !vobixEmergency.hashesMatch(row.phrase_hash, phraseHash)) {
      return res.status(403).json({ ok:false, msg:'Alerta no configurada' });
    }
    recent.push(now);
    emergencyTriggerRate.set(userKey, recent);
    const result = await database.query(
      `INSERT INTO emergency_alerts
       (relationship_id,protected_user_id,guardian_user_id,call_id,latitude,longitude,accuracy_m,expires_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,NOW()+INTERVAL '30 minutes')
       RETURNING id,status,expires_at,created_at`,
      [row.relationship_id, req.vobixUser.id, row.guardian_user_id,
       String(req.body?.callId || '').trim().slice(0, 120) || null,
       location.latitude, location.longitude, location.accuracy]
    );
    await sendPushToUser(row.guardian_user_id, {
      type:'emergency-silent', title:'Alerta privada de Vobix',
      body:`${req.vobixUser.username} ha activado una alerta previamente autorizada. Abre Vobix para comprobarla.`,
      url:'/emergency.html?alerts=1'
    });
    return res.status(201).json({ ok:true, accepted:true, alertId:result.rows[0].id, expiresAt:result.rows[0].expires_at });
  } catch (error) {
    console.error('VOBIX EMERGENCY TRIGGER ERROR:', error);
    return res.status(500).json({ ok:false, msg:'No se pudo entregar la alerta' });
  }
});

app.get('/api/emergency/alerts', requireAuth, async (req, res) => {
  try {
    await database.query(
      `UPDATE emergency_alerts SET status='expired'
       WHERE status='active' AND expires_at<=NOW()
       AND (protected_user_id=$1 OR guardian_user_id=$1)`,
      [req.vobixUser.id]
    );
    const result = await database.query(
      `SELECT a.id,a.status,a.latitude,a.longitude,a.accuracy_m,a.expires_at,a.seen_at,a.created_at,
              CASE WHEN a.guardian_user_id=$1 THEN 'guardian' ELSE 'protected' END AS role,
              a.protected_user_id,a.guardian_user_id,u.username AS protected_username,u.vobix_id AS protected_vobix_id
       FROM emergency_alerts a JOIN users u ON u.id=a.protected_user_id
       WHERE a.protected_user_id=$1 OR a.guardian_user_id=$1
       ORDER BY a.created_at DESC LIMIT 50`,
      [req.vobixUser.id]
    );
    return res.json({ ok:true, alerts:result.rows });
  } catch (error) {
    return res.status(500).json({ ok:false, msg:'No se pudieron cargar las alertas' });
  }
});

app.post('/api/emergency/alerts/:alertId/seen', requireAuth, async (req, res) => {
  try {
    const result = await database.query(
      `UPDATE emergency_alerts SET status='seen',seen_at=NOW()
       WHERE id=$1 AND guardian_user_id=$2 AND status='active' AND expires_at>NOW()
       RETURNING id,status,seen_at`,
      [req.params.alertId, req.vobixUser.id]
    );
    if (!result.rows.length) return res.status(404).json({ ok:false, msg:'Alerta no disponible' });
    return res.json({ ok:true, alert:result.rows[0] });
  } catch (error) {
    return res.status(500).json({ ok:false, msg:'No se pudo confirmar la alerta' });
  }
});

app.post('/api/emergency/alerts/:alertId/cancel', requireAuth, async (req, res) => {
  try {
    const result = await database.query(
      `UPDATE emergency_alerts SET status='cancelled',cancelled_at=NOW()
       WHERE id=$1 AND protected_user_id=$2 AND status='active'
       AND created_at>NOW()-INTERVAL '2 minutes' RETURNING id,status,guardian_user_id`,
      [req.params.alertId, req.vobixUser.id]
    );
    if (!result.rows.length) return res.status(404).json({ ok:false, msg:'La alerta ya no puede cancelarse' });
    await sendPushToUser(result.rows[0].guardian_user_id, {
      type:'emergency-cancelled', title:'Actualización de alerta Vobix',
      body:'La alerta fue cancelada desde el dispositivo que la activó.', url:'/emergency.html?alerts=1'
    });
    return res.json({ ok:true, alert:{ id:result.rows[0].id, status:'cancelled' } });
  } catch (error) {
    return res.status(500).json({ ok:false, msg:'No se pudo cancelar la alerta' });
  }
});

// ======================================================
// CAPA 101 — VOBIX RED DE RESCATE (TRANSPORTE WEB)
// La API autentica, limita y confirma el SOS web. El cifrado E2E de relevo y
// Bluetooth/Wi-Fi Direct/satélite se habilitarán solo en las apps nativas.
// ======================================================
app.post('/api/rescue/alerts', requireAuth, async (req, res) => {
  const clientId = vobixRescue.safeClientId(req.body?.clientAlertId);
  const type = vobixRescue.safeEmergencyType(req.body?.emergencyType);
  const ciphertext = vobixRescue.safeCiphertext(req.body?.ciphertext);
  const location = vobixEmergency.safeLocation(req.body?.latitude, req.body?.longitude, req.body?.accuracy);
  const battery = vobixRescue.safeBattery(req.body?.batteryPercent);
  if (!clientId || !type || !ciphertext || !location) return res.status(400).json({ ok:false, msg:'Alerta de rescate no válida' });
  try {
    const guardian = await database.query(
      `SELECT g.id,g.guardian_user_id FROM guardian_relationships g
       JOIN emergency_settings s ON s.relationship_id=g.id AND s.user_id=g.protected_user_id
       WHERE g.protected_user_id=$1 AND g.status='active' AND s.enabled=TRUE
       AND s.consent_version=$2 AND s.limitations_accepted_at IS NOT NULL LIMIT 1`,
      [req.vobixUser.id, SAFETY_CONSENT_VERSION]
    );
    if (!guardian.rows.length) return res.status(403).json({ ok:false, msg:'Activa primero el consentimiento y un Guardián Familiar' });
    const row = guardian.rows[0];
    const result = await database.query(
      `INSERT INTO rescue_alerts(client_alert_id,protected_user_id,guardian_user_id,relationship_id,
       emergency_type,ciphertext,latitude,longitude,accuracy_m,battery_percent,silent,last_location_at,expires_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW()+INTERVAL '24 hours')
       ON CONFLICT(protected_user_id,client_alert_id) DO UPDATE SET
       latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,accuracy_m=EXCLUDED.accuracy_m,
       battery_percent=EXCLUDED.battery_percent,last_location_at=NOW(),updated_at=NOW()
       RETURNING id,status,created_at,expires_at`,
      [clientId,req.vobixUser.id,row.guardian_user_id,row.id,type,ciphertext,
       location.latitude,location.longitude,location.accuracy,battery,req.body?.silent===true]
    );
    await sendPushToUser(row.guardian_user_id, {
      type:'rescue-alert', title:'Vobix Red de Rescate',
      body:'Una persona de tu red autorizada necesita que abras Vobix.', url:'/rescue.html?received=1'
    });
    return res.status(202).json({ ok:true, accepted:true, alert:result.rows[0] });
  } catch (error) {
    console.error('VOBIX RESCUE CREATE ERROR:', error);
    return res.status(500).json({ ok:false, msg:'No se pudo poner la alerta en cola' });
  }
});

app.get('/api/rescue/alerts', requireAuth, async (req, res) => {
  try {
    const result = await database.query(
      `SELECT r.id,r.client_alert_id,r.emergency_type,r.ciphertext,r.latitude,r.longitude,r.accuracy_m,
       r.battery_percent,r.silent,r.status,r.last_location_at,r.delivered_at,r.acknowledged_at,r.created_at,
       CASE WHEN r.guardian_user_id=$1 THEN 'guardian' ELSE 'protected' END AS role,u.username AS protected_username
       FROM rescue_alerts r JOIN users u ON u.id=r.protected_user_id
       WHERE (r.guardian_user_id=$1 OR r.protected_user_id=$1) AND r.expires_at>NOW()
       ORDER BY r.created_at DESC LIMIT 50`, [req.vobixUser.id]
    );
    await database.query(`UPDATE rescue_alerts SET status='delivered',delivered_at=COALESCE(delivered_at,NOW()),updated_at=NOW()
      WHERE guardian_user_id=$1 AND status='queued' AND expires_at>NOW()`, [req.vobixUser.id]);
    return res.json({ ok:true, alerts:result.rows, nativeRelay:false });
  } catch (error) { return res.status(500).json({ ok:false, msg:'No se pudo cargar la Red de Rescate' }); }
});

app.post('/api/rescue/alerts/:alertId/acknowledge', requireAuth, async (req, res) => {
  try {
    const result = await database.query(
      `UPDATE rescue_alerts SET status='acknowledged',acknowledged_at=NOW(),updated_at=NOW()
       WHERE id=$1 AND guardian_user_id=$2 AND status IN ('queued','delivered') AND expires_at>NOW()
       RETURNING id,protected_user_id,acknowledged_at`, [req.params.alertId,req.vobixUser.id]
    );
    if (!result.rows.length) return res.status(404).json({ ok:false, msg:'Alerta no disponible' });
    await sendPushToUser(result.rows[0].protected_user_id,{type:'rescue-ack',title:'Alerta recibida',body:'Tu familiar confirmó la recepción.',url:'/rescue.html'});
    return res.json({ ok:true, acknowledgedAt:result.rows[0].acknowledged_at });
  } catch (error) { return res.status(500).json({ ok:false, msg:'No se pudo confirmar la recepción' }); }
});

// ======================================================
// CAPA 106 — VOBIX PROTECCIÓN INFANTIL
// Vinculación visible y revocable; no concede acceso al contenido del chat.
// ======================================================
const CHILD_PROTECTION_CONSENT_VERSION = '2026-09-04';

app.post('/api/child-protection/request', requireAuth, async (req, res) => {
  const relationshipId = String(req.body?.relationshipId || '').trim();
  if (req.body?.childConsent !== true || !/^[0-9a-f-]{36}$/i.test(relationshipId)) {
    return res.status(400).json({ok:false,msg:'Se necesita la aceptación expresa y un tutor válido'});
  }
  try {
    const guardian = await database.query(`SELECT guardian_user_id FROM guardian_relationships
      WHERE id=$1 AND protected_user_id=$2 AND status='active' LIMIT 1`,[relationshipId,req.vobixUser.id]);
    if (!guardian.rows.length) return res.status(403).json({ok:false,msg:'El tutor debe ser un Guardián Familiar verificado'});
    await database.query(`INSERT INTO child_protection_profiles
      (child_user_id,relationship_id,guardian_user_id,status,child_consented_at,consent_version)
      VALUES($1,$2,$3,'pending_guardian',NOW(),$4)
      ON CONFLICT(child_user_id) DO UPDATE SET relationship_id=EXCLUDED.relationship_id,
      guardian_user_id=EXCLUDED.guardian_user_id,status='pending_guardian',child_consented_at=NOW(),
      guardian_consented_at=NULL,disabled_at=NULL,consent_version=EXCLUDED.consent_version,updated_at=NOW()`,
      [req.vobixUser.id,relationshipId,guardian.rows[0].guardian_user_id,CHILD_PROTECTION_CONSENT_VERSION]);
    await database.query(`INSERT INTO child_allowed_contacts(child_user_id,contact_user_id,added_by_user_id)
      VALUES($1,$2,$2) ON CONFLICT DO NOTHING`,[req.vobixUser.id,guardian.rows[0].guardian_user_id]);
    await sendPushToUser(guardian.rows[0].guardian_user_id,{type:'child-protection-request',title:'Vobix Protección Infantil',body:'Revisa una solicitud de vinculación familiar.',url:'/child-protection.html'});
    return res.status(201).json({ok:true,status:'pending_guardian'});
  } catch(error) { return res.status(500).json({ok:false,msg:'No se pudo crear la solicitud'}); }
});

app.post('/api/child-protection/respond', requireAuth, async (req, res) => {
  const childUserId=String(req.body?.childUserId||'').trim();
  const decision=req.body?.decision==='accept'?'active':req.body?.decision==='decline'?'declined':null;
  if(!decision||!/^[0-9a-f-]{36}$/i.test(childUserId)||req.body?.guardianConsent!==true)return res.status(400).json({ok:false,msg:'Decisión o consentimiento no válidos'});
  try { const result=await database.query(`UPDATE child_protection_profiles SET status=$1,
    guardian_consented_at=CASE WHEN $1='active' THEN NOW() ELSE NULL END,updated_at=NOW()
    WHERE child_user_id=$2 AND guardian_user_id=$3 AND status='pending_guardian' RETURNING child_user_id,status`,
    [decision,childUserId,req.vobixUser.id]);
    if(!result.rows.length)return res.status(404).json({ok:false,msg:'Solicitud no disponible'});
    return res.json({ok:true,profile:result.rows[0]});
  } catch(error){return res.status(500).json({ok:false,msg:'No se pudo guardar la decisión'});}
});

app.get('/api/child-protection', requireAuth, async (req,res)=>{
  try { const profiles=await database.query(`SELECT p.child_user_id,p.guardian_user_id,p.status,p.block_unknown,
    p.allowed_from_minute,p.allowed_until_minute,p.child_consented_at,p.guardian_consented_at,p.updated_at,
    CASE WHEN p.child_user_id=$1 THEN 'child' ELSE 'guardian' END AS role
    FROM child_protection_profiles p WHERE p.child_user_id=$1 OR p.guardian_user_id=$1`,[req.vobixUser.id]);
    const contacts=await database.query(`SELECT c.child_user_id,c.contact_user_id,u.username,u.vobix_id
      FROM child_allowed_contacts c JOIN users u ON u.id=c.contact_user_id
      JOIN child_protection_profiles p ON p.child_user_id=c.child_user_id
      WHERE p.child_user_id=$1 OR p.guardian_user_id=$1 ORDER BY u.username LIMIT 100`,[req.vobixUser.id]);
    return res.json({ok:true,profiles:profiles.rows,contacts:contacts.rows});
  }catch(error){return res.status(500).json({ok:false,msg:'No se pudo cargar la protección infantil'});}
});

app.put('/api/child-protection/:childUserId/policy', requireAuth, async(req,res)=>{
  const schedule=vobixChildProtection.validSchedule(req.body?.allowedFromMinute,req.body?.allowedUntilMinute);
  if(!schedule)return res.status(400).json({ok:false,msg:'Horario no válido'});
  try { const result=await database.query(`UPDATE child_protection_profiles SET block_unknown=$1,
    allowed_from_minute=$2,allowed_until_minute=$3,updated_at=NOW()
    WHERE child_user_id=$4 AND guardian_user_id=$5 AND status='active' RETURNING child_user_id,status,block_unknown,allowed_from_minute,allowed_until_minute`,
    [req.body?.blockUnknown!==false,schedule.start,schedule.end,req.params.childUserId,req.vobixUser.id]);
    if(!result.rows.length)return res.status(403).json({ok:false,msg:'Solo el tutor vinculado puede cambiar esta política'});
    return res.json({ok:true,policy:result.rows[0]});
  }catch(error){return res.status(500).json({ok:false,msg:'No se pudo guardar la política'});}
});

app.post('/api/child-protection/:childUserId/contacts',requireAuth,async(req,res)=>{
  const contactUserId=String(req.body?.contactUserId||'').trim();
  if(!/^[0-9a-f-]{36}$/i.test(contactUserId))return res.status(400).json({ok:false,msg:'Contacto no válido'});
  try { const owner=await database.query(`SELECT 1 FROM child_protection_profiles WHERE child_user_id=$1 AND guardian_user_id=$2 AND status='active'`,[req.params.childUserId,req.vobixUser.id]);
    if(!owner.rows.length)return res.status(403).json({ok:false,msg:'Tutor no autorizado'});
    await database.query(`INSERT INTO child_allowed_contacts(child_user_id,contact_user_id,added_by_user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[req.params.childUserId,contactUserId,req.vobixUser.id]);
    return res.status(201).json({ok:true});
  }catch(error){return res.status(500).json({ok:false,msg:'No se pudo autorizar el contacto'});}
});

app.post('/api/child-protection/disable',requireAuth,async(req,res)=>{
  try { const result=await database.query(`UPDATE child_protection_profiles SET status='disabled',disabled_at=NOW(),updated_at=NOW()
    WHERE (child_user_id=$1 OR guardian_user_id=$1) AND status IN ('active','pending_guardian') RETURNING child_user_id`,[req.vobixUser.id]);
    return res.json({ok:true,disabled:result.rowCount});
  }catch(error){return res.status(500).json({ok:false,msg:'No se pudo desactivar'});}
});

// CAPA 107 — preferencias de accesibilidad. Nunca recibe ni almacena la transcripción.
app.get('/api/sign-support/preferences',requireAuth,async(req,res)=>{
  try{const result=await database.query(`SELECT sign_system,spoken_locale,text_size,high_contrast,updated_at FROM sign_support_preferences WHERE user_id=$1`,[req.vobixUser.id]);
    return res.json({ok:true,preferences:result.rows[0]||vobixSignSupport.safePreferences()});
  }catch(error){return res.status(500).json({ok:false,msg:'No se pudieron cargar las preferencias'});}
});
app.put('/api/sign-support/preferences',requireAuth,async(req,res)=>{
  const preferences=vobixSignSupport.safePreferences(req.body);
  try{const result=await database.query(`INSERT INTO sign_support_preferences(user_id,sign_system,spoken_locale,text_size,high_contrast)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE SET sign_system=EXCLUDED.sign_system,
    spoken_locale=EXCLUDED.spoken_locale,text_size=EXCLUDED.text_size,high_contrast=EXCLUDED.high_contrast,updated_at=NOW()
    RETURNING sign_system,spoken_locale,text_size,high_contrast,updated_at`,[req.vobixUser.id,preferences.signSystem,preferences.spokenLocale,preferences.textSize,preferences.highContrast]);
    return res.json({ok:true,preferences:result.rows[0]});
  }catch(error){return res.status(500).json({ok:false,msg:'No se pudieron guardar las preferencias'});}
});


// ======================================================
// CAPA 108 — VOBIX RECUPERACIÓN FAMILIAR
// ======================================================
app.get('/api/family-recovery',requireAuth,async(req,res)=>{
  try{
    const plan=await database.query(`SELECT enabled,threshold_required,consented_at,consent_version,updated_at FROM family_recovery_plans WHERE user_id=$1`,[req.vobixUser.id]);
    const members=await database.query(`SELECT m.relationship_id,m.guardian_user_id,u.username,u.vobix_id FROM family_recovery_members m JOIN users u ON u.id=m.guardian_user_id WHERE m.user_id=$1 ORDER BY u.username`,[req.vobixUser.id]);
    const requests=await database.query(`SELECT DISTINCT r.id,r.user_id,r.device_label,r.threshold_required,r.status,r.ready_at,r.expires_at,r.created_at,
      CASE WHEN r.user_id=$1 THEN 'owner' ELSE 'guardian' END role,
      (SELECT COUNT(*)::int FROM family_recovery_votes v WHERE v.request_id=r.id AND v.decision='approved') approval_count
      FROM family_recovery_requests r LEFT JOIN family_recovery_members m ON m.user_id=r.user_id AND m.guardian_user_id=$1
      WHERE (r.user_id=$1 OR m.guardian_user_id=$1) AND r.expires_at>NOW()-INTERVAL '7 days' ORDER BY r.created_at DESC LIMIT 50`,[req.vobixUser.id]);
    return res.json({ok:true,plan:plan.rows[0]||{enabled:false,threshold_required:2},members:members.rows,requests:requests.rows});
  }catch(error){console.error('VOBIX FAMILY RECOVERY LIST ERROR:',error);return res.status(500).json({ok:false,msg:'No se pudo cargar la recuperación familiar'});}
});

app.put('/api/family-recovery/plan',requireAuth,async(req,res)=>{
  const enabled=req.body?.enabled===true;
  const ids=Array.isArray(req.body?.relationshipIds)?[...new Set(req.body.relationshipIds.map(String))]:[];
  const threshold=vobixFamilyRecovery.normalizeThreshold(req.body?.threshold,ids.length);
  if(enabled&&(req.body?.explicitConsent!==true||!threshold||ids.some(id=>!vobixFamilyRecovery.validUuid(id))))return res.status(400).json({ok:false,msg:'Elija entre 2 y 5 guardianes y confirme el consentimiento'});
  const client=await database.pool.connect();
  try{
    await client.query('BEGIN');
    let guardians={rows:[]};
    if(enabled){guardians=await client.query(`SELECT id,guardian_user_id FROM guardian_relationships WHERE protected_user_id=$1 AND status='active' AND id=ANY($2::uuid[])`,[req.vobixUser.id,ids]);if(guardians.rows.length!==ids.length)throw Object.assign(new Error('guardian_mismatch'),{status:403});}
    await client.query(`INSERT INTO family_recovery_plans(user_id,enabled,threshold_required,consented_at,updated_at)
      VALUES($1,$2,$3,CASE WHEN $2 THEN NOW() ELSE NULL END,NOW()) ON CONFLICT(user_id) DO UPDATE SET enabled=EXCLUDED.enabled,
      threshold_required=EXCLUDED.threshold_required,consented_at=EXCLUDED.consented_at,updated_at=NOW()`,[req.vobixUser.id,enabled,threshold||2]);
    await client.query(`UPDATE family_recovery_requests SET status='cancelled',cancelled_at=NOW()
      WHERE user_id=$1 AND status IN ('pending','approved')`,[req.vobixUser.id]);
    await client.query('DELETE FROM family_recovery_members WHERE user_id=$1',[req.vobixUser.id]);
    for(const guardian of guardians.rows)await client.query(`INSERT INTO family_recovery_members(user_id,relationship_id,guardian_user_id) VALUES($1,$2,$3)`,[req.vobixUser.id,guardian.id,guardian.guardian_user_id]);
    await client.query('COMMIT');return res.json({ok:true,enabled,threshold:threshold||2,guardianCount:guardians.rows.length});
  }catch(error){await client.query('ROLLBACK');return res.status(error.status||500).json({ok:false,msg:error.status?'Todos deben ser guardianes activos':'No se pudo guardar el plan'});}finally{client.release();}
});

app.post('/api/family-recovery/start',async(req,res)=>{
  if(!familyRecoveryRateLimit(req,res,'start',5,15*60*1000))return;
  const vobixId=String(req.body?.vobixId||'').trim().toLowerCase();
  if(!/^@[a-z0-9._-]{3,40}$/.test(vobixId))return res.status(400).json({ok:false,msg:'Vobix ID no válido'});
  try{
    const account=await database.query(`SELECT u.id,u.username,p.threshold_required FROM users u JOIN family_recovery_plans p ON p.user_id=u.id WHERE LOWER(u.vobix_id)=LOWER($1) AND u.verified=TRUE AND p.enabled=TRUE LIMIT 1`,[vobixId]);
    if(!account.rows.length)return res.status(404).json({ok:false,msg:'La recuperación familiar no está disponible para esta cuenta'});
    const user=account.rows[0],members=await database.query(`SELECT m.guardian_user_id FROM family_recovery_members m
      JOIN guardian_relationships g ON g.id=m.relationship_id AND g.guardian_user_id=m.guardian_user_id
      WHERE m.user_id=$1 AND g.status='active'`,[user.id]);
    if(members.rows.length<Number(user.threshold_required))return res.status(409).json({ok:false,msg:'El plan familiar necesita volver a configurarse'});
    const open=await database.query(`SELECT id FROM family_recovery_requests WHERE user_id=$1 AND status IN ('pending','approved') AND expires_at>NOW()`,[user.id]);
    if(open.rows.length)return res.status(409).json({ok:false,msg:'Ya existe una recuperación en curso'});
    const secret=vobixFamilyRecovery.createRecoverySecret();
    const created=await database.query(`INSERT INTO family_recovery_requests(user_id,secret_hash,device_label,threshold_required,expires_at)
      VALUES($1,$2,$3,$4,NOW()+INTERVAL '${vobixFamilyRecovery.REQUEST_HOURS} hours') RETURNING id,device_label,threshold_required,status,expires_at,created_at`,
      [user.id,vobixFamilyRecovery.hashRecoverySecret(secret),vobixFamilyRecovery.safeDeviceLabel(req.body?.deviceLabel),user.threshold_required]);
    await Promise.all(members.rows.map(member=>sendPushToUser(member.guardian_user_id,{type:'family-recovery-request',title:'Vobix Recuperación Familiar',body:`${user.username} solicita recuperar su cuenta desde un nuevo dispositivo.`,url:'/family-recovery.html'})));
    return res.status(201).json({ok:true,request:created.rows[0],recoverySecret:secret});
  }catch(error){console.error('VOBIX FAMILY RECOVERY START ERROR:',error);return res.status(500).json({ok:false,msg:'No se pudo iniciar la recuperación'});}
});

app.post('/api/family-recovery/:requestId/vote',requireAuth,async(req,res)=>{
  const decision=['approved','rejected'].includes(req.body?.decision)?req.body.decision:null;
  if(!decision||!vobixFamilyRecovery.validUuid(req.params.requestId))return res.status(400).json({ok:false,msg:'Decisión no válida'});
  const client=await database.pool.connect();
  try{
    await client.query('BEGIN');
    const allowed=await client.query(`SELECT r.id,r.user_id,r.threshold_required FROM family_recovery_requests r
      JOIN family_recovery_plans p ON p.user_id=r.user_id AND p.enabled=TRUE
      JOIN family_recovery_members m ON m.user_id=r.user_id AND m.guardian_user_id=$2
      JOIN guardian_relationships g ON g.id=m.relationship_id AND g.guardian_user_id=$2 AND g.status='active'
      WHERE r.id=$1 AND r.status IN ('pending','approved') AND r.expires_at>NOW() FOR UPDATE OF r`,[req.params.requestId,req.vobixUser.id]);
    if(!allowed.rows.length)throw Object.assign(new Error('not_available'),{status:404});
    await client.query(`INSERT INTO family_recovery_votes(request_id,guardian_user_id,decision) VALUES($1,$2,$3) ON CONFLICT(request_id,guardian_user_id) DO UPDATE SET decision=EXCLUDED.decision,decided_at=NOW()`,[req.params.requestId,req.vobixUser.id,decision]);
    const counts=await client.query(`SELECT COUNT(*) FILTER(WHERE decision='approved')::int approvals,COUNT(*) FILTER(WHERE decision='rejected')::int rejections FROM family_recovery_votes WHERE request_id=$1`,[req.params.requestId]);
    const row=allowed.rows[0],count=counts.rows[0];
    if(Number(count.approvals)>=Number(row.threshold_required))await client.query(`UPDATE family_recovery_requests SET status='approved',ready_at=COALESCE(ready_at,NOW()+INTERVAL '${vobixFamilyRecovery.WAIT_HOURS} hours') WHERE id=$1`,[row.id]);
    else if(Number(count.rejections)>=Number(row.threshold_required))await client.query(`UPDATE family_recovery_requests SET status='rejected' WHERE id=$1`,[row.id]);
    await client.query('COMMIT');await sendPushToUser(row.user_id,{type:'family-recovery-vote',title:'Recuperación Familiar actualizada',body:'Un familiar respondió a la solicitud. No compartas códigos.',url:'/family-recovery.html'});
    return res.json({ok:true,approvals:count.approvals,rejections:count.rejections});
  }catch(error){await client.query('ROLLBACK');return res.status(error.status||500).json({ok:false,msg:error.status?'Solicitud no disponible':'No se pudo guardar la decisión'});}finally{client.release();}
});

app.post('/api/family-recovery/:requestId/cancel',requireAuth,async(req,res)=>{
  try{const result=await database.query(`UPDATE family_recovery_requests SET status='cancelled',cancelled_at=NOW() WHERE id=$1 AND user_id=$2 AND status IN ('pending','approved') RETURNING id`,[req.params.requestId,req.vobixUser.id]);return result.rows.length?res.json({ok:true}):res.status(404).json({ok:false,msg:'Solicitud no disponible'});}catch(error){return res.status(500).json({ok:false,msg:'No se pudo cancelar'});}
});

app.post('/api/family-recovery/:requestId/status',async(req,res)=>{
  if(!familyRecoveryRateLimit(req,res,'status',20,5*60*1000))return;
  if(!vobixFamilyRecovery.validUuid(req.params.requestId))return res.status(400).json({ok:false,msg:'Solicitud no válida'});
  try{const result=await database.query(`SELECT r.id,r.status,r.device_label,r.threshold_required,r.ready_at,r.expires_at,(SELECT COUNT(*)::int FROM family_recovery_votes v WHERE v.request_id=r.id AND v.decision='approved') approval_count FROM family_recovery_requests r WHERE r.id=$1 AND r.secret_hash=$2`,[req.params.requestId,vobixFamilyRecovery.hashRecoverySecret(req.body?.recoverySecret)]);if(!result.rows.length)return res.status(404).json({ok:false,msg:'Recuperación no disponible'});return res.json({ok:true,state:vobixFamilyRecovery.requestState(result.rows[0]),request:result.rows[0]});}catch(error){return res.status(500).json({ok:false,msg:'No se pudo consultar'});}
});

app.post('/api/family-recovery/:requestId/complete',async(req,res)=>{
  if(!familyRecoveryRateLimit(req,res,'complete',8,15*60*1000))return;
  if(!vobixFamilyRecovery.validUuid(req.params.requestId))return res.status(400).json({ok:false,msg:'Solicitud no válida'});
  const client=await database.pool.connect();
  try{
    await client.query('BEGIN');
    const request=await client.query(`SELECT r.*,(SELECT COUNT(*)::int FROM family_recovery_votes v WHERE v.request_id=r.id AND v.decision='approved') approval_count FROM family_recovery_requests r WHERE r.id=$1 AND r.secret_hash=$2 FOR UPDATE`,[req.params.requestId,vobixFamilyRecovery.hashRecoverySecret(req.body?.recoverySecret)]);
    if(!request.rows.length||vobixFamilyRecovery.requestState(request.rows[0])!=='ready')throw Object.assign(new Error('not_ready'),{status:403});
    const token=createSessionToken(),tokenHash=hashSessionToken(token),expiresAt=new Date(Date.now()+SESSION_TTL_MS),row=request.rows[0];
    await client.query('UPDATE sessions SET revoked=TRUE,last_used_at=NOW() WHERE user_id=$1',[row.user_id]);
    await client.query(`INSERT INTO sessions(user_id,token_hash,device_name,platform,created_at,last_used_at,expires_at,revoked,recognized_at) VALUES($1,$2,$3,NULL,NOW(),NOW(),$4,FALSE,NOW())`,[row.user_id,tokenHash,row.device_label,expiresAt]);
    await client.query(`UPDATE family_recovery_requests SET status='completed',completed_at=NOW() WHERE id=$1`,[row.id]);
    await client.query('COMMIT');return res.json({ok:true,token,expiresAt});
  }catch(error){await client.query('ROLLBACK');return res.status(error.status||500).json({ok:false,msg:error.status?'Aún no se puede completar la recuperación':'No se pudo completar'});}finally{client.release();}
});

// ======================================================
// CAPA 103 — VOBIX RUTA PROTEGIDA
// Seguimiento temporal con consentimiento y guardianes aceptados.
// ======================================================

app.post('/api/protected-routes', requireAuth, async (req, res) => {
  const destination = vobixProtectedRoute.safeCoordinate(
    req.body?.destinationLatitude, req.body?.destinationLongitude, null
  );
  const current = vobixProtectedRoute.safeCoordinate(
    req.body?.latitude, req.body?.longitude, req.body?.accuracy
  );
  const expectedAt = vobixProtectedRoute.safeExpectedAt(req.body?.expectedAt);
  const destinationLabel = vobixProtectedRoute.safeDestinationLabel(req.body?.destinationLabel);
  const relationshipIds = [...new Set(Array.isArray(req.body?.relationshipIds) ? req.body.relationshipIds : [])]
    .map(value => String(value || '').trim()).filter(value => /^[0-9a-f-]{36}$/i.test(value)).slice(0, 5);
  if (!destination || !current || !expectedAt || !destinationLabel || !relationshipIds.length ||
      req.body?.consent !== true || req.body?.limitationsAccepted !== true) {
    return res.status(400).json({ ok:false, msg:'Destino, ubicación, familiares o consentimiento no válidos' });
  }

  const client = await database.pool.connect();
  try {
    await client.query('BEGIN');
    const guardians = await client.query(
      `SELECT id,guardian_user_id FROM guardian_relationships
       WHERE protected_user_id=$1 AND status='active' AND id=ANY($2::uuid[])`,
      [req.vobixUser.id, relationshipIds]
    );
    if (guardians.rows.length !== relationshipIds.length) {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok:false, msg:'Todos los familiares deben aceptar primero ser Guardianes Vobix' });
    }
    const route = await client.query(
      `INSERT INTO protected_routes
       (user_id,destination_label,destination_latitude,destination_longitude,current_latitude,current_longitude,
        accuracy_m,expected_at,consented_at,last_location_at,last_movement_at,consent_version,limitations_accepted_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW(),NOW(),$9,NOW())
       RETURNING id,status,expected_at,created_at`,
      [req.vobixUser.id, destinationLabel, destination.latitude, destination.longitude,
       current.latitude, current.longitude, current.accuracy, expectedAt, SAFETY_CONSENT_VERSION]
    );
    for (const guardian of guardians.rows) {
      await client.query(
        `INSERT INTO protected_route_guardians(route_id,relationship_id,guardian_user_id) VALUES($1,$2,$3)`,
        [route.rows[0].id, guardian.id, guardian.guardian_user_id]
      );
    }
    await client.query('COMMIT');
    await Promise.all(guardians.rows.map(guardian => sendPushToUser(guardian.guardian_user_id, {
      type:'protected-route-started', title:'Vobix Ruta Protegida',
      body:`${req.vobixUser.username} inició un trayecto protegido hacia ${destinationLabel}.`,
      url:'/protected-route.html?watch=1'
    })));
    return res.status(201).json({ ok:true, route:route.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('VOBIX PROTECTED ROUTE START ERROR:', error);
    return res.status(500).json({ ok:false, msg:'No se pudo iniciar la Ruta Protegida' });
  } finally {
    client.release();
  }
});

app.post('/api/protected-routes/:routeId/location', requireAuth, async (req, res) => {
  const location = vobixProtectedRoute.safeCoordinate(req.body?.latitude, req.body?.longitude, req.body?.accuracy);
  if (!location) return res.status(400).json({ ok:false, msg:'Ubicación no válida' });
  try {
    const found = await database.query(
      `SELECT id,user_id,status,current_latitude,current_longitude,destination_latitude,destination_longitude
       FROM protected_routes WHERE id=$1 AND user_id=$2 LIMIT 1`,
      [req.params.routeId, req.vobixUser.id]
    );
    const route = found.rows[0];
    if (!route || !['active','late','stalled'].includes(route.status)) {
      return res.status(404).json({ ok:false, msg:'La Ruta Protegida no está activa' });
    }
    const previous = route.current_latitude == null ? null : {
      latitude:Number(route.current_latitude), longitude:Number(route.current_longitude)
    };
    const moved = vobixProtectedRoute.distanceMetres(previous, location) >= 40;
    const distanceToDestination = vobixProtectedRoute.distanceMetres(location, {
      latitude:Number(route.destination_latitude), longitude:Number(route.destination_longitude)
    });
    const arrived = distanceToDestination <= Math.max(100, location.accuracy || 0);
    const updated = await database.query(
      `UPDATE protected_routes SET current_latitude=$1,current_longitude=$2,accuracy_m=$3,
       last_location_at=NOW(),last_movement_at=CASE WHEN $4 THEN NOW() ELSE last_movement_at END,
       status=CASE WHEN $5 THEN 'arrived' ELSE 'active' END,
       finished_at=CASE WHEN $5 THEN NOW() ELSE finished_at END,updated_at=NOW()
       WHERE id=$6 RETURNING id,status,expected_at,last_location_at,finished_at`,
      [location.latitude, location.longitude, location.accuracy, moved, arrived, route.id]
    );
    if (arrived) {
      const guardians = await database.query('SELECT guardian_user_id FROM protected_route_guardians WHERE route_id=$1', [route.id]);
      await Promise.all(guardians.rows.map(item => sendPushToUser(item.guardian_user_id, {
        type:'protected-route-arrived', title:'Llegada confirmada',
        body:`${req.vobixUser.username} llegó al destino de su Ruta Protegida.`, url:'/protected-route.html?watch=1'
      })));
    }
    return res.json({ ok:true, route:updated.rows[0], distanceToDestination });
  } catch (error) {
    return res.status(500).json({ ok:false, msg:'No se pudo actualizar la Ruta Protegida' });
  }
});

app.get('/api/protected-routes', requireAuth, async (req, res) => {
  try {
    const result = await database.query(
      `SELECT DISTINCT r.id,r.user_id,r.destination_label,r.destination_latitude,r.destination_longitude,
       r.current_latitude,r.current_longitude,r.accuracy_m,r.expected_at,r.status,r.last_location_at,
       r.last_movement_at,r.finished_at,r.created_at,u.username,
       CASE WHEN r.user_id=$1 THEN 'owner' ELSE 'guardian' END AS role
       FROM protected_routes r JOIN users u ON u.id=r.user_id
       LEFT JOIN protected_route_guardians rg ON rg.route_id=r.id
       WHERE r.user_id=$1 OR rg.guardian_user_id=$1
       ORDER BY r.created_at DESC LIMIT 50`,
      [req.vobixUser.id]
    );
    return res.json({ ok:true, routes:result.rows });
  } catch (error) {
    return res.status(500).json({ ok:false, msg:'No se pudieron cargar las Rutas Protegidas' });
  }
});

app.post('/api/protected-routes/:routeId/acknowledge', requireAuth, async (req, res) => {
  try {
    const result = await database.query(
      `UPDATE protected_route_guardians SET acknowledged_at=NOW()
       WHERE route_id=$1 AND guardian_user_id=$2 RETURNING route_id,acknowledged_at`,
      [req.params.routeId, req.vobixUser.id]
    );
    if (!result.rows.length) return res.status(404).json({ ok:false, msg:'Ruta no disponible' });
    return res.json({ ok:true, acknowledgment:result.rows[0] });
  } catch (error) {
    return res.status(500).json({ ok:false, msg:'No se pudo confirmar la recepción' });
  }
});

app.post('/api/protected-routes/:routeId/finish', requireAuth, async (req, res) => {
  const status = req.body?.status === 'arrived' ? 'arrived' : 'cancelled';
  try {
    const result = await database.query(
      `UPDATE protected_routes SET status=$1,finished_at=NOW(),updated_at=NOW()
       WHERE id=$2 AND user_id=$3 AND status IN ('active','late','stalled')
       RETURNING id,status,destination_label`,
      [status, req.params.routeId, req.vobixUser.id]
    );
    if (!result.rows.length) return res.status(404).json({ ok:false, msg:'Ruta no disponible' });
    const guardians = await database.query('SELECT guardian_user_id FROM protected_route_guardians WHERE route_id=$1', [req.params.routeId]);
    await Promise.all(guardians.rows.map(item => sendPushToUser(item.guardian_user_id, {
      type:`protected-route-${status}`, title:'Actualización de Ruta Protegida',
      body:status === 'arrived' ? `${req.vobixUser.username} confirmó su llegada.` : `${req.vobixUser.username} canceló el seguimiento.`,
      url:'/protected-route.html?watch=1'
    })));
    return res.json({ ok:true, route:result.rows[0] });
  } catch (error) {
    return res.status(500).json({ ok:false, msg:'No se pudo cerrar la Ruta Protegida' });
  }
});

async function monitorProtectedRoutes() {
  try {
    const result = await database.query(
      `UPDATE protected_routes SET
       status=CASE WHEN expected_at<NOW() THEN 'late' ELSE 'stalled' END,
       alert_sent_at=NOW(),updated_at=NOW()
       WHERE status='active' AND alert_sent_at IS NULL
       AND (expected_at<NOW() OR COALESCE(last_location_at,created_at)<NOW()-INTERVAL '10 minutes')
       RETURNING id,user_id,status,destination_label`
    );
    for (const route of result.rows) {
      const guardians = await database.query('SELECT guardian_user_id FROM protected_route_guardians WHERE route_id=$1', [route.id]);
      for (const guardian of guardians.rows) {
        await sendPushToUser(guardian.guardian_user_id, {
          type:'protected-route-alert', title:'Revisa esta Ruta Protegida',
          body:route.status === 'late' ? 'La hora prevista de llegada ya pasó.' : 'Vobix lleva más de 10 minutos sin recibir una ubicación.',
          url:'/protected-route.html?watch=1'
        });
      }
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') console.error('VOBIX PROTECTED ROUTE MONITOR ERROR:', error.message);
  }
}

const protectedRouteMonitor = setInterval(monitorProtectedRoutes, 60 * 1000);
protectedRouteMonitor.unref?.();


// ======================================================
// CONFIGURACIÓN WEBRTC / TURN
// ======================================================

// ======================================================
// CAPA 5 — DIAGNÓSTICO CENTRAL DE ESTRUCTURA
// El cliente solo recibe nombres, alcance y estado; nunca
// secretos, configuración de Render ni datos de usuarios.
// ======================================================

app.get('/api/vobix/layers', requireAuth, (req, res) => {
  res.json({ ok:true, layers:getVobixLayers() });
});

async function getUserPremiumSubscription(userId) {
  await database.query(
    `INSERT INTO premium_subscriptions (user_id, plan, status)
     VALUES ($1, 'free', 'active')
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );

  const result = await database.query(
    `SELECT plan, status, current_period_end
     FROM premium_subscriptions
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );
  const row = result.rows[0] || { plan: 'free', status: 'active' };
  const plan = row.status === 'active' || row.status === 'trialing' ? row.plan : 'free';
  return {
    plan,
    status: row.status,
    currentPeriodEnd: row.current_period_end || null,
    billingEnabled: false
  };
}

// Capa 145 — contrato Premium autenticado. Los planes y permisos son reales,
// pero los cobros permanecen desactivados hasta integrar una pasarela segura.
app.get('/api/premium/catalog', requireAuth, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const subscription = await getUserPremiumSubscription(req.vobixUser.id);
  return res.json({ ok: true, ...getPremiumCatalog(subscription.plan) });
});

app.get('/api/premium/me', requireAuth, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const subscription = await getUserPremiumSubscription(req.vobixUser.id);
  return res.json({
    ok: true,
    userId: req.vobixUser.id,
    subscription,
    ...getPremiumCatalog(subscription.plan)
  });
});

app.get('/api/premium/access/:capabilityId', requireAuth, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const subscription = await getUserPremiumSubscription(req.vobixUser.id);
  const access = getCapabilityAccess(req.params.capabilityId, subscription.plan);
  if (!access) {
    return res.status(404).json({ ok: false, code: 'unknown_capability', msg: 'Servicio no reconocido' });
  }
  return res.json({ ok: true, access });
});

function requirePremiumCapability(capabilityId) {
  return async (req, res, next) => {
    const subscription = await getUserPremiumSubscription(req.vobixUser.id);
    const access = getCapabilityAccess(capabilityId, subscription.plan);
    if (!access) return res.status(404).json({ ok:false, code:'unknown_capability' });
    if (!access.entitled) {
      return res.status(403).json({ ok:false, code:'premium_plan_required', minimumPlan:access.minimumPlan });
    }
    if (!access.operational) {
      return res.status(409).json({ ok:false, code:'service_not_operational', status:access.status });
    }
    req.vobixPremiumAccess = access;
    return next();
  };
}

app.get('/api/premium/services/:capabilityId/setup', requireAuth, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const capabilityId = String(req.params.capabilityId || '').toLowerCase();
  if (!isConfigurableCapability(capabilityId)) {
    return res.status(404).json({ ok:false, code:'unknown_capability' });
  }
  const result = await database.query(
    `SELECT capability_id, setup_state, display_name, locale, onboarding_step, updated_at
     FROM premium_service_settings WHERE user_id = $1 AND capability_id = $2 LIMIT 1`,
    [req.vobixUser.id, capabilityId]
  );
  return res.json({ ok:true, setup:result.rows[0] || {
    capability_id:capabilityId, setup_state:'draft', display_name:null, locale:'es', onboarding_step:0
  }});
});

app.put('/api/premium/services/:capabilityId/setup', requireAuth, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const capabilityId = String(req.params.capabilityId || '').toLowerCase();
  if (!isConfigurableCapability(capabilityId)) {
    return res.status(404).json({ ok:false, code:'unknown_capability' });
  }
  const allowedStates = new Set(['draft', 'ready', 'paused']);
  const setupState = allowedStates.has(req.body?.setupState) ? req.body.setupState : 'draft';
  const displayName = String(req.body?.displayName || '').trim().slice(0, 80) || null;
  const locale = /^[a-z]{2}(?:-[A-Z]{2})?$/.test(String(req.body?.locale || ''))
    ? String(req.body.locale) : 'es';
  const onboardingStep = Math.max(0, Math.min(20, Number.parseInt(req.body?.onboardingStep, 10) || 0));
  const result = await database.query(
    `INSERT INTO premium_service_settings
       (user_id, capability_id, setup_state, display_name, locale, onboarding_step, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (user_id, capability_id) DO UPDATE SET
       setup_state = EXCLUDED.setup_state, display_name = EXCLUDED.display_name,
       locale = EXCLUDED.locale, onboarding_step = EXCLUDED.onboarding_step, updated_at = NOW()
     RETURNING capability_id, setup_state, display_name, locale, onboarding_step, updated_at`,
    [req.vobixUser.id, capabilityId, setupState, displayName, locale, onboardingStep]
  );
  return res.json({ ok:true, setup:result.rows[0] });
});

app.post('/api/premium/services/:capabilityId/help', requireAuth, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const capabilityId = String(req.params.capabilityId || '').toLowerCase();
  const question = String(req.body?.question || '').trim().slice(0, 800);
  if (!isConfigurableCapability(capabilityId)) return res.status(404).json({ok:false, code:'unknown_capability'});
  if (!question) return res.status(400).json({ok:false, code:'question_required'});
  if (containsSensitiveData(question)) {
    return res.status(400).json({ok:false, code:'sensitive_data_rejected', msg:'No incluya contraseñas, PIN, códigos ni datos bancarios'});
  }
  const userId = String(req.vobixUser.id);
  const now = Date.now();
  const attempts = (premiumHelpRate.get(userId) || []).filter(at => now - at < 60000);
  if (attempts.length >= 20) return res.status(429).json({ok:false, code:'rate_limited'});
  attempts.push(now);
  premiumHelpRate.set(userId, attempts);

  const fallbackAnswer = localPremiumHelp(capabilityId, question);
  const providerUrl = String(process.env.VOBIX_AI_API_URL || '').trim();
  const providerKey = String(process.env.VOBIX_AI_API_KEY || '').trim();
  const providerModel = String(process.env.VOBIX_AI_MODEL || '').trim();
  if (!providerUrl || !providerKey || !providerModel) {
    return res.json({ok:true, answer:fallbackAnswer, source:'local-guide'});
  }
  try {
    const response = await fetch(providerUrl, {
      method:'POST',
      headers:{'Content-Type':'application/json', Authorization:`Bearer ${providerKey}`},
      body:JSON.stringify({model:providerModel, temperature:0.1, max_tokens:260, messages:[
        {role:'system', content:`Ayuda al usuario a configurar ${capabilityId} por autoservicio. Máximo 140 palabras. No solicites secretos, datos bancarios ni documentos personales. No afirmes que un servicio en preparación está operativo. No tomes decisiones legales, financieras o comerciales.`},
        {role:'user', content:question}
      ]}),
      signal:AbortSignal.timeout(15000)
    });
    const data = await response.json().catch(() => null);
    const answer = String(data?.choices?.[0]?.message?.content || data?.output_text || '').trim().slice(0, 1800);
    if (!response.ok || !answer) throw new Error('PREMIUM_AI_FAILED');
    return res.json({ok:true, answer, source:'configured-ai'});
  } catch (error) {
    console.error('VOBIXCHAT PREMIUM HELP ERROR:', error.message);
    return res.json({ok:true, answer:fallbackAnswer, source:'local-guide'});
  }
});

// Capa 151 — salas Vobix Meet autenticadas. El código de acceso se entrega
// una sola vez al propietario y en PostgreSQL solo se conserva su hash.
app.get('/api/meet/rooms', requireAuth, requirePremiumCapability('meet'), async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const result = await database.query(
      `SELECT id, title, waiting_room, allow_guests, max_participants,
              scheduled_for, expires_at, status, created_at, updated_at
       FROM meet_rooms
       WHERE owner_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.vobixUser.id]
    );
    return res.json({ ok:true, rooms:result.rows });
  } catch (error) {
    console.error('VOBIX MEET | No se pudieron listar las salas:', error.message);
    return res.status(500).json({ ok:false, code:'meet_rooms_unavailable' });
  }
});

app.post('/api/meet/rooms', requireAuth, requirePremiumCapability('meet'), async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const options = normalizeMeetingOptions(req.body);
  const scheduledFor = req.body?.scheduledFor ? new Date(req.body.scheduledFor) : new Date();
  if (Number.isNaN(scheduledFor.getTime())) {
    return res.status(400).json({ ok:false, code:'invalid_schedule' });
  }
  if (scheduledFor.getTime() > Date.now() + (365 * 24 * 60 * 60 * 1000)) {
    return res.status(400).json({ ok:false, code:'schedule_too_far' });
  }

  const accessCode = createMeetingCode();
  const accessCodeHash = hashMeetingCode(accessCode);
  const expiresAt = new Date(scheduledFor.getTime() + (options.durationMinutes * 60 * 1000));
  let client;
  try {
    client = await database.pool.connect();
    await client.query('BEGIN');
    const roomResult = await client.query(
      `INSERT INTO meet_rooms
         (owner_id, title, access_code_hash, waiting_room, allow_guests,
          max_participants, scheduled_for, expires_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'scheduled')
       RETURNING id, title, waiting_room, allow_guests, max_participants,
                 scheduled_for, expires_at, status, created_at`,
      [req.vobixUser.id, options.title, accessCodeHash, options.waitingRoom,
       options.allowGuests, options.maxParticipants, scheduledFor, expiresAt]
    );
    await client.query(
      `INSERT INTO meet_participants (room_id, user_id, role, state)
       VALUES ($1, $2, 'owner', 'admitted')`,
      [roomResult.rows[0].id, req.vobixUser.id]
    );
    await client.query('COMMIT');
    return res.status(201).json({ ok:true, room:roomResult.rows[0], accessCode });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('VOBIX MEET | No se pudo crear la sala:', error.message);
    return res.status(500).json({ ok:false, code:'meet_room_create_failed' });
  } finally {
    if (client) client.release();
  }
});

// Ingreso seguro para hasta 1.000 usuarios simultáneos por sala. El bloqueo
// transaccional evita que dos ingresos paralelos excedan el cupo disponible.
app.post('/api/meet/join', requireAuth, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const userId = String(req.vobixUser.id);
  const now = Date.now();
  const attempts = (meetJoinRate.get(userId) || []).filter(at => now - at < 60000);
  if (attempts.length >= 12) {
    return res.status(429).json({ ok:false, code:'meet_join_rate_limited' });
  }
  attempts.push(now);
  meetJoinRate.set(userId, attempts);

  const accessCode = normalizeMeetingCode(req.body?.accessCode);
  if (!accessCode) return res.status(400).json({ ok:false, code:'invalid_meeting_code' });

  let client;
  try {
    client = await database.pool.connect();
    await client.query('BEGIN');
    const roomResult = await client.query(
      `SELECT id, owner_id, title, waiting_room, max_participants,
              scheduled_for, expires_at, status
       FROM meet_rooms
       WHERE access_code_hash = $1
         AND status IN ('scheduled', 'active')
         AND expires_at > NOW()
       LIMIT 1
       FOR UPDATE`,
      [hashMeetingCode(accessCode)]
    );
    const room = roomResult.rows[0];
    if (!room) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok:false, code:'meeting_not_available' });
    }

    const existingResult = await client.query(
      `SELECT role, state FROM meet_participants WHERE room_id=$1 AND user_id=$2 LIMIT 1`,
      [room.id, userId]
    );
    const existing = existingResult.rows[0];
    if (!existing || existing.state === 'left' || existing.state === 'removed') {
      const countResult = await client.query(
        `SELECT COUNT(*)::int AS total FROM meet_participants
         WHERE room_id=$1 AND state IN ('waiting', 'admitted')`,
        [room.id]
      );
      if (countResult.rows[0].total >= room.max_participants) {
        await client.query('ROLLBACK');
        return res.status(409).json({ ok:false, code:'meeting_full' });
      }
    }

    const state = room.owner_id === userId || !room.waiting_room ? 'admitted' : 'waiting';
    const participantResult = await client.query(
      `INSERT INTO meet_participants (room_id, user_id, role, state, joined_at)
       VALUES ($1, $2, 'participant', $3, NOW())
       ON CONFLICT (room_id, user_id) DO UPDATE SET
         state = CASE
           WHEN meet_participants.role = 'owner' THEN 'admitted'
           ELSE EXCLUDED.state
         END,
         joined_at = NOW(), left_at = NULL
       RETURNING role, state, joined_at`,
      [room.id, userId, state]
    );
    await client.query('COMMIT');
    return res.json({
      ok:true,
      room:{ id:room.id, title:room.title, scheduledFor:room.scheduled_for, expiresAt:room.expires_at },
      participant:participantResult.rows[0]
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('VOBIX MEET | No se pudo ingresar a la sala:', error.message);
    return res.status(500).json({ ok:false, code:'meet_join_failed' });
  } finally {
    if (client) client.release();
  }
});

app.get('/api/meet/capacity', requireAuth, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const configuredConnections = Math.max(0, Number.parseInt(process.env.LIVEKIT_MAX_CONNECTIONS, 10) || 0);
  const sfu = getSfuConfiguration();
  const sfuConfigured = Boolean(sfu.url && sfu.apiKey && sfu.apiSecret);
  const capacityVerified = process.env.VOBIX_MEET_CAPACITY_VERIFIED === 'true';
  return res.json({
    ok:true,
    designedParticipants:1000,
    configuredConnections,
    sfuConfigured,
    capacityVerified,
    operational:sfuConfigured && configuredConnections >= 1000 && capacityVerified,
    note:capacityVerified
      ? 'Capacidad verificada mediante prueba de carga'
      : 'Diseñado para 1.000; requiere plan SFU compatible y prueba de carga antes de producción'
  });
});

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
// CAPA 2.1.1 — SFU DE VÍDEO (LIVEKIT)
//
// Esta ruta no inicia una videollamada por sí sola. Entrega
// un permiso temporal a un participante ya validado de una
// llamada activa. De esta forma el navegador nunca conoce
// LIVEKIT_API_SECRET y una URL copiada no permite entrar.
// ======================================================

function getSfuConfiguration() {
  return {
    url: String(process.env.LIVEKIT_URL || '').trim().replace(/\/$/, ''),
    apiKey: String(process.env.LIVEKIT_API_KEY || '').trim(),
    apiSecret: String(process.env.LIVEKIT_API_SECRET || '').trim()
  };
}

app.get('/api/sfu/status', requireAuth, (req, res) => {
  const sfu = getSfuConfiguration();

  res.json({
    ok: true,
    // Solo se muestra el estado. Ni la clave ni el secreto salen del servidor.
    enabled: Boolean(sfu.url && sfu.apiKey && sfu.apiSecret),
    provider: 'livekit',
    maxParticipants: MAX_CALL_PARTICIPANTS
  });
});

app.post('/api/meet/sfu/token', requireAuth, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const roomId = String(req.body?.roomId || '').trim();
  const userId = String(req.vobixUser?.id || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(roomId)) {
    return res.status(400).json({ ok:false, code:'invalid_meeting_room' });
  }

  const sfu = getSfuConfiguration();
  if (!sfu.url || !sfu.apiKey || !sfu.apiSecret) {
    return res.status(503).json({ ok:false, code:'SFU_NOT_CONFIGURED', msg:'El servidor SFU aún no está configurado' });
  }

  try {
    const result = await database.query(
      `SELECT p.role, p.state, r.status, r.expires_at
       FROM meet_participants p
       JOIN meet_rooms r ON r.id = p.room_id
       WHERE p.room_id=$1 AND p.user_id=$2
         AND p.state='admitted'
         AND r.status IN ('scheduled', 'active')
         AND r.expires_at > NOW()
       LIMIT 1`,
      [roomId, userId]
    );
    const membership = result.rows[0];
    if (!membership) {
      return res.status(403).json({ ok:false, code:'meet_admission_required' });
    }

    // En salas masivas solo anfitrión y moderadores emiten por defecto.
    // Esto evita 1.000 cámaras publicando al mismo tiempo y protege el SFU.
    const canPublish = membership.role === 'owner' || membership.role === 'moderator';
    const room = `vobix-meet-${roomId}`;
    const identity = `vobix-${userId}`;
    const token = jwt.sign({
      video:{
        roomJoin:true,
        room,
        canPublish,
        canSubscribe:true,
        canPublishData:true,
        roomAdmin:membership.role === 'owner'
      },
      metadata:JSON.stringify({
        userId,
        roomId,
        role:membership.role,
        username:String(req.vobixUser?.username || 'VOBIXCHAT').slice(0, 80)
      })
    }, sfu.apiSecret, {
      algorithm:'HS256',
      issuer:sfu.apiKey,
      subject:identity,
      expiresIn:'10m'
    });
    return res.json({ ok:true, url:sfu.url, token, room, canPublish, expiresIn:600 });
  } catch (error) {
    console.error('VOBIX MEET | No se pudo emitir el permiso SFU:', error.message);
    return res.status(500).json({ ok:false, code:'meet_sfu_token_failed' });
  }
});

app.post('/api/sfu/token', requireAuth, (req, res) => {
  const callId = String(req.body?.callId || '').trim();
  const call = activeCalls.get(callId);
  const userId = String(req.vobixUser?.id || '').trim();
  const sfu = getSfuConfiguration();

  if (!callId || !call) {
    return res.status(404).json({ ok:false, msg:'La sala de vídeo ya no está disponible' });
  }

  if (!call.participants.has(userId)) {
    return res.status(403).json({ ok:false, msg:'No perteneces a esta sala privada' });
  }

  if (!sfu.url || !sfu.apiKey || !sfu.apiSecret) {
    return res.status(503).json({
      ok:false,
      msg:'El servidor SFU aún no está configurado',
      code:'SFU_NOT_CONFIGURED'
    });
  }

  const room = `vobix-call-${callId}`;
  const identity = `vobix-${userId}`;

  const token = jwt.sign({
    video: {
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      roomAdmin: false
    },
    metadata: JSON.stringify({
      userId,
      callId,
      username: String(req.vobixUser?.username || 'VOBIXCHAT').slice(0, 80)
    })
  }, sfu.apiSecret, {
    algorithm: 'HS256',
    issuer: sfu.apiKey,
    subject: identity,
    expiresIn: '10m'
  });

  return res.json({
    ok:true,
    provider:'livekit',
    url:sfu.url,
    room,
    token,
    expiresInSeconds:600,
    maxParticipants:MAX_CALL_PARTICIPANTS
  });
});


// ======================================================
// INVITACIÓN A VOBIXCHAT POR SMS (INFOBIP)
// ======================================================

app.post('/api/invitations/sms', requireAuth, async (req, res) => {
  const phone = normalizePhone(req.body?.phone || '');
  const appUrl = String(process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const text = `Te invito a VOBIXCHAT. Descárgala o entra aquí: ${appUrl}`;
  const apiKey = String(process.env.INFOBIP_API_KEY || '').trim();
  const baseUrl = String(process.env.INFOBIP_BASE_URL || '').trim().replace(/\/$/, '');

  if (!phone) return res.status(400).json({ ok:false, msg:'Escribe un número válido con prefijo de país' });
  if (!apiKey || !baseUrl) return res.status(503).json({ ok:false, msg:'El SMS de invitación aún no está activado en Infobip' });

  try {
    const response = await fetch(`${baseUrl}/sms/2/text/advanced`, {
      method: 'POST',
      headers: {
        Authorization: `App ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        messages: [{
          from: String(process.env.INFOBIP_SENDER || 'VOBIXCHAT').slice(0, 11),
          destinations: [{ to: phone }],
          text
        }]
      })
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('VOBIXCHAT INVITE SMS ERROR:', response.status, detail.slice(0, 500));
      return res.status(502).json({ ok:false, msg:'Infobip no pudo enviar la invitación' });
    }

    return res.json({ ok:true, message:'Invitación enviada por SMS' });
  } catch (error) {
    console.error('VOBIXCHAT INVITE SMS ERROR:', error.message);
    return res.status(502).json({ ok:false, msg:'No se pudo conectar con Infobip' });
  }
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
// REGISTRAR MÓVIL ANDROID NATIVO (FCM)
// El APK envía su token al iniciar sesión. El token nunca
// se entrega a otros usuarios y puede revocarse al salir.
// ======================================================

app.post(
  '/api/push/device',
  requireAuth,
  async (req, res) => {
    const token = String(req.body?.token || '').trim();
    const platform = String(req.body?.platform || 'android').slice(0, 40);
    const deviceName = String(req.body?.deviceName || '').slice(0, 150);

    if (!token || token.length < 30) {
      return res.status(400).json({ ok:false, msg:'Token de dispositivo no válido' });
    }

    try {
      await database.query(
        `
        INSERT INTO fcm_devices
          (user_id, token, platform, device_name, enabled, created_at, updated_at)
        VALUES ($1, $2, $3, $4, TRUE, NOW(), NOW())
        ON CONFLICT (token) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          platform = EXCLUDED.platform,
          device_name = EXCLUDED.device_name,
          enabled = TRUE,
          updated_at = NOW()
        `,
        [req.vobixUser.id, token, platform, deviceName || null]
      );

      return res.json({ ok:true, firebaseEnabled:firebasePushEnabled });
    } catch (error) {
      console.error('VOBIXCHAT FCM DEVICE ERROR:', error.message);
      return res.status(500).json({ ok:false, msg:'No se pudo registrar el móvil' });
    }
  }
);


async function sendFirebasePushToUser(targetUserId, payload) {
  if (!firebasePushEnabled || !targetUserId) return;

  try {
    const result = await database.query(
      `SELECT id, token FROM fcm_devices WHERE user_id=$1 AND enabled=TRUE`,
      [targetUserId]
    );

    const rows = result.rows.filter(row => row.token);
    if (!rows.length) return;

    const isCall = payload?.type === 'call' || payload?.type === 'video-call';
    const data = {};
    for (const [key, value] of Object.entries(payload || {})) {
      if (value !== undefined && value !== null) data[key] = String(value);
    }

    const message = {
      tokens: rows.map(row => row.token),
      data,
      android: {
        priority: isCall ? 'high' : 'normal',
        ttl: isCall ? 35000 : 3600000,
        notification: {
          channelId: isCall ? 'vobix_calls' : 'vobix_messages',
          sound: 'default',
          tag: isCall ? `vobix-call-${String(payload?.callId || '')}` : undefined
        }
      }
    };

    // Las llamadas son data-only: el APK crea la pantalla de Aceptar/Rechazar.
    // Los mensajes normales conservan la notificación de Android.
    if (!isCall) {
      message.notification = {
        title: String(payload?.title || 'VOBIXCHAT').slice(0, 80),
        body: String(payload?.body || 'Tienes una notificación').slice(0, 240)
      };
    }

    const response = await firebaseAdmin.messaging().sendEachForMulticast(message);

    const deadIds = [];
    response.responses.forEach((item, index) => {
      if (item.success) return;
      const code = String(item.error?.code || '');
      if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
        deadIds.push(rows[index].id);
      } else {
        console.error('VOBIXCHAT FCM SEND ERROR:', code || item.error?.message || 'unknown');
      }
    });

    if (deadIds.length) {
      await database.query(`DELETE FROM fcm_devices WHERE id = ANY($1::uuid[])`, [deadIds]);
    }

    await database.query(
      `UPDATE fcm_devices SET last_success_at=NOW(), failure_count=0 WHERE user_id=$1 AND enabled=TRUE`,
      [targetUserId]
    );
  } catch (error) {
    console.error('VOBIXCHAT FCM PUSH ERROR:', error.message);
  }
}


// ======================================================
// ENVIAR PUSH A UN USUARIO
// ======================================================

async function sendPushToUser(
  targetUserId,
  payload
) {

  if (
    (!pushEnabled && !firebasePushEnabled) ||
    !targetUserId
  ) {

    return;

  }


  if (pushEnabled) try {

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
          ),
          {
            TTL: (payload?.type === 'call' || payload?.type === 'video-call') ? 35 : 3600,
            urgency: (payload?.type === 'call' || payload?.type === 'video-call') ? 'high' : 'normal'
          }

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

  await sendFirebasePushToUser(targetUserId, payload);

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
        pushEnabled || firebasePushEnabled,

      firebaseEnabled:
        firebasePushEnabled

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
            (pushEnabled || firebasePushEnabled)
              ? 'ACTIVO'
              : 'PENDIENTE DE VAPID'
          }`
        );

        console.log(
          ` FIREBASE ANDROID: ${
            firebasePushEnabled
              ? 'ACTIVO'
              : 'PENDIENTE DE CONFIGURACIÓN'
          }`
        );

        console.log(
          '=========================================='
        );

        // Capa 140 — durante un despliegue Render mantiene por unos
        // segundos la instancia anterior. Si el proxy PostgreSQL está
        // lleno, escuchar primero permite que Render sustituya la
        // instancia antigua; el esquema se comprueba después con pausa
        // progresiva sin tumbar el servidor ni crear un bucle agresivo.
        initializeDatabaseWithRetry();

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

async function initializeDatabaseWithRetry(attempt = 1) {
  console.log(
    `VOBIXCHAT | INICIALIZANDO BASE DE DATOS (intento ${attempt})...`
  );

  try {
    const schemaReady = await initializeDatabase();
    if (!schemaReady) throw new Error('El esquema todavía no está disponible');

    await database.query('SELECT 1');
    console.log('VOBIXCHAT | BASE DE DATOS LISTA');
    console.log('VOBIXCHAT | POSTGRESQL CONECTADO');
  } catch (error) {
    const delayMs = Math.min(30000, 2000 * (2 ** Math.min(attempt - 1, 4)));
    console.error(
      `VOBIXCHAT | BASE DE DATOS OCUPADA; NUEVO INTENTO EN ${delayMs / 1000}s:`,
      error.message
    );
    const retryTimer = setTimeout(
      () => initializeDatabaseWithRetry(attempt + 1),
      delayMs
    );
    retryTimer.unref();
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
