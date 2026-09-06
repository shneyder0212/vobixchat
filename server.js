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

const {
  DESIGNED_CONCURRENT_CONNECTIONS,
  INTERACTIVE_ROOM_MAX_PARTICIPANTS,
  getVideoCapacity
} = require('./core/vobix-video-capacity');

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
    { fallthrough: true, maxAge: '1h' }
  )
);

// Una referencia antigua que ya no exista debe terminar en 404 limpio. No se
// envía la aplicación HTML como si fuera una foto y no se registra como fallo 500.
app.use('/uploads', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(404).json({
    ok: false,
    code: 'media_not_found',
    msg: 'El archivo solicitado no está disponible'
  });
});


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
// ADMINISTRACIÓN PRIVADA DEL PROPIETARIO
// ======================================================

function constantTimeEqual(left, right) {
  const leftHash = crypto.createHash('sha256').update(String(left || '')).digest();
  const rightHash = crypto.createHash('sha256').update(String(right || '')).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function ownerAdminConfigured() {
  return Boolean(
    String(config.ADMIN_OWNER_USER_ID || '').trim() ||
    normalizePhone(config.ADMIN_OWNER_PHONE || '')
  );
}

function isOwnerAdmin(user) {
  if (!user || !ownerAdminConfigured()) return false;

  const configuredId = String(config.ADMIN_OWNER_USER_ID || '').trim().toLowerCase();
  if (configuredId && constantTimeEqual(String(user.id || '').toLowerCase(), configuredId)) {
    return true;
  }

  const configuredPhone = normalizePhone(config.ADMIN_OWNER_PHONE || '');
  return Boolean(
    configuredPhone &&
    constantTimeEqual(normalizePhone(user.phone || ''), configuredPhone)
  );
}

function requireOwnerAdmin(req, res, next) {
  return requireAuth(req, res, () => {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (!ownerAdminConfigured()) {
      return res.status(503).json({
        ok: false,
        code: 'owner_admin_not_configured',
        msg: 'El acceso privado del propietario todavía no está configurado'
      });
    }

    if (!isOwnerAdmin(req.vobixUser)) {
      return res.status(403).json({
        ok: false,
        code: 'owner_only',
        msg: 'Acceso reservado al propietario de VobixChat'
      });
    }

    const reverifiedAt = req.vobixUser.security_reverified_at
      ? new Date(req.vobixUser.security_reverified_at).getTime()
      : 0;
    const maxAge = Math.max(5 * 60 * 1000, Number(config.ADMIN_REAUTH_MAX_AGE_MS) || 0);

    if (!reverifiedAt || Date.now() - reverifiedAt > maxAge) {
      return res.status(428).json({
        ok: false,
        code: 'admin_reauthentication_required',
        msg: 'Vuelva a verificar su cuenta para abrir el panel privado'
      });
    }

    return next();
  });
}

const ownerAdminRate = new Map();
const ownerAdminAudit = new Map();

function ownerAdminRateAllows(req) {
  const key = crypto.createHash('sha256')
    .update(`${req.vobixUser?.id || 'unknown'}|${getClientIp(req)}`)
    .digest('hex');
  const now = Date.now();
  const recent = (ownerAdminRate.get(key) || []).filter(time => now - time < 60 * 1000);
  if (recent.length >= 60) {
    ownerAdminRate.set(key, recent);
    return false;
  }
  recent.push(now);
  ownerAdminRate.set(key, recent);
  return true;
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
    ['