'use strict';

/*
==========================================================
 VOBIXCHAT SERVER
 server.js
 BLOQUE 1 DE 6

 INCLUYE:
 - Express
 - PostgreSQL / Supabase
 - Socket.IO
 - Web Push
 - VAPID
 - Multer
 - Uploads
 - Avatar
 - Sesiones
 - Autenticación
 - Registro / PIN
==========================================================
*/


// ======================================================
// DEPENDENCIAS
// ======================================================

const express = require('express');

const http = require('http');

const crypto = require('crypto');

const path = require('path');

const fs = require('fs');

const multer = require('multer');

const webpush = require('web-push');

const {
  Server
} = require('socket.io');


// ======================================================
// ARCHIVOS VOBIXCHAT
// ======================================================

const config =
  require('./config');

const database =
  require('./database/db');

const {
  initializeDatabase
} = require('./database/schema');

const {
  normalizePhone
} = require('./core/users');

const chatRoutes =
  require('./routes/chat');


// ======================================================
// APP / SERVIDOR
// ======================================================

const app =
  express();

const server =
  http.createServer(app);


// ======================================================
// SOCKET.IO
// ======================================================

const io =
  new Server(
    server,
    {

      cors: {

        origin: '*',

        methods: [
          'GET',
          'POST',
          'PUT',
          'PATCH',
          'DELETE'
        ]

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
    limit: '25mb'
  })
);

app.use(
  express.urlencoded({

    extended: true,

    limit: '25mb'

  })
);


// ======================================================
// CARPETA PUBLIC
// ======================================================

const publicDirectory =
  path.join(
    __dirname,
    'public'
  );


if (
  !fs.existsSync(
    publicDirectory
  )
) {

  fs.mkdirSync(
    publicDirectory,
    {
      recursive: true
    }
  );

}


app.use(
  express.static(
    publicDirectory
  )
);


// ======================================================
// CARPETA UPLOADS
// ======================================================

const uploadsDirectory =
  path.join(
    publicDirectory,
    'uploads'
  );


const avatarDirectory =
  path.join(
    uploadsDirectory,
    'avatars'
  );


const imageDirectory =
  path.join(
    uploadsDirectory,
    'images'
  );


[
  uploadsDirectory,
  avatarDirectory,
  imageDirectory
]
  .forEach(
    directory => {

      if (
        !fs.existsSync(
          directory
        )
      ) {

        fs.mkdirSync(
          directory,
          {
            recursive: true
          }
        );

      }

    }
  );


// ======================================================
// NOMBRE SEGURO PARA ARCHIVO
// ======================================================

function createSafeUploadName(
  file
) {

  let extension =
    path
      .extname(
        file.originalname || ''
      )
      .toLowerCase();


  if (
    !extension
  ) {

    const mime =
      String(
        file.mimetype || ''
      )
        .toLowerCase();


    if (
      mime === 'image/jpeg'
    ) {

      extension =
        '.jpg';

    } else if (
      mime === 'image/png'
    ) {

      extension =
        '.png';

    } else if (
      mime === 'image/webp'
    ) {

      extension =
        '.webp';

    } else if (
      mime === 'image/gif'
    ) {

      extension =
        '.gif';

    }

  }


  return (
    Date.now() +
    '-' +
    crypto
      .randomBytes(12)
      .toString('hex') +
    extension
  );

}


// ======================================================
// VALIDAR IMÁGENES
// ======================================================

function vobixImageFilter(
  req,
  file,
  callback
) {

  const allowedTypes =
    new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif'
    ]);


  if (
    !allowedTypes.has(
      String(
        file.mimetype || ''
      ).toLowerCase()
    )
  ) {

    return callback(
      new Error(
        'Solo se permiten imágenes JPG, PNG, WEBP o GIF'
      )
    );

  }


  return callback(
    null,
    true
  );

}


// ======================================================
// MULTER AVATAR
// ======================================================

const avatarStorage =
  multer.diskStorage({

    destination:
      (
        req,
        file,
        callback
      ) => {

        callback(
          null,
          avatarDirectory
        );

      },

    filename:
      (
        req,
        file,
        callback
      ) => {

        callback(
          null,
          createSafeUploadName(
            file
          )
        );

      }

  });


const uploadAvatar =
  multer({

    storage:
      avatarStorage,

    limits: {

      fileSize:
        10 * 1024 * 1024

    },

    fileFilter:
      vobixImageFilter

  });


// ======================================================
// MULTER IMÁGENES DE CHAT
// ======================================================

const imageStorage =
  multer.diskStorage({

    destination:
      (
        req,
        file,
        callback
      ) => {

        callback(
          null,
          imageDirectory
        );

      },

    filename:
      (
        req,
        file,
        callback
      ) => {

        callback(
          null,
          createSafeUploadName(
            file
          )
        );

      }

  });


const uploadChatImage =
  multer({

    storage:
      imageStorage,

    limits: {

      fileSize:
        15 * 1024 * 1024

    },

    fileFilter:
      vobixImageFilter

  });


// ======================================================
// WEB PUSH / VAPID
// ======================================================

const VAPID_PUBLIC_KEY =
  String(
    process.env.VAPID_PUBLIC_KEY ||
    ''
  ).trim();


const VAPID_PRIVATE_KEY =
  String(
    process.env.VAPID_PRIVATE_KEY ||
    ''
  ).trim();


const VAPID_SUBJECT =
  String(
    process.env.VAPID_SUBJECT ||
    'mailto:admin@vobixchat.com'
  ).trim();


let vobixPushEnabled =
  false;


if (
  VAPID_PUBLIC_KEY &&
  VAPID_PRIVATE_KEY
) {

  try {

    webpush.setVapidDetails(

      VAPID_SUBJECT,

      VAPID_PUBLIC_KEY,

      VAPID_PRIVATE_KEY

    );


    vobixPushEnabled =
      true;


    console.log(
      'VOBIXCHAT | WEB PUSH: READY'
    );


  } catch (error) {

    console.error(
      'VOBIXCHAT VAPID ERROR:',
      error.message
    );

  }


} else {

  console.warn(
    'VOBIXCHAT | WEB PUSH: VAPID KEYS NOT CONFIGURED'
  );

}


// ======================================================
// SEGURIDAD / PIN / SESIONES
// ======================================================

const pins = {};

const pendingUsers = {};

const sessions = {};


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

  return crypto
    .randomBytes(32)
    .toString('hex');

}


// ======================================================
// OBTENER TOKEN HTTP
// ======================================================

function getToken(
  req
) {

  const authorization =
    req.headers.authorization ||
    '';


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
// OBTENER SESIÓN
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
    getToken(
      req
    );


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

    pinData.attempts +=
      1;


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

        avatar_url:
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
      getToken(
        req
      );


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

          avatar_url:
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
      getToken(
        req
      );


    if (token) {

      delete sessions[token];

    }


    return res.json({
      ok: true
    });

  }
);


// ======================================================
// CLAVE PÚBLICA VAPID
// ======================================================

app.get(
  '/api/push/public-key',
  (
    req,
    res
  ) => {

    if (
      !vobixPushEnabled
    ) {

      return res
        .status(503)
        .json({

          ok: false,

          msg:
            'Web Push todavía no está configurado en el servidor'

        });

    }


    return res.json({

      ok: true,

      publicKey:
        VAPID_PUBLIC_KEY

    });

  }
);


// ======================================================
// FOTO DE PERFIL
// ======================================================

app.post(
  '/api/profile/avatar',

  requireAuth,

  uploadAvatar.single(
    'avatar'
  ),

  async (
    req,
    res
  ) => {

    try {

      if (!req.file) {

        return res
          .status(400)
          .json({

            ok: false,

            msg:
              'Selecciona una foto'

          });

      }


      const avatarUrl =
        `/uploads/avatars/${req.file.filename}`;


      const result =
        await database.query(
          `
            UPDATE users

            SET
              avatar_url = $1,
              updated_at = NOW()

            WHERE id = $2

            RETURNING
              id,
              username,
              phone,
              vobix_id,
              avatar_url
          `,
          [
            avatarUrl,
            req.vobixUser.id
          ]
        );


      const updatedUser =
        result.rows[0];


      /*
        Actualizamos también los sockets
        que ya estén conectados.
      */

      io
        .to(
          `user:${req.vobixUser.id}`
        )
        .emit(
          'profile_updated',
          {

            userId:
              req.vobixUser.id,

            avatar_url:
              avatarUrl,

            avatarUrl:
              avatarUrl

          }
        );


      return res.json({

        ok: true,

        avatar_url:
          avatarUrl,

        avatarUrl:
          avatarUrl,

        url:
          avatarUrl,

        user: {

          id:
            updatedUser.id,

          username:
            updatedUser.username,

          phone:
            updatedUser.phone,

          vobixId:
            updatedUser.vobix_id,

          avatar_url:
            updatedUser.avatar_url,

          avatarUrl:
            updatedUser.avatar_url

        }

      });


    } catch (error) {

      console.error(
        'VOBIXCHAT AVATAR UPLOAD ERROR:',
        error
      );


      return res
        .status(500)
        .json({

          ok: false,

          msg:
            'No se pudo guardar la foto de perfil'

        });

    }

  }
);


// ======================================================
// ELIMINAR FOTO DE PERFIL
// ======================================================

app.delete(
  '/api/profile/avatar',

  requireAuth,

  async (
    req,
    res
  ) => {

    try {

      const oldAvatar =
        req.vobixUser.avatar_url;


      await database.query(
        `
          UPDATE users

          SET
            avatar_url = NULL,
            updated_at = NOW()

          WHERE id = $1
        `,
        [
          req.vobixUser.id
        ]
      );


      /*
        Intentamos eliminar solamente archivos
        locales de /uploads/avatars.
      */

      if (
        oldAvatar &&
        String(oldAvatar).startsWith(
          '/uploads/avatars/'
        )
      ) {

        const filename =
          path.basename(
            oldAvatar
          );


        const localFile =
          path.join(
            avatarDirectory,
            filename
          );


        fs.unlink(
          localFile,
          () => {}
        );

      }


      io
        .to(
          `user:${req.vobixUser.id}`
        )
        .emit(
          'profile_updated',
          {

            userId:
              req.vobixUser.id,

            avatar_url:
              null,

            avatarUrl:
              null

          }
        );


      return res.json({

        ok: true,

        avatar_url:
          null,

        avatarUrl:
          null

      });


    } catch (error) {

      console.error(
        'VOBIXCHAT AVATAR DELETE ERROR:',
        error
      );


      return res
        .status(500)
        .json({

          ok: false,

          msg:
            'No se pudo quitar la foto de perfil'

        });

    }

  }
);


// ======================================================
// SUBIR FOTO DEL CHAT
// ======================================================

app.post(
  '/api/upload/image',

  requireAuth,

  uploadChatImage.single(
    'image'
  ),

  (
    req,
    res
  ) => {

    if (!req.file) {

      return res
        .status(400)
        .json({

          ok: false,

          msg:
            'Selecciona una imagen'

        });

    }


    const imageUrl =
      `/uploads/images/${req.file.filename}`;


    return res.json({

      ok: true,

      url:
        imageUrl,

      image_url:
        imageUrl,

      imageUrl:
        imageUrl

    });

  }
);


// ======================================================
// API PRIVADA EXISTENTE
// ======================================================

app.use(
  '/api/chat',
  requireAuth,
  chatRoutes
);


// ======================================================
// FIN BLOQUE 1 DE 6
//
// NO PONGAS server.listen().
// NO CIERRES EL ARCHIVO.
// BLOQUE 2 CONTINÚA EXACTAMENTE DEBAJO.
// ======================================================
/* =========================================================
   VOBIXCHAT SERVER
   server.js
   BLOQUE 2 DE 6

   - TABLA PUSH_SUBSCRIPTIONS
   - REGISTRO DE DISPOSITIVOS
   - VARIOS DISPOSITIVOS POR USUARIO
   - /api/push/subscribe
   - /api/push/unsubscribe
   - ENVÍO WEB PUSH
   - LIMPIEZA DE SUSCRIPCIONES INVÁLIDAS
   ========================================================= */


/* =========================================================
   CREAR TABLA DE SUSCRIPCIONES PUSH

   Esto se ejecuta al arrancar el servidor.
   IF NOT EXISTS evita borrar datos existentes.
   ========================================================= */

async function ensureVobixPushSubscriptionsTable() {

  try {

    await database.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions
      (
        id BIGSERIAL PRIMARY KEY,

        user_id BIGINT NOT NULL,

        endpoint TEXT NOT NULL UNIQUE,

        p256dh TEXT NOT NULL,

        auth TEXT NOT NULL,

        platform VARCHAR(40),

        device_name VARCHAR(255),

        user_agent TEXT,

        created_at TIMESTAMPTZ
          NOT NULL DEFAULT NOW(),

        updated_at TIMESTAMPTZ
          NOT NULL DEFAULT NOW()
      )
    `);


    await database.query(`
      CREATE INDEX IF NOT EXISTS
        idx_push_subscriptions_user_id

      ON push_subscriptions
      (
        user_id
      )
    `);


    console.log(
      'VOBIXCHAT | PUSH TABLE: READY'
    );


  } catch (error) {

    console.error(
      'VOBIXCHAT PUSH TABLE ERROR:',
      error
    );

    /*
      No tumbamos todo el servidor por Push.
      El chat puede seguir funcionando.
    */

  }

}


/* =========================================================
   NORMALIZAR SUSCRIPCIÓN RECIBIDA
   ========================================================= */

function normalizeVobixPushSubscription(
  input
) {

  if (
    !input ||
    typeof input !== 'object'
  ) {

    return null;

  }


  const endpoint =
    String(
      input.endpoint ||
      ''
    ).trim();


  const p256dh =
    String(
      input.keys?.p256dh ||
      input.p256dh ||
      ''
    ).trim();


  const auth =
    String(
      input.keys?.auth ||
      input.auth ||
      ''
    ).trim();


  if (
    !endpoint ||
    !p256dh ||
    !auth
  ) {

    return null;

  }


  /*
    Web Push endpoints reales son HTTPS.
  */

  let endpointUrl;


  try {

    endpointUrl =
      new URL(
        endpoint
      );

  } catch (error) {

    return null;

  }


  if (
    endpointUrl.protocol !==
    'https:'
  ) {

    return null;

  }


  return {

    endpoint,

    keys: {

      p256dh,

      auth

    }

  };

}


/* =========================================================
   GUARDAR / ACTUALIZAR SUSCRIPCIÓN
   ========================================================= */

async function saveVobixServerPushSubscription(
  userId,
  subscription,
  metadata = {}
) {

  const normalized =
    normalizeVobixPushSubscription(
      subscription
    );


  if (!normalized) {

    throw new Error(
      'Suscripción Push inválida'
    );

  }


  const platform =
    String(
      metadata.platform ||
      'web'
    )
      .trim()
      .slice(
        0,
        40
      );


  const deviceName =
    String(
      metadata.deviceName ||
      metadata.device_name ||
      ''
    )
      .trim()
      .slice(
        0,
        255
      );


  const userAgent =
    String(
      metadata.userAgent ||
      metadata.user_agent ||
      ''
    )
      .trim()
      .slice(
        0,
        2000
      );


  /*
    endpoint es UNIQUE.

    Si el navegador ya estaba registrado,
    actualizamos claves y lo asociamos al
    usuario actualmente autenticado.
  */

  const result =
    await database.query(
      `
        INSERT INTO push_subscriptions
        (
          user_id,
          endpoint,
          p256dh,
          auth,
          platform,
          device_name,
          user_agent,
          created_at,
          updated_at
        )

        VALUES
        (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          NOW(),
          NOW()
        )

        ON CONFLICT (endpoint)

        DO UPDATE SET

          user_id =
            EXCLUDED.user_id,

          p256dh =
            EXCLUDED.p256dh,

          auth =
            EXCLUDED.auth,

          platform =
            EXCLUDED.platform,

          device_name =
            EXCLUDED.device_name,

          user_agent =
            EXCLUDED.user_agent,

          updated_at =
            NOW()

        RETURNING
          id,
          user_id,
          endpoint,
          platform,
          device_name,
          created_at,
          updated_at
      `,
      [
        userId,
        normalized.endpoint,
        normalized.keys.p256dh,
        normalized.keys.auth,
        platform,
        deviceName,
        userAgent
      ]
    );


  return result.rows[0];

}


/* =========================================================
   BORRAR SUSCRIPCIÓN POR ENDPOINT
   ========================================================= */

async function deleteVobixPushSubscription(
  endpoint,
  userId = null
) {

  if (!endpoint) {

    return 0;

  }


  let result;


  if (userId) {

    result =
      await database.query(
        `
          DELETE FROM push_subscriptions

          WHERE endpoint = $1
            AND user_id = $2
        `,
        [
          endpoint,
          userId
        ]
      );


  } else {

    /*
      Uso interno del servidor cuando el proveedor
      Push nos dice que la suscripción ya murió.
    */

    result =
      await database.query(
        `
          DELETE FROM push_subscriptions

          WHERE endpoint = $1
        `,
        [
          endpoint
        ]
      );

  }


  return result.rowCount || 0;

}


/* =========================================================
   OBTENER SUSCRIPCIONES DE UN USUARIO
   ========================================================= */

async function getVobixUserPushSubscriptions(
  userId
) {

  const result =
    await database.query(
      `
        SELECT
          id,
          user_id,
          endpoint,
          p256dh,
          auth,
          platform,
          device_name,
          user_agent,
          created_at,
          updated_at

        FROM push_subscriptions

        WHERE user_id = $1

        ORDER BY updated_at DESC
      `,
      [
        userId
      ]
    );


  return result.rows;

}


/* =========================================================
   CONVERTIR FILA DB A FORMATO WEB-PUSH
   ========================================================= */

function pushRowToWebPushSubscription(
  row
) {

  return {

    endpoint:
      row.endpoint,

    keys: {

      p256dh:
        row.p256dh,

      auth:
        row.auth

    }

  };

}


/* =========================================================
   ¿ERROR SIGNIFICA SUSCRIPCIÓN MUERTA?
   ========================================================= */

function isDeadVobixPushSubscription(
  error
) {

  const statusCode =
    Number(
      error?.statusCode ||
      error?.status ||
      0
    );


  /*
    404 / 410:
    endpoint eliminado o expirado.
  */

  return (
    statusCode === 404 ||
    statusCode === 410
  );

}


/* =========================================================
   CONSTRUIR PAYLOAD PUSH
   ========================================================= */

function createVobixPushPayload(
  payload = {}
) {

  /*
    Mantenerlo pequeño.

    Push no debe transportar mensajes enormes,
    archivos, SDP WebRTC ni ICE candidates.
  */

  const data = {

    type:
      String(
        payload.type ||
        'message'
      ),

    title:
      String(
        payload.title ||
        'VOBIXCHAT'
      ),

    body:
      String(
        payload.body ||
        ''
      ),

    tag:
      String(
        payload.tag ||
        ''
      ),

    url:
      String(
        payload.url ||
        '/chat.html'
      ),

    conversationId:
      payload.conversationId ||
      payload.conversation_id ||
      null,

    messageId:
      payload.messageId ||
      payload.message_id ||
      null,

    fromUserId:
      payload.fromUserId ||
      payload.senderId ||
      payload.from ||
      null,

    callerId:
      payload.callerId ||
      payload.caller_id ||
      null,

    callerName:
      String(
        payload.callerName ||
        payload.caller_name ||
        ''
      ),

    callId:
      payload.callId ||
      payload.call_id ||
      null,

    callType:
      payload.callType ||
      payload.call_type ||
      null,

    icon:
      String(
        payload.icon ||
        '/icons/icon-192.png'
      ),

    badge:
      String(
        payload.badge ||
        '/icons/badge-96.png'
      ),

    timestamp:
      Date.now()

  };


  /*
    Eliminar campos null/undefined para reducir tamaño.
  */

  Object
    .keys(data)
    .forEach(
      key => {

        if (
          data[key] === null ||
          data[key] === undefined ||
          data[key] === ''
        ) {

          delete data[key];

        }

      }
    );


  return data;

}


/* =========================================================
   ENVIAR PUSH A UN USUARIO

   Devuelve resumen:
   {
     total,
     sent,
     failed,
     removed
   }
   ========================================================= */

async function sendVobixPushToUser(
  userId,
  payload = {}
) {

  const result = {

    total:
      0,

    sent:
      0,

    failed:
      0,

    removed:
      0

  };


  if (
    !vobixPushEnabled
  ) {

    return result;

  }


  if (!userId) {

    return result;

  }


  let subscriptions;


  try {

    subscriptions =
      await getVobixUserPushSubscriptions(
        userId
      );


  } catch (error) {

    console.error(
      'VOBIXCHAT PUSH DB READ ERROR:',
      error
    );


    return result;

  }


  result.total =
    subscriptions.length;


  if (
    subscriptions.length === 0
  ) {

    return result;

  }


  const pushPayload =
    createVobixPushPayload(
      payload
    );


  let body;


  try {

    body =
      JSON.stringify(
        pushPayload
      );

  } catch (error) {

    console.error(
      'VOBIXCHAT PUSH PAYLOAD ERROR:',
      error
    );


    return result;

  }


  /*
    Mandamos a todos los dispositivos
    registrados del usuario.
  */

  await Promise.allSettled(

    subscriptions.map(

      async row => {

        const subscription =
          pushRowToWebPushSubscription(
            row
          );


        try {

          await webpush
            .sendNotification(
              subscription,
              body,
              {

                /*
                  TTL corto para llamadas.
                  TTL mayor para mensajes.
                */

                TTL:
                  (
                    pushPayload.type ===
                      'call' ||
                    pushPayload.type ===
                      'video-call' ||
                    pushPayload.type ===
                      'incoming-call'
                  )
                    ? 60
                    : 3600,

                urgency:
                  (
                    pushPayload.type ===
                      'call' ||
                    pushPayload.type ===
                      'video-call' ||
                    pushPayload.type ===
                      'incoming-call'
                  )
                    ? 'high'
                    : 'normal'

              }
            );


          result.sent +=
            1;


        } catch (error) {

          result.failed +=
            1;


          /*
            El proveedor nos confirma que
            este endpoint ya no sirve.
          */

          if (
            isDeadVobixPushSubscription(
              error
            )
          ) {

            try {

              await deleteVobixPushSubscription(
                row.endpoint
              );


              result.removed +=
                1;


              console.log(
                'VOBIXCHAT | PUSH ENDPOINT EXPIRED: REMOVED'
              );


            } catch (deleteError) {

              console.error(
                'VOBIXCHAT PUSH CLEANUP ERROR:',
                deleteError
              );

            }


            return;

          }


          console.error(
            'VOBIXCHAT PUSH SEND ERROR:',
            {
              statusCode:
                error?.statusCode,

              body:
                error?.body,

              message:
                error?.message
            }
          );

        }

      }

    )

  );


  return result;

}


/* =========================================================
   PUSH DE MENSAJE
   ========================================================= */

async function sendVobixMessagePush(
  receiverId,
  {
    senderId = null,
    senderName = 'Nuevo mensaje',
    conversationId = null,
    messageId = null,
    preview = 'Tienes un mensaje nuevo'
  } = {}
) {

  const safePreview =
    String(
      preview ||
      'Tienes un mensaje nuevo'
    )
      .replace(
        /\s+/g,
        ' '
      )
      .trim()
      .slice(
        0,
        180
      );


  return sendVobixPushToUser(
    receiverId,
    {

      type:
        'message',

      title:
        String(
          senderName ||
          'VOBIXCHAT'
        )
          .slice(
            0,
            80
          ),

      body:
        safePreview,

      tag:
        conversationId
          ? `vobix-chat-${conversationId}`
          : 'vobix-message',

      url:
        conversationId
          ? (
              '/chat.html?conversation=' +
              encodeURIComponent(
                conversationId
              )
            )
          : '/chat.html',

      conversationId,

      messageId,

      fromUserId:
        senderId

    }
  );

}


/* =========================================================
   PUSH DE LLAMADA
   ========================================================= */

async function sendVobixCallPush(
  receiverId,
  {
    callerId = null,
    callerName = 'Usuario',
    callId = null,
    callType = 'audio',
    conversationId = null
  } = {}
) {

  const normalizedCallType =
    String(
      callType ||
      'audio'
    )
      .toLowerCase()
      .includes(
        'video'
      )
        ? 'video'
        : 'audio';


  const pushType =
    normalizedCallType ===
      'video'
      ? 'video-call'
      : 'call';


  const title =
    normalizedCallType ===
      'video'
      ? 'Videollamada entrante'
      : 'Llamada entrante';


  const caller =
    String(
      callerName ||
      'Usuario'
    )
      .trim()
      .slice(
        0,
        80
      );


  const params =
    new URLSearchParams();


  params.set(
    'incomingCall',
    '1'
  );


  if (callId) {

    params.set(
      'call',
      String(
        callId
      )
    );

  }


  params.set(
    'callType',
    normalizedCallType
  );


  if (callerId) {

    params.set(
      'from',
      String(
        callerId
      )
    );

  }


  if (conversationId) {

    params.set(
      'conversation',
      String(
        conversationId
      )
    );

  }


  return sendVobixPushToUser(
    receiverId,
    {

      type:
        pushType,

      title,

      body:
        `${caller} te está llamando`,

      tag:
        callId
          ? `vobix-call-${callId}`
          : `vobix-call-${receiverId}`,

      url:
        `/chat.html?${params.toString()}`,

      callerId,

      callerName:
        caller,

      callId,

      callType:
        normalizedCallType,

      conversationId

    }
  );

}


/* =========================================================
   RUTA: REGISTRAR DISPOSITIVO PUSH
   ========================================================= */

app.post(
  '/api/push/subscribe',

  requireAuth,

  async (
    req,
    res
  ) => {

    try {

      if (
        !vobixPushEnabled
      ) {

        return res
          .status(503)
          .json({

            ok: false,

            msg:
              'Web Push no está configurado en el servidor'

          });

      }


      const subscription =
        normalizeVobixPushSubscription(
          req.body.subscription ||
          req.body
        );


      if (!subscription) {

        return res
          .status(400)
          .json({

            ok: false,

            msg:
              'Suscripción Push inválida'

          });

      }


      const saved =
        await saveVobixServerPushSubscription(
          req.vobixUser.id,
          subscription,
          {

            platform:
              req.body.platform,

            deviceName:
              req.body.deviceName ||
              req.body.device_name,

            userAgent:
              req.body.userAgent ||
              req.headers[
                'user-agent'
              ]

          }
        );


      console.log(
        `VOBIXCHAT | PUSH DEVICE REGISTERED | USER ${req.vobixUser.id}`
      );


      return res.json({

        ok: true,

        subscription: {

          id:
            saved.id,

          platform:
            saved.platform,

          deviceName:
            saved.device_name,

          createdAt:
            saved.created_at,

          updatedAt:
            saved.updated_at

        }

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
            'No se pudo registrar este dispositivo para notificaciones'

        });

    }

  }
);


/* =========================================================
   RUTA: DESREGISTRAR DISPOSITIVO PUSH
   ========================================================= */

app.delete(
  '/api/push/unsubscribe',

  requireAuth,

  async (
    req,
    res
  ) => {

    try {

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
              'Falta endpoint Push'

          });

      }


      const deleted =
        await deleteVobixPushSubscription(
          endpoint,
          req.vobixUser.id
        );


      return res.json({

        ok: true,

        deleted:
          deleted > 0

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
            'No se pudo eliminar la suscripción Push'

        });

    }

  }
);


/* =========================================================
   RUTA OPCIONAL: ESTADO DE PUSH DEL USUARIO
   ========================================================= */

app.get(
  '/api/push/status',

  requireAuth,

  async (
    req,
    res
  ) => {

    try {

      const subscriptions =
        await getVobixUserPushSubscriptions(
          req.vobixUser.id
        );


      return res.json({

        ok: true,

        enabled:
          vobixPushEnabled,

        devices:
          subscriptions.map(
            row => ({

              id:
                row.id,

              platform:
                row.platform,

              deviceName:
                row.device_name,

              createdAt:
                row.created_at,

              updatedAt:
                row.updated_at

            })
          )

      });


    } catch (error) {

      console.error(
        'VOBIXCHAT PUSH STATUS ERROR:',
        error
      );


      return res
        .status(500)
        .json({

          ok: false,

          msg:
            'No se pudo comprobar Push'

        });

    }

  }
);


/* =========================================================
   TEST PUSH DEL DISPOSITIVO ACTUAL
   ========================================================= */

app.post(
  '/api/push/test',

  requireAuth,

  async (
    req,
    res
  ) => {

    try {

      const result =
        await sendVobixPushToUser(
          req.vobixUser.id,
          {

            type:
              'message',

            title:
              'VOBIXCHAT',

            body:
              '🔔 Las notificaciones Push están funcionando.',

            tag:
              `vobix-test-${Date.now()}`,

            url:
              '/chat.html'

          }
        );


      return res.json({

        ok:
          result.sent > 0,

        ...result

      });


    } catch (error) {

      console.error(
        'VOBIXCHAT PUSH TEST ERROR:',
        error
      );


      return res
        .status(500)
        .json({

          ok: false,

          msg:
            'No se pudo enviar la notificación de prueba'

        });

    }

  }
);


/* =========================================================
   EXPONER FUNCIONES INTERNAMENTE EN EXPRESS
   ========================================================= */

app.set(
  'vobixSendPushToUser',
  sendVobixPushToUser
);


app.set(
  'vobixSendMessagePush',
  sendVobixMessagePush
);


app.set(
  'vobixSendCallPush',
  sendVobixCallPush
);


/* =========================================================
   PREPARAR TABLA PUSH AL ARRANCAR

   Más adelante, en el BLOQUE 6, esperamos también
   initializeDatabase() antes de abrir el puerto.

   Esta promesa se guarda aquí para no ejecutar la
   creación varias veces.
   ========================================================= */

let vobixPushDatabaseReadyPromise =
  null;


function prepareVobixPushDatabase() {

  if (
    !vobixPushDatabaseReadyPromise
  ) {

    vobixPushDatabaseReadyPromise =
      ensureVobixPushSubscriptionsTable();

  }


  return vobixPushDatabaseReadyPromise;

}


/* =========================================================
   NO ESPERAMOS AQUÍ TODAVÍA.

   BLOQUE 6 hará:

   await initializeDatabase();
   await prepareVobixPushDatabase();

   antes de server.listen().
   ========================================================= */


/* =========================================================
   FIN SERVER.JS
   BLOQUE 2 DE 6

   NO PONGAS server.listen().
   NO CIERRES EL ARCHIVO.

   BLOQUE 3 CONTINÚA DIRECTAMENTE DEBAJO.
   ========================================================= */
/* =========================================================
   VOBIXCHAT SERVER
   server.js
   BLOQUE 3 DE 6

   - SOCKET.IO
   - AUTENTICACIÓN DE SOCKET
   - USUARIOS ONLINE / OFFLINE
   - ROOMS POR USUARIO
   - MENSAJES EN TIEMPO REAL
   - PUSH DE MENSAJES
   - FOTO DE PERFIL EN SOCKET
   - RECONEXIÓN
   ========================================================= */


/* =========================================================
   SOCKETS ACTIVOS

   Un usuario puede tener:
   - iPhone
   - PC
   - otro navegador

   Por eso guardamos varios sockets por usuario.
   ========================================================= */

const vobixUserSockets =
  new Map();


/* =========================================================
   SOCKET -> USUARIO
   ========================================================= */

const vobixSocketUsers =
  new Map();


/* =========================================================
   AÑADIR SOCKET DE USUARIO
   ========================================================= */

function addVobixUserSocket(
  userId,
  socketId
) {

  const key =
    String(
      userId
    );


  if (
    !vobixUserSockets.has(
      key
    )
  ) {

    vobixUserSockets.set(
      key,
      new Set()
    );

  }


  vobixUserSockets
    .get(
      key
    )
    .add(
      socketId
    );


  vobixSocketUsers.set(
    socketId,
    key
  );

}


/* =========================================================
   QUITAR SOCKET DE USUARIO
   ========================================================= */

function removeVobixUserSocket(
  socketId
) {

  const userId =
    vobixSocketUsers.get(
      socketId
    );


  if (!userId) {

    return null;

  }


  vobixSocketUsers.delete(
    socketId
  );


  const sockets =
    vobixUserSockets.get(
      userId
    );


  if (sockets) {

    sockets.delete(
      socketId
    );


    if (
      sockets.size === 0
    ) {

      vobixUserSockets.delete(
        userId
      );

    }

  }


  return userId;

}


/* =========================================================
   ¿USUARIO TIENE SOCKET ACTIVO?
   ========================================================= */

function isVobixUserSocketOnline(
  userId
) {

  if (!userId) {

    return false;

  }


  const sockets =
    vobixUserSockets.get(
      String(
        userId
      )
    );


  return Boolean(
    sockets &&
    sockets.size > 0
  );

}


/* =========================================================
   NÚMERO DE DISPOSITIVOS CONECTADOS
   ========================================================= */

function getVobixUserSocketCount(
  userId
) {

  const sockets =
    vobixUserSockets.get(
      String(
        userId
      )
    );


  return sockets
    ? sockets.size
    : 0;

}


/* =========================================================
   ROOM PRIVADA DEL USUARIO
   ========================================================= */

function getVobixUserRoom(
  userId
) {

  return (
    `user:${userId}`
  );

}


/* =========================================================
   OBTENER TOKEN DEL HANDSHAKE SOCKET
   ========================================================= */

function getVobixSocketToken(
  socket
) {

  /*
    Forma recomendada:

    io({
      auth: {
        token: localStorage.getItem('token')
      }
    })
  */

  const authToken =
    socket.handshake
      ?.auth
      ?.token;


  if (
    authToken
  ) {

    return String(
      authToken
    ).trim();

  }


  /*
    Compatibilidad si el cliente manda
    Authorization en headers.
  */

  const authorization =
    String(
      socket.handshake
        ?.headers
        ?.authorization ||
      ''
    );


  if (
    authorization.startsWith(
      'Bearer '
    )
  ) {

    return authorization
      .slice(7)
      .trim();

  }


  /*
    Compatibilidad con query antigua.
  */

  const queryToken =
    socket.handshake
      ?.query
      ?.token;


  if (
    queryToken
  ) {

    return String(
      queryToken
    ).trim();

  }


  return '';

}


/* =========================================================
   AUTENTICAR SOCKET.IO
   ========================================================= */

io.use(
  async (
    socket,
    next
  ) => {

    try {

      cleanExpiredSessions();


      const token =
        getVobixSocketToken(
          socket
        );


      const session =
        getSessionByToken(
          token
        );


      /*
        IMPORTANTE:

        Permitimos conectar el socket aunque todavía
        no haya token para mantener compatibilidad
        con versiones anteriores del chat.

        En ese caso tendrá que identificarse después
        mediante register_user / user_online.

        Los eventos privados sensibles comprueban
        socket.vobixUser antes de actuar.
      */

      if (!session) {

        socket.vobixAuthenticated =
          false;


        socket.vobixToken =
          null;


        socket.vobixUser =
          null;


        return next();

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
        result.rows.length === 0 ||
        !result.rows[0].verified
      ) {

        socket.vobixAuthenticated =
          false;


        socket.vobixUser =
          null;


        return next();

      }


      socket.vobixAuthenticated =
        true;


      socket.vobixToken =
        token;


      socket.vobixUser =
        result.rows[0];


      return next();


    } catch (error) {

      console.error(
        'VOBIXCHAT SOCKET AUTH ERROR:',
        error
      );


      /*
        No tumbamos toda la conexión por
        un error temporal de autenticación.
      */

      socket.vobixAuthenticated =
        false;


      socket.vobixUser =
        null;


      return next();

    }

  }
);


/* =========================================================
   MARCAR USUARIO ONLINE
   ========================================================= */

async function markVobixUserOnline(
  userId
) {

  if (!userId) {

    return;

  }


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

}


/* =========================================================
   MARCAR USUARIO OFFLINE

   Solo debe ponerse offline cuando NO quede
   ningún socket de ese usuario.
   ========================================================= */

async function markVobixUserOffline(
  userId
) {

  if (!userId) {

    return;

  }


  if (
    isVobixUserSocketOnline(
      userId
    )
  ) {

    return;

  }


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

}


/* =========================================================
   PUBLICAR PRESENCIA
   ========================================================= */

function broadcastVobixPresence(
  userId,
  online
) {

  io.emit(
    'presence_update',
    {

      userId,

      online:
        Boolean(
          online
        ),

      lastSeen:
        new Date()
          .toISOString()

    }
  );


  /*
    Alias por compatibilidad.
  */

  io.emit(
    'user_presence',
    {

      userId,

      online:
        Boolean(
          online
        )

    }
  );

}


/* =========================================================
   OBTENER USUARIO POR ID
   ========================================================= */

async function getVobixUserById(
  userId
) {

  if (!userId) {

    return null;

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
        userId
      ]
    );


  return (
    result.rows[0] ||
    null
  );

}


/* =========================================================
   NORMALIZAR ID NUMÉRICO
   ========================================================= */

function normalizeVobixUserId(
  value
) {

  const id =
    Number(
      value
    );


  if (
    !Number.isInteger(
      id
    ) ||
    id <= 0
  ) {

    return null;

  }


  return id;

}


/* =========================================================
   OBTENER DESTINATARIO DE MENSAJE
   ========================================================= */

function getVobixMessageReceiverId(
  data = {}
) {

  return normalizeVobixUserId(

    data.to ||
    data.receiverId ||
    data.receiver_id ||
    data.recipientId ||
    data.recipient_id ||
    data.toUserId ||
    data.userId

  );

}


/* =========================================================
   TIPO DE MENSAJE
   ========================================================= */

function normalizeVobixMessageType(
  data = {}
) {

  const type =
    String(
      data.type ||
      data.messageType ||
      data.message_type ||
      'text'
    )
      .trim()
      .toLowerCase();


  if (
    type === 'image' ||
    type === 'photo'
  ) {

    return 'image';

  }


  if (
    type === 'audio' ||
    type === 'voice' ||
    type === 'voice-note' ||
    type === 'voice_note'
  ) {

    return 'audio';

  }


  return 'text';

}


/* =========================================================
   PREVIEW DE MENSAJE PARA PUSH
   ========================================================= */

function createVobixMessagePreview(
  data = {}
) {

  const type =
    normalizeVobixMessageType(
      data
    );


  if (
    type === 'image'
  ) {

    return '📷 Foto';

  }


  if (
    type === 'audio'
  ) {

    return '🎤 Nota de voz';

  }


  const content =
    String(
      data.content ||
      data.message ||
      data.text ||
      ''
    )
      .replace(
        /\s+/g,
        ' '
      )
      .trim();


  if (!content) {

    return 'Nuevo mensaje';

  }


  return content
    .slice(
      0,
      180
    );

}


/* =========================================================
   EMITIR MENSAJE AL DESTINATARIO
   ========================================================= */

function emitVobixMessageToReceiver(
  receiverId,
  message
) {

  const room =
    getVobixUserRoom(
      receiverId
    );


  /*
    Evento principal.
  */

  io
    .to(
      room
    )
    .emit(
      'new_message',
      message
    );


  /*
    No emitimos cinco alias diferentes aquí porque
    el BLOQUE 5 de chat.html escucha varios alias.

    Si emitiéramos todos a la vez, el teléfono podría
    reproducir el sonido varias veces para un solo mensaje.
  */

}


/* =========================================================
   EMITIR CONFIRMACIÓN AL EMISOR
   ========================================================= */

function emitVobixMessageConfirmation(
  socket,
  message
) {

  socket.emit(
    'message_sent',
    message
  );

}


/* =========================================================
   GUARDAR MENSAJE

   Intentamos utilizar la tabla messages.

   Si tu schema ya la creó con estos campos,
   queda persistido aquí.

   Los BLOQUES siguientes mantendrán también
   compatibilidad con las rutas de chat existentes.
   ========================================================= */

async function saveVobixSocketMessage(
  {
    senderId,
    receiverId,
    conversationId = null,
    type = 'text',
    content = '',
    imageUrl = null,
    audioUrl = null
  }
) {

  /*
    Primero intentamos el esquema completo.
  */

  try {

    const result =
      await database.query(
        `
          INSERT INTO messages
          (
            sender_id,
            receiver_id,
            conversation_id,
            message_type,
            content,
            image_url,
            audio_url,
            created_at
          )

          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            NOW()
          )

          RETURNING *
        `,
        [
          senderId,
          receiverId,
          conversationId,
          type,
          content,
          imageUrl,
          audioUrl
        ]
      );


    return result.rows[0];


  } catch (firstError) {

    /*
      Compatibilidad con esquemas antiguos que
      solamente tengan sender_id, receiver_id,
      content y created_at.
    */

    try {

      const fallbackContent =
        type === 'image'
          ? (
              imageUrl ||
              content
            )
          : type === 'audio'
            ? (
                audioUrl ||
                content
              )
            : content;


      const result =
        await database.query(
          `
            INSERT INTO messages
            (
              sender_id,
              receiver_id,
              content,
              created_at
            )

            VALUES
            (
              $1,
              $2,
              $3,
              NOW()
            )

            RETURNING *
          `,
          [
            senderId,
            receiverId,
            fallbackContent
          ]
        );


      return result.rows[0];


    } catch (fallbackError) {

      console.error(
        'VOBIXCHAT MESSAGE SAVE ERROR:',
        fallbackError.message
      );


      /*
        No fingimos que se guardó.

        El caller decidirá si devuelve error.
      */

      throw fallbackError;

    }

  }

}


/* =========================================================
   PROCESAR MENSAJE DE SOCKET
   ========================================================= */

async function handleVobixSocketMessage(
  socket,
  data = {},
  callback = null
) {

  try {

    /*
      El emisor debe estar autenticado.
    */

    if (
      !socket.vobixUser?.id
    ) {

      const response = {

        ok: false,

        error:
          'UNAUTHENTICATED',

        msg:
          'Debes iniciar sesión'

      };


      socket.emit(
        'message_error',
        response
      );


      if (
        typeof callback ===
        'function'
      ) {

        callback(
          response
        );

      }


      return;

    }


    const senderId =
      normalizeVobixUserId(
        socket.vobixUser.id
      );


    const receiverId =
      getVobixMessageReceiverId(
        data
      );


    if (!receiverId) {

      const response = {

        ok: false,

        error:
          'INVALID_RECEIVER',

        msg:
          'Destinatario no válido'

      };


      socket.emit(
        'message_error',
        response
      );


      if (
        typeof callback ===
        'function'
      ) {

        callback(
          response
        );

      }


      return;

    }


    if (
      senderId ===
      receiverId
    ) {

      const response = {

        ok: false,

        error:
          'INVALID_RECEIVER',

        msg:
          'No puedes enviarte un mensaje a ti mismo'

      };


      if (
        typeof callback ===
        'function'
      ) {

        callback(
          response
        );

      }


      return;

    }


    const receiver =
      await getVobixUserById(
        receiverId
      );


    if (
      !receiver ||
      !receiver.verified
    ) {

      const response = {

        ok: false,

        error:
          'USER_NOT_FOUND',

        msg:
          'Usuario no encontrado'

      };


      socket.emit(
        'message_error',
        response
      );


      if (
        typeof callback ===
        'function'
      ) {

        callback(
          response
        );

      }


      return;

    }


    const messageType =
      normalizeVobixMessageType(
        data
      );


    const conversationId =
      data.conversationId ||
      data.conversation_id ||
      null;


    let content =
      String(
        data.content ||
        data.message ||
        data.text ||
        ''
      );


    let imageUrl =
      data.image_url ||
      data.imageUrl ||
      null;


    let audioUrl =
      data.audio_url ||
      data.audioUrl ||
      data.voice_url ||
      data.voiceUrl ||
      null;


    if (
      messageType ===
      'image' &&
      !imageUrl
    ) {

      imageUrl =
        content ||
        null;

    }


    if (
      messageType ===
      'audio' &&
      !audioUrl
    ) {

      audioUrl =
        content ||
        null;

    }


    if (
      messageType === 'text' &&
      !content.trim()
    ) {

      const response = {

        ok: false,

        error:
          'EMPTY_MESSAGE',

        msg:
          'El mensaje está vacío'

      };


      if (
        typeof callback ===
        'function'
      ) {

        callback(
          response
        );

      }


      return;

    }


    if (
      messageType === 'image' &&
      !imageUrl
    ) {

      const response = {

        ok: false,

        error:
          'EMPTY_IMAGE',

        msg:
          'Falta la imagen'

      };


      if (
        typeof callback ===
        'function'
      ) {

        callback(
          response
        );

      }


      return;

    }


    if (
      messageType === 'audio' &&
      !audioUrl
    ) {

      const response = {

        ok: false,

        error:
          'EMPTY_AUDIO',

        msg:
          'Falta la nota de voz'

      };


      if (
        typeof callback ===
        'function'
      ) {

        callback(
          response
        );

      }


      return;

    }


    /*
      Guardar.
    */

    const savedMessage =
      await saveVobixSocketMessage({

        senderId,

        receiverId,

        conversationId,

        type:
          messageType,

        content,

        imageUrl,

        audioUrl

      });


    /*
      Formato uniforme para frontend.
    */

    const outgoingMessage = {

      id:
        savedMessage.id,

      sender_id:
        senderId,

      senderId,

      receiver_id:
        receiverId,

      receiverId,

      conversation_id:
        savedMessage.conversation_id ||
        conversationId,

      conversationId:
        savedMessage.conversation_id ||
        conversationId,

      type:
        savedMessage.message_type ||
        messageType,

      message_type:
        savedMessage.message_type ||
        messageType,

      content:
        savedMessage.content ??
        content,

      image_url:
        savedMessage.image_url ||
        imageUrl,

      imageUrl:
        savedMessage.image_url ||
        imageUrl,

      audio_url:
        savedMessage.audio_url ||
        audioUrl,

      audioUrl:
        savedMessage.audio_url ||
        audioUrl,

      created_at:
        savedMessage.created_at ||
        new Date().toISOString(),

      createdAt:
        savedMessage.created_at ||
        new Date().toISOString(),

      sender: {

        id:
          senderId,

        username:
          socket.vobixUser.username,

        avatar_url:
          socket.vobixUser.avatar_url,

        avatarUrl:
          socket.vobixUser.avatar_url

      }

    };


    /*
      Entrega inmediata por Socket.IO.
    */

    emitVobixMessageToReceiver(
      receiverId,
      outgoingMessage
    );


    /*
      Confirmación al teléfono que envió.
    */

    emitVobixMessageConfirmation(
      socket,
      outgoingMessage
    );


    /*
      PUSH.

      Si NO tiene ningún socket activo,
      Push es obligatorio para avisarle.

      Si tiene socket activo, no mandamos Push
      aquí para evitar duplicar aviso mientras
      está usando VOBIXCHAT.
    */

    let pushResult = {

      total:
        0,

      sent:
        0,

      failed:
        0,

      removed:
        0

    };


    const receiverSocketOnline =
      isVobixUserSocketOnline(
        receiverId
      );


    if (
      !receiverSocketOnline
    ) {

      try {

        pushResult =
          await sendVobixMessagePush(
            receiverId,
            {

              senderId,

              senderName:
                socket.vobixUser.username,

              conversationId:
                outgoingMessage.conversationId,

              messageId:
                outgoingMessage.id,

              preview:
                createVobixMessagePreview(
                  outgoingMessage
                )

            }
          );


      } catch (pushError) {

        /*
          El mensaje YA está guardado.

          Un fallo Push no debe convertirlo
          en un mensaje fallido.
        */

        console.error(
          'VOBIXCHAT MESSAGE PUSH ERROR:',
          pushError
        );

      }

    }


    const response = {

      ok: true,

      message:
        outgoingMessage,

      deliveredRealtime:
        receiverSocketOnline,

      push:
        pushResult

    };


    if (
      typeof callback ===
      'function'
    ) {

      callback(
        response
      );

    }


  } catch (error) {

    console.error(
      'VOBIXCHAT SOCKET MESSAGE ERROR:',
      error
    );


    const response = {

      ok: false,

      error:
        'MESSAGE_FAILED',

      msg:
        'No se pudo enviar el mensaje'

    };


    socket.emit(
      'message_error',
      response
    );


    if (
      typeof callback ===
      'function'
    ) {

      callback(
        response
      );

    }

  }

}


/* =========================================================
   IDENTIFICAR SOCKET ANTIGUO POR USER ID

   Compatibilidad con clientes anteriores.

   IMPORTANTE:
   si el socket ya está autenticado mediante token,
   ignoramos cualquier ID distinto enviado por cliente.
   ========================================================= */

async function registerLegacyVobixSocketUser(
  socket,
  data = {},
  callback = null
) {

  try {

    let requestedUserId =
      normalizeVobixUserId(

        data.userId ||
        data.user_id ||
        data.id ||
        data

      );


    if (
      socket.vobixUser?.id
    ) {

      requestedUserId =
        Number(
          socket.vobixUser.id
        );

    }


    if (!requestedUserId) {

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


    const user =
      await getVobixUserById(
        requestedUserId
      );


    if (
      !user ||
      !user.verified
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


    /*
      Si el socket no tenía sesión autenticada,
      NO le damos privilegios privados únicamente
      porque haya enviado un userId.

      Sí mantenemos presencia básica para
      compatibilidad visual.
    */

    if (
      !socket.vobixAuthenticated &&
      !socket.vobixUser
    ) {

      if (
        typeof callback ===
        'function'
      ) {

        callback({

          ok: false,

          authenticated:
            false,

          msg:
            'Socket sin sesión autenticada'

        });

      }


      return;

    }


    socket.vobixUser =
      user;


    addVobixUserSocket(
      user.id,
      socket.id
    );


    socket.join(
      getVobixUserRoom(
        user.id
      )
    );


    await markVobixUserOnline(
      user.id
    );


    broadcastVobixPresence(
      user.id,
      true
    );


    if (
      typeof callback ===
      'function'
    ) {

      callback({

        ok: true,

        user: {

          id:
            user.id,

          username:
            user.username,

          avatar_url:
            user.avatar_url,

          avatarUrl:
            user.avatar_url

        }

      });

    }


  } catch (error) {

    console.error(
      'VOBIXCHAT REGISTER SOCKET ERROR:',
      error
    );


    if (
      typeof callback ===
      'function'
    ) {

      callback({

        ok: false,

        msg:
          'No se pudo registrar el socket'

      });

    }

  }

}


/* =========================================================
   CONEXIÓN SOCKET.IO
   ========================================================= */

io.on(
  'connection',
  async socket => {

    console.log(
      `VOBIXCHAT | SOCKET CONNECTED | ${socket.id}`
    );


    /* =====================================================
       USUARIO AUTENTICADO DESDE HANDSHAKE
       ===================================================== */

    if (
      socket.vobixUser?.id
    ) {

      const userId =
        Number(
          socket.vobixUser.id
        );


      addVobixUserSocket(
        userId,
        socket.id
      );


      socket.join(
        getVobixUserRoom(
          userId
        )
      );


      await markVobixUserOnline(
        userId
      );


      broadcastVobixPresence(
        userId,
        true
      );


      socket.emit(
        'socket_authenticated',
        {

          ok: true,

          user: {

            id:
              socket.vobixUser.id,

            username:
              socket.vobixUser.username,

            avatar_url:
              socket.vobixUser.avatar_url,

            avatarUrl:
              socket.vobixUser.avatar_url

          }

        }
      );

    }


    /* =====================================================
       REGISTRO DE USUARIO / COMPATIBILIDAD
       ===================================================== */

    socket.on(
      'register_user',
      (
        data,
        callback
      ) => {

        registerLegacyVobixSocketUser(
          socket,
          data,
          callback
        );

      }
    );


    socket.on(
      'user_online',
      (
        data,
        callback
      ) => {

        registerLegacyVobixSocketUser(
          socket,
          data,
          callback
        );

      }
    );


    /* =====================================================
       ENVIAR MENSAJE
       ===================================================== */

    socket.on(
      'send_message',
      (
        data,
        callback
      ) => {

        handleVobixSocketMessage(
          socket,
          data,
          callback
        );

      }
    );


    /*
      Alias antiguo.

      Ambos llaman a UNA sola función,
      pero el cliente debe emitir solamente uno.
    */

    socket.on(
      'sendMessage',
      (
        data,
        callback
      ) => {

        handleVobixSocketMessage(
          socket,
          data,
          callback
        );

      }
    );


    /* =====================================================
       CONSULTAR SI USUARIO TIENE SOCKET
       ===================================================== */

    socket.on(
      'check_user_online',
      (
        data,
        callback
      ) => {

        const userId =
          normalizeVobixUserId(

            data?.userId ||
            data?.user_id ||
            data

          );


        const online =
          userId
            ? isVobixUserSocketOnline(
                userId
              )
            : false;


        if (
          typeof callback ===
          'function'
        ) {

          callback({

            ok: true,

            userId,

            online,

            connections:
              userId
                ? getVobixUserSocketCount(
                    userId
                  )
                : 0

          });

        }

      }
    );


    /* =====================================================
       PERFIL ACTUALIZADO
       ===================================================== */

    socket.on(
      'profile_updated',
      async data => {

        if (
          !socket.vobixUser?.id
        ) {

          return;

        }


        /*
          No aceptamos aquí cambios arbitrarios de DB.
          La ruta HTTP /api/profile/avatar ya hizo
          la actualización real.

          Solamente refrescamos la información del socket.
        */

        try {

          const user =
            await getVobixUserById(
              socket.vobixUser.id
            );


          if (!user) {

            return;

          }


          socket.vobixUser =
            user;


          socket
            .to(
              getVobixUserRoom(
                user.id
              )
            )
            .emit(
              'profile_updated',
              {

                userId:
                  user.id,

                avatar_url:
                  user.avatar_url,

                avatarUrl:
                  user.avatar_url

              }
            );


        } catch (error) {

          console.error(
            'VOBIXCHAT PROFILE SOCKET ERROR:',
            error.message
          );

        }

      }
    );


    /* =====================================================
       PING PERSONALIZADO
       ===================================================== */

    socket.on(
      'vobix_ping',
      (
        data,
        callback
      ) => {

        const response = {

          ok: true,

          timestamp:
            Date.now(),

          authenticated:
            Boolean(
              socket.vobixUser?.id
            )

        };


        if (
          typeof callback ===
          'function'
        ) {

          callback(
            response
          );


        } else {

          socket.emit(
            'vobix_pong',
            response
          );

        }

      }
    );


    /* =====================================================
       DESCONEXIÓN
       ===================================================== */

    socket.on(
      'disconnect',
      async reason => {

        console.log(
          `VOBIXCHAT | SOCKET DISCONNECTED | ${socket.id} | ${reason}`
        );


        const userId =
          removeVobixUserSocket(
            socket.id
          );


        if (!userId) {

          return;

        }


        /*
          Puede tener otro dispositivo conectado.

          Solamente offline cuando se fue
          el último socket.
        */

        if (
          !isVobixUserSocketOnline(
            userId
          )
        ) {

          await markVobixUserOffline(
            userId
          );


          broadcastVobixPresence(
            userId,
            false
          );

        }

      }
    );


    /* =====================================================
       ERROR SOCKET
       ===================================================== */

    socket.on(
      'error',
      error => {

        console.error(
          `VOBIXCHAT SOCKET ERROR | ${socket.id}:`,
          error
        );

      }
    );


    /*
      LOS EVENTOS DE LLAMADAS / VIDEOLLAMADAS
      SE AÑADEN EN EL BLOQUE 4.

      Permanecemos dentro del mismo callback
      io.on('connection').
    */


/* =========================================================
   FIN SERVER.JS
   BLOQUE 3 DE 6

   MUY IMPORTANTE:

   NO pongas aquí:

   });

   porque todavía NO cerramos:

   io.on('connection', async socket => {

   El BLOQUE 4 continúa DENTRO de esta conexión
   y añade:

   - LLAMADA SALIENTE
   - VIDEOLLAMADA
   - TIMBRE ENTRANTE
   - CALL ID
   - ACEPTAR
   - RECHAZAR
   - CANCELAR
   - TERMINAR
   - WEBRTC OFFER
   - WEBRTC ANSWER
   - ICE CANDIDATES
   - PUSH SI EL RECEPTOR ESTÁ FUERA

   ========================================================= */
 /* =========================================================
   VOBIXCHAT SERVER
   server.js
   BLOQUE 4 DE 6

   IMPORTANTE:
   CONTINÚA DENTRO DE:

   io.on('connection', async socket => {

   - LLAMADAS
   - VIDEOLLAMADAS
   - WEBRTC
   - PUSH CUANDO EL RECEPTOR ESTÁ FUERA
   - ACCEPT / REJECT / CANCEL / END
   - OFFER / ANSWER / ICE
   ========================================================= */


/* =========================================================
   INICIAR LLAMADA
   ========================================================= */

socket.on(
  'call_user',
  async (
    data = {},
    callback
  ) => {

    try {

      if (
        !socket.vobixUser?.id
      ) {

        const response = {

          ok: false,

          error:
            'UNAUTHENTICATED',

          msg:
            'Debes iniciar sesión'

        };


        socket.emit(
          'call_error',
          response
        );


        if (
          typeof callback ===
          'function'
        ) {

          callback(
            response
          );

        }


        return;

      }


      const callerId =
        normalizeVobixUserId(
          socket.vobixUser.id
        );


      const receiverId =
        normalizeVobixUserId(

          data.to ||
          data.userId ||
          data.user_id ||
          data.receiverId ||
          data.receiver_id ||
          data.toUserId

        );


      if (!receiverId) {

        const response = {

          ok: false,

          error:
            'INVALID_RECEIVER',

          msg:
            'Usuario no válido'

        };


        socket.emit(
          'call_error',
          response
        );


        if (
          typeof callback ===
          'function'
        ) {

          callback(
            response
          );

        }


        return;

      }


      if (
        callerId ===
        receiverId
      ) {

        const response = {

          ok: false,

          error:
            'SELF_CALL',

          msg:
            'No puedes llamarte a ti mismo'

        };


        socket.emit(
          'call_error',
          response
        );


        if (
          typeof callback ===
          'function'
        ) {

          callback(
            response
          );

        }


        return;

      }


      const receiver =
        await getVobixUserById(
          receiverId
        );


      if (
        !receiver ||
        !receiver.verified
      ) {

        const response = {

          ok: false,

          error:
            'USER_NOT_FOUND',

          msg:
            'Usuario no encontrado'

        };


        socket.emit(
          'call_error',
          response
        );


        if (
          typeof callback ===
          'function'
        ) {

          callback(
            response
          );

        }


        return;

      }


      /* ===================================================
         AUDIO / VIDEO
         =================================================== */

      const callType =
        String(
          data.callType ||
          data.call_type ||
          data.type ||
          'audio'
        )
          .toLowerCase()
          .includes(
            'video'
          )
            ? 'video'
            : 'audio';


      /* ===================================================
         CALL ID

         No usamos un número predecible.
         =================================================== */

      const callId =
        String(
          data.callId ||
          data.call_id ||
          crypto
            .randomBytes(20)
            .toString('hex')
        );


      const conversationId =
        data.conversationId ||
        data.conversation_id ||
        null;


      const callerName =
        String(
          socket.vobixUser.username ||
          'Usuario'
        )
          .trim()
          .slice(
            0,
            80
          );


      /* ===================================================
         REGISTRAR LLAMADA PENDIENTE

         vobixActiveCalls se declara fuera del
         callback en el BLOQUE 5.

         Para permitir este bloque antes de esa
         declaración usamos la función global
         definida en BLOQUE 5.

         Hasta entonces guardamos temporalmente
         en app.locals.
         =================================================== */

      if (
        !app.locals.vobixPendingCalls
      ) {

        app.locals.vobixPendingCalls =
          new Map();

      }


      const callData = {

        callId,

        callerId,

        receiverId,

        callerName,

        receiverName:
          receiver.username,

        callType,

        conversationId,

        status:
          'ringing',

        callerSocketId:
          socket.id,

        createdAt:
          Date.now(),

        acceptedAt:
          null,

        endedAt:
          null

      };


      app.locals
        .vobixPendingCalls
        .set(
          callId,
          callData
        );


      /* ===================================================
         ROOM DE LA LLAMADA
         =================================================== */

      socket.join(
        `call:${callId}`
      );


      /* ===================================================
         RECEPTOR CON SOCKET ABIERTO
         =================================================== */

      const receiverOnline =
        isVobixUserSocketOnline(
          receiverId
        );


      if (
        receiverOnline
      ) {

        io
          .to(
            getVobixUserRoom(
              receiverId
            )
          )
          .emit(
            'incoming_call',
            {

              callId,

              call_id:
                callId,

              callerId,

              caller_id:
                callerId,

              from:
                callerId,

              fromUserId:
                callerId,

              callerName,

              caller_name:
                callerName,

              callType,

              call_type:
                callType,

              type:
                callType,

              conversationId,

              conversation_id:
                conversationId,

              callerAvatar:
                socket.vobixUser
                  .avatar_url ||
                null,

              createdAt:
                callData.createdAt

            }
          );

      }


      /* ===================================================
         PUSH SI NO TIENE SOCKET

         ESTE ES EL CAMBIO IMPORTANTE:

         NO respondemos:
         "usuario no está conectado"

         porque puede tener el iPhone con
         VOBIXCHAT cerrada y Push registrado.
         =================================================== */

      let pushResult = {

        total:
          0,

        sent:
          0,

        failed:
          0,

        removed:
          0

      };


      if (
        !receiverOnline
      ) {

        try {

          pushResult =
            await sendVobixCallPush(
              receiverId,
              {

                callerId,

                callerName,

                callId,

                callType,

                conversationId

              }
            );


        } catch (pushError) {

          console.error(
            'VOBIXCHAT CALL PUSH ERROR:',
            pushError
          );

        }

      }


      /* ===================================================
         INFORMAR AL QUE LLAMA

         El teléfono llamante puede empezar ahora
         su tono de llamada saliente.
         =================================================== */

      const outgoingPayload = {

        ok: true,

        callId,

        call_id:
          callId,

        receiverId,

        to:
          receiverId,

        receiverName:
          receiver.username,

        callType,

        call_type:
          callType,

        status:
          'ringing',

        realtime:
          receiverOnline,

        pushSent:
          pushResult.sent > 0,

        push:
          pushResult

      };


      socket.emit(
        'call_ringing',
        outgoingPayload
      );


      /*
        Alias que utiliza el chat.html nuevo.
      */

      socket.emit(
        'outgoing_call',
        outgoingPayload
      );


      if (
        typeof callback ===
        'function'
      ) {

        callback(
          outgoingPayload
        );

      }


      console.log(
        `VOBIXCHAT | CALL ${callId} | ${callerId} -> ${receiverId} | ${callType} | SOCKET=${receiverOnline} | PUSH=${pushResult.sent}`
      );


    } catch (error) {

      console.error(
        'VOBIXCHAT CALL START ERROR:',
        error
      );


      const response = {

        ok: false,

        error:
          'CALL_FAILED',

        msg:
          'No se pudo iniciar la llamada'

      };


      socket.emit(
        'call_error',
        response
      );


      if (
        typeof callback ===
        'function'
      ) {

        callback(
          response
        );

      }

    }

  }
);


/* =========================================================
   ALIAS: START_CALL
   ========================================================= */

socket.on(
  'start_call',
  (
    data,
    callback
  ) => {

    /*
      Reemitimos internamente hacia el mismo socket
      mediante función auxiliar del BLOQUE 5.
    */

    socket.emit(
      'vobix_use_call_user',
      data
    );


    if (
      typeof callback ===
      'function'
    ) {

      callback({

        ok: true,

        useEvent:
          'call_user'

      });

    }

  }
);


/* =========================================================
   ACEPTAR LLAMADA
   ========================================================= */

socket.on(
  'accept_call',
  async (
    data = {},
    callback
  ) => {

    try {

      if (
        !socket.vobixUser?.id
      ) {

        if (
          typeof callback ===
          'function'
        ) {

          callback({

            ok: false,

            msg:
              'Debes iniciar sesión'

          });

        }


        return;

      }


      const callId =
        String(
          data.callId ||
          data.call_id ||
          ''
        ).trim();


      if (!callId) {

        if (
          typeof callback ===
          'function'
        ) {

          callback({

            ok: false,

            msg:
              'Falta callId'

          });

        }


        return;

      }


      const call =
        app.locals
          .vobixPendingCalls
          ?.get(
            callId
          );


      if (!call) {

        const response = {

          ok: false,

          error:
            'CALL_NOT_FOUND',

          msg:
            'Esta llamada ya no está disponible'

        };


        socket.emit(
          'call_error',
          response
        );


        if (
          typeof callback ===
          'function'
        ) {

          callback(
            response
          );

        }


        return;

      }


      const currentUserId =
        normalizeVobixUserId(
          socket.vobixUser.id
        );


      /*
        Solamente el destinatario puede contestar.
      */

      if (
        currentUserId !==
        Number(
          call.receiverId
        )
      ) {

        const response = {

          ok: false,

          error:
            'NOT_CALL_RECEIVER',

          msg:
            'No puedes contestar esta llamada'

        };


        if (
          typeof callback ===
          'function'
        ) {

          callback(
            response
          );

        }


        return;

      }


      if (
        call.status !==
        'ringing'
      ) {

        const response = {

          ok: false,

          error:
            'CALL_NOT_RINGING',

          msg:
            'La llamada ya no está sonando'

        };


        if (
          typeof callback ===
          'function'
        ) {

          callback(
            response
          );

        }


        return;

      }


      call.status =
        'accepted';


      call.acceptedAt =
        Date.now();


      call.receiverSocketId =
        socket.id;


      app.locals
        .vobixPendingCalls
        .set(
          callId,
          call
        );


      /*
        El receptor entra a la room WebRTC.
      */

      socket.join(
        `call:${callId}`
      );


      const payload = {

        ok: true,

        callId,

        call_id:
          callId,

        callerId:
          call.callerId,

        receiverId:
          call.receiverId,

        callType:
          call.callType,

        call_type:
          call.callType,

        status:
          'accepted',

        acceptedAt:
          call.acceptedAt

      };


      /*
        Avisamos a TODOS los dispositivos del caller.

        El que originó la llamada dejará de reproducir
        el tono saliente.
      */

      io
        .to(
          getVobixUserRoom(
            call.callerId
          )
        )
        .emit(
          'call_accepted',
          payload
        );


      /*
        Confirmación al receptor.
      */

      socket.emit(
        'call_accepted',
        payload
      );


      if (
        typeof callback ===
        'function'
      ) {

        callback(
          payload
        );

      }


      console.log(
        `VOBIXCHAT | CALL ACCEPTED | ${callId}`
      );


    } catch (error) {

      console.error(
        'VOBIXCHAT ACCEPT CALL ERROR:',
        error
      );


      if (
        typeof callback ===
        'function'
      ) {

        callback({

          ok: false,

          msg:
            'No se pudo contestar la llamada'

        });

      }

    }

  }
);


/* =========================================================
   ALIAS ANSWER_CALL
   ========================================================= */

socket.on(
  'answer_call',
  async (
    data = {},
    callback
  ) => {

    /*
      Compatibilidad:

      El frontend nuevo debe utilizar accept_call.

      Este evento avisa al cliente del nombre
      definitivo para evitar duplicar toda la lógica.
    */

    socket.emit(
      'vobix_accept_call_required',
      {

        ...data,

        event:
          'accept_call'

      }
    );


    if (
      typeof callback ===
      'function'
    ) {

      callback({

        ok: true,

        event:
          'accept_call'

      });

    }

  }
);


/* =========================================================
   RECHAZAR LLAMADA
   ========================================================= */

socket.on(
  'reject_call',
  async (
    data = {},
    callback
  ) => {

    try {

      if (
        !socket.vobixUser?.id
      ) {

        return;

      }


      const callId =
        String(
          data.callId ||
          data.call_id ||
          ''
        ).trim();


      if (!callId) {

        return;

      }


      const call =
        app.locals
          .vobixPendingCalls
          ?.get(
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
              'Llamada no encontrada'

          });

        }


        return;

      }


      const currentUserId =
        Number(
          socket.vobixUser.id
        );


      if (
        currentUserId !==
        Number(
          call.receiverId
        )
      ) {

        return;

      }


      call.status =
        'rejected';


      call.endedAt =
        Date.now();


      const payload = {

        callId,

        call_id:
          callId,

        status:
          'rejected',

        by:
          currentUserId

      };


      io
        .to(
          getVobixUserRoom(
            call.callerId
          )
        )
        .emit(
          'call_rejected',
          payload
        );


      io
        .to(
          getVobixUserRoom(
            call.receiverId
          )
        )
        .emit(
          'call_rejected',
          payload
        );


      app.locals
        .vobixPendingCalls
        .delete(
          callId
        );


      if (
        typeof callback ===
        'function'
      ) {

        callback({

          ok: true,

          ...payload

        });

      }


      console.log(
        `VOBIXCHAT | CALL REJECTED | ${callId}`
      );


    } catch (error) {

      console.error(
        'VOBIXCHAT REJECT CALL ERROR:',
        error
      );

    }

  }
);


/* =========================================================
   CANCELAR LLAMADA

   Lo usa el que llama antes de que contesten.
   ========================================================= */

socket.on(
  'cancel_call',
  (
    data = {},
    callback
  ) => {

    try {

      if (
        !socket.vobixUser?.id
      ) {

        return;

      }


      const callId =
        String(
          data.callId ||
          data.call_id ||
          ''
        ).trim();


      if (!callId) {

        return;

      }


      const call =
        app.locals
          .vobixPendingCalls
          ?.get(
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
              'Llamada no encontrada'

          });

        }


        return;

      }


      if (
        Number(
          socket.vobixUser.id
        ) !==
        Number(
          call.callerId
        )
      ) {

        return;

      }


      const payload = {

        callId,

        call_id:
          callId,

        status:
          'cancelled',

        by:
          call.callerId

      };


      io
        .to(
          getVobixUserRoom(
            call.receiverId
          )
        )
        .emit(
          'call_cancelled',
          payload
        );


      io
        .to(
          getVobixUserRoom(
            call.callerId
          )
        )
        .emit(
          'call_cancelled',
          payload
        );


      app.locals
        .vobixPendingCalls
        .delete(
          callId
        );


      if (
        typeof callback ===
        'function'
      ) {

        callback({

          ok: true,

          ...payload

        });

      }


    } catch (error) {

      console.error(
        'VOBIXCHAT CANCEL CALL ERROR:',
        error
      );

    }

  }
);


/* =========================================================
   TERMINAR / COLGAR LLAMADA
   ========================================================= */

async function endVobixSocketCall(
  socket,
  data = {},
  callback = null
) {

  try {

    if (
      !socket.vobixUser?.id
    ) {

      return;

    }


    const callId =
      String(
        data.callId ||
        data.call_id ||
        ''
      ).trim();


    if (!callId) {

      return;

    }


    const call =
      app.locals
        .vobixPendingCalls
        ?.get(
          callId
        );


    if (!call) {

      if (
        typeof callback ===
        'function'
      ) {

        callback({

          ok: true,

          alreadyEnded:
            true

        });

      }


      return;

    }


    const currentUserId =
      Number(
        socket.vobixUser.id
      );


    const isParticipant =
      (
        currentUserId ===
          Number(
            call.callerId
          ) ||
        currentUserId ===
          Number(
            call.receiverId
          )
      );


    if (!isParticipant) {

      return;

    }


    call.status =
      'ended';


    call.endedAt =
      Date.now();


    const payload = {

      callId,

      call_id:
        callId,

      status:
        'ended',

      by:
        currentUserId,

      endedAt:
        call.endedAt

    };


    io
      .to(
        getVobixUserRoom(
          call.callerId
        )
      )
      .emit(
        'call_ended',
        payload
      );


    io
      .to(
        getVobixUserRoom(
          call.receiverId
        )
      )
      .emit(
        'call_ended',
        payload
      );


    io
      .to(
        `call:${callId}`
      )
      .emit(
        'call_ended',
        payload
      );


    app.locals
      .vobixPendingCalls
      .delete(
        callId
      );


    if (
      typeof callback ===
      'function'
    ) {

      callback({

        ok: true,

        ...payload

      });

    }


    console.log(
      `VOBIXCHAT | CALL ENDED | ${callId}`
    );


  } catch (error) {

    console.error(
      'VOBIXCHAT END CALL ERROR:',
      error
    );


    if (
      typeof callback ===
      'function'
    ) {

      callback({

        ok: false,

        msg:
          'No se pudo terminar la llamada'

      });

    }

  }

}


socket.on(
  'end_call',
  (
    data,
    callback
  ) => {

    endVobixSocketCall(
      socket,
      data,
      callback
    );

  }
);


socket.on(
  'hangup_call',
  (
    data,
    callback
  ) => {

    endVobixSocketCall(
      socket,
      data,
      callback
    );

  }
);


/* =========================================================
   USUARIO ABRIÓ LLAMADA DESDE PUSH

   El service worker abre chat.html.
   chat.html emite push_call_opened.

   Aquí comprobamos que:
   - la llamada existe
   - sigue ringing
   - pertenece a ese receptor

   Después enviamos incoming_call al nuevo socket.
   ========================================================= */

socket.on(
  'push_call_opened',
  (
    data = {},
    callback
  ) => {

    try {

      if (
        !socket.vobixUser?.id
      ) {

        return;

      }


      const callId =
        String(
          data.callId ||
          data.call_id ||
          ''
        ).trim();


      if (!callId) {

        return;

      }


      const call =
        app.locals
          .vobixPendingCalls
          ?.get(
            callId
          );


      if (!call) {

        socket.emit(
          'call_ended',
          {

            callId,

            call_id:
              callId,

            status:
              'expired'

          }
        );


        if (
          typeof callback ===
          'function'
        ) {

          callback({

            ok: false,

            expired:
              true

          });

        }


        return;

      }


      const currentUserId =
        Number(
          socket.vobixUser.id
        );


      if (
        currentUserId !==
        Number(
          call.receiverId
        )
      ) {

        return;

      }


      if (
        call.status !==
        'ringing'
      ) {

        socket.emit(
          'call_ended',
          {

            callId,

            call_id:
              callId,

            status:
              call.status

          }
        );


        return;

      }


      /*
        Ahora ya existe socket activo.
      */

      addVobixUserSocket(
        currentUserId,
        socket.id
      );


      socket.join(
        getVobixUserRoom(
          currentUserId
        )
      );


      socket.emit(
        'incoming_call',
        {

          callId:
            call.callId,

          call_id:
            call.callId,

          callerId:
            call.callerId,

          caller_id:
            call.callerId,

          from:
            call.callerId,

          fromUserId:
            call.callerId,

          callerName:
            call.callerName,

          caller_name:
            call.callerName,

          callType:
            call.callType,

          call_type:
            call.callType,

          type:
            call.callType,

          conversationId:
            call.conversationId,

          conversation_id:
            call.conversationId,

          openedFromPush:
            true

        }
      );


      if (
        typeof callback ===
        'function'
      ) {

        callback({

          ok: true,

          callId,

          status:
            'ringing'

        });

      }


    } catch (error) {

      console.error(
        'VOBIXCHAT PUSH CALL OPEN ERROR:',
        error
      );

    }

  }
);


/* =========================================================
   WEBRTC — VALIDAR PARTICIPANTE
   ========================================================= */

function getVobixCallForSocket(
  socket,
  callId
) {

  if (
    !callId ||
    !socket.vobixUser?.id
  ) {

    return null;

  }


  const call =
    app.locals
      .vobixPendingCalls
      ?.get(
        String(
          callId
        )
      );


  if (!call) {

    return null;

  }


  const userId =
    Number(
      socket.vobixUser.id
    );


  if (
    userId !==
      Number(
        call.callerId
      ) &&
    userId !==
      Number(
        call.receiverId
      )
  ) {

    return null;

  }


  return call;

}


/* =========================================================
   WEBRTC OFFER
   ========================================================= */

socket.on(
  'webrtc_offer',
  data => {

    const callId =
      String(
        data?.callId ||
        data?.call_id ||
        ''
      ).trim();


    const call =
      getVobixCallForSocket(
        socket,
        callId
      );


    if (
      !call ||
      !data?.offer
    ) {

      return;

    }


    socket
      .to(
        `call:${callId}`
      )
      .emit(
        'webrtc_offer',
        {

          callId,

          call_id:
            callId,

          offer:
            data.offer,

          from:
            socket.vobixUser.id

        }
      );

  }
);


/* =========================================================
   ALIAS WEBRTC: OFFER
   ========================================================= */

socket.on(
  'offer',
  data => {

    const callId =
      String(
        data?.callId ||
        data?.call_id ||
        ''
      ).trim();


    const call =
      getVobixCallForSocket(
        socket,
        callId
      );


    if (
      !call ||
      !data?.offer
    ) {

      return;

    }


    socket
      .to(
        `call:${callId}`
      )
      .emit(
        'offer',
        {

          ...data,

          callId,

          from:
            socket.vobixUser.id

        }
      );

  }
);


/* =========================================================
   WEBRTC ANSWER
   ========================================================= */

socket.on(
  'webrtc_answer',
  data => {

    const callId =
      String(
        data?.callId ||
        data?.call_id ||
        ''
      ).trim();


    const call =
      getVobixCallForSocket(
        socket,
        callId
      );


    if (
      !call ||
      !data?.answer
    ) {

      return;

    }


    socket
      .to(
        `call:${callId}`
      )
      .emit(
        'webrtc_answer',
        {

          callId,

          call_id:
            callId,

          answer:
            data.answer,

          from:
            socket.vobixUser.id

        }
      );

  }
);


/* =========================================================
   ALIAS WEBRTC: ANSWER
   ========================================================= */

socket.on(
  'answer',
  data => {

    const callId =
      String(
        data?.callId ||
        data?.call_id ||
        ''
      ).trim();


    const call =
      getVobixCallForSocket(
        socket,
        callId
      );


    if (
      !call ||
      !data?.answer
    ) {

      return;

    }


    socket
      .to(
        `call:${callId}`
      )
      .emit(
        'answer',
        {

          ...data,

          callId,

          from:
            socket.vobixUser.id

        }
      );

  }
);


/* =========================================================
   ICE CANDIDATE
   ========================================================= */

socket.on(
  'webrtc_ice_candidate',
  data => {

    const callId =
      String(
        data?.callId ||
        data?.call_id ||
        ''
      ).trim();


    const call =
      getVobixCallForSocket(
        socket,
        callId
      );


    const candidate =
      data?.candidate ||
      data?.iceCandidate ||
      data?.ice_candidate;


    if (
      !call ||
      !candidate
    ) {

      return;

    }


    socket
      .to(
        `call:${callId}`
      )
      .emit(
        'webrtc_ice_candidate',
        {

          callId,

          call_id:
            callId,

          candidate,

          from:
            socket.vobixUser.id

        }
      );

  }
);


/* =========================================================
   ALIAS ICE-CANDIDATE
   ========================================================= */

socket.on(
  'ice_candidate',
  data => {

    const callId =
      String(
        data?.callId ||
        data?.call_id ||
        ''
      ).trim();


    const call =
      getVobixCallForSocket(
        socket,
        callId
      );


    const candidate =
      data?.candidate ||
      data?.iceCandidate ||
      data?.ice_candidate;


    if (
      !call ||
      !candidate
    ) {

      return;

    }


    socket
      .to(
        `call:${callId}`
      )
      .emit(
        'ice_candidate',
        {

          callId,

          call_id:
            callId,

          candidate,

          from:
            socket.vobixUser.id

        }
      );

  }
);


/* =========================================================
   JOIN CALL ROOM

   Útil si el frontend necesita volver a entrar
   después de reconexión breve.
   ========================================================= */

socket.on(
  'join_call',
  (
    data = {},
    callback
  ) => {

    const callId =
      String(
        data.callId ||
        data.call_id ||
        ''
      ).trim();


    const call =
      getVobixCallForSocket(
        socket,
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
            'Llamada no encontrada'

        });

      }


      return;

    }


    socket.join(
      `call:${callId}`
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

        callType:
          call.callType

      });

    }

  }
);


/* =========================================================
   CONSULTAR ESTADO DE LLAMADA
   ========================================================= */

socket.on(
  'get_call_status',
  (
    data = {},
    callback
  ) => {

    const callId =
      String(
        data.callId ||
        data.call_id ||
        ''
      ).trim();


    const call =
      getVobixCallForSocket(
        socket,
        callId
      );


    if (
      typeof callback !==
      'function'
    ) {

      return;

    }


    if (!call) {

      callback({

        ok: false,

        active:
          false

      });


      return;

    }


    callback({

      ok: true,

      active:
        (
          call.status ===
            'ringing' ||
          call.status ===
            'accepted'
        ),

      callId,

      status:
        call.status,

      callType:
        call.callType,

      callerId:
        call.callerId,

      receiverId:
        call.receiverId

    });

  }
);


/* =========================================================
   IMPORTANTE:

   AQUÍ TERMINA LA PARTE DE EVENTOS DE LLAMADA.

   TODAVÍA NO CERRAMOS:

   io.on('connection', async socket => {

   El BLOQUE 5 continúa exactamente debajo.

   BLOQUE 5:
   - TIMEOUT DE LLAMADAS
   - LLAMADA PERDIDA
   - RECONEXIÓN
   - LIMPIEZA
   - NOTIFICACIÓN DE LLAMADA PERDIDA
   - RUTAS DE ESTADO
   - CIERRE CORRECTO DE io.on(connection)
   ========================================================= */


/* =========================================================
   FIN SERVER.JS
   BLOQUE 4 DE 6
   ========================================================= */
 /* =========================================================
   VOBIXCHAT SERVER
   server.js
   BLOQUE 5 DE 6

   - TIMEOUT DE LLAMADAS
   - LLAMADAS PERDIDAS
   - RECONEXIÓN
   - RECUPERACIÓN DE LLAMADA
   - LIMPIEZA DE LLAMADAS
   - DESCONEXIÓN DURANTE LLAMADA
   - PUSH DE LLAMADA PERDIDA
   - CIERRE DE io.on('connection')
   ========================================================= */


/* =========================================================
   RECUPERAR LLAMADAS PENDIENTES DEL USUARIO

   Si el usuario abre VOBIXCHAT después de tocar
   la notificación, o Socket.IO se reconecta,
   puede preguntar si todavía tiene una llamada.
   ========================================================= */

socket.on(
  'recover_pending_calls',
  (
    data = {},
    callback
  ) => {

    try {

      if (
        !socket.vobixUser?.id
      ) {

        if (
          typeof callback ===
          'function'
        ) {

          callback({
            ok: false,
            authenticated: false
          });

        }

        return;

      }


      const currentUserId =
        Number(
          socket.vobixUser.id
        );


      const pendingCalls = [];


      if (
        app.locals.vobixPendingCalls
      ) {

        for (
          const call
          of app.locals.vobixPendingCalls.values()
        ) {

          if (
            Number(
              call.receiverId
            ) === currentUserId &&
            call.status === 'ringing'
          ) {

            pendingCalls.push({

              callId:
                call.callId,

              call_id:
                call.callId,

              callerId:
                call.callerId,

              caller_id:
                call.callerId,

              callerName:
                call.callerName,

              caller_name:
                call.callerName,

              callType:
                call.callType,

              call_type:
                call.callType,

              conversationId:
                call.conversationId,

              conversation_id:
                call.conversationId,

              createdAt:
                call.createdAt,

              status:
                call.status

            });

          }

        }

      }


      /*
        Si solamente hay una llamada pendiente,
        volvemos a mostrar directamente la pantalla
        de llamada entrante.
      */

      if (
        pendingCalls.length === 1
      ) {

        socket.emit(
          'incoming_call',
          {

            ...pendingCalls[0],

            recovered:
              true

          }
        );

      }


      if (
        typeof callback ===
        'function'
      ) {

        callback({

          ok: true,

          calls:
            pendingCalls

        });

      }


    } catch (error) {

      console.error(
        'VOBIXCHAT RECOVER CALL ERROR:',
        error
      );


      if (
        typeof callback ===
        'function'
      ) {

        callback({

          ok: false,

          calls: []

        });

      }

    }

  }
);


/* =========================================================
   REENTRAR A LLAMADA ACEPTADA

   Si Socket.IO se cae momentáneamente durante
   una llamada, el usuario puede volver a entrar
   en la room de señalización.
   ========================================================= */

socket.on(
  'rejoin_call',
  (
    data = {},
    callback
  ) => {

    try {

      if (
        !socket.vobixUser?.id
      ) {

        return;

      }


      const callId =
        String(
          data.callId ||
          data.call_id ||
          ''
        ).trim();


      if (!callId) {

        return;

      }


      const call =
        getVobixCallForSocket(
          socket,
          callId
        );


      if (!call) {

        if (
          typeof callback ===
          'function'
        ) {

          callback({

            ok: false,

            active:
              false

          });

        }


        return;

      }


      socket.join(
        `call:${callId}`
      );


      if (
        Number(
          socket.vobixUser.id
        ) ===
        Number(
          call.callerId
        )
      ) {

        call.callerSocketId =
          socket.id;

      }


      if (
        Number(
          socket.vobixUser.id
        ) ===
        Number(
          call.receiverId
        )
      ) {

        call.receiverSocketId =
          socket.id;

      }


      app.locals
        .vobixPendingCalls
        .set(
          callId,
          call
        );


      socket
        .to(
          `call:${callId}`
        )
        .emit(
          'call_peer_reconnected',
          {

            callId,

            call_id:
              callId,

            userId:
              socket.vobixUser.id

          }
        );


      if (
        typeof callback ===
        'function'
      ) {

        callback({

          ok: true,

          active:
            true,

          callId,

          status:
            call.status,

          callType:
            call.callType

        });

      }


    } catch (error) {

      console.error(
        'VOBIXCHAT REJOIN CALL ERROR:',
        error
      );

    }

  }
);


/* =========================================================
   WEBRTC RENEGOTIATION READY

   Permite avisar al otro teléfono de que
   puede volver a enviar OFFER después de
   una reconexión.
   ========================================================= */

socket.on(
  'webrtc_ready',
  data => {

    const callId =
      String(
        data?.callId ||
        data?.call_id ||
        ''
      ).trim();


    const call =
      getVobixCallForSocket(
        socket,
        callId
      );


    if (!call) {

      return;

    }


    socket
      .to(
        `call:${callId}`
      )
      .emit(
        'webrtc_ready',
        {

          callId,

          call_id:
            callId,

          from:
            socket.vobixUser.id

        }
      );

  }
);


/* =========================================================
   CAMERA STATE
   ========================================================= */

socket.on(
  'camera_state',
  data => {

    const callId =
      String(
        data?.callId ||
        data?.call_id ||
        ''
      ).trim();


    const call =
      getVobixCallForSocket(
        socket,
        callId
      );


    if (!call) {

      return;

    }


    socket
      .to(
        `call:${callId}`
      )
      .emit(
        'camera_state',
        {

          callId,

          call_id:
            callId,

          enabled:
            Boolean(
              data.enabled
            ),

          from:
            socket.vobixUser.id

        }
      );

  }
);


/* =========================================================
   MICROPHONE STATE
   ========================================================= */

socket.on(
  'microphone_state',
  data => {

    const callId =
      String(
        data?.callId ||
        data?.call_id ||
        ''
      ).trim();


    const call =
      getVobixCallForSocket(
        socket,
        callId
      );


    if (!call) {

      return;

    }


    socket
      .to(
        `call:${callId}`
      )
      .emit(
        'microphone_state',
        {

          callId,

          call_id:
            callId,

          enabled:
            Boolean(
              data.enabled
            ),

          from:
            socket.vobixUser.id

        }
      );

  }
);


/* =========================================================
   FRONTEND VISIBLE / OCULTO

   Esto permite distinguir mejor:
   - Socket conectado y app visible
   - Socket conectado pero navegador en background

   Se usa después desde chat.html.
   ========================================================= */

socket.on(
  'app_visibility',
  data => {

    if (
      !socket.vobixUser?.id
    ) {

      return;

    }


    socket.vobixAppVisible =
      Boolean(
        data?.visible
      );


    socket.vobixVisibilityUpdatedAt =
      Date.now();

  }
);


/* =========================================================
   HEARTBEAT DE LLAMADA
   ========================================================= */

socket.on(
  'call_heartbeat',
  data => {

    const callId =
      String(
        data?.callId ||
        data?.call_id ||
        ''
      ).trim();


    const call =
      getVobixCallForSocket(
        socket,
        callId
      );


    if (!call) {

      return;

    }


    const userId =
      Number(
        socket.vobixUser.id
      );


    if (
      userId ===
      Number(
        call.callerId
      )
    ) {

      call.callerHeartbeat =
        Date.now();

    }


    if (
      userId ===
      Number(
        call.receiverId
      )
    ) {

      call.receiverHeartbeat =
        Date.now();

    }


    app.locals
      .vobixPendingCalls
      .set(
        callId,
        call
      );

  }
);


/* =========================================================
   DESCONEXIÓN DURANTE LLAMADA

   NO terminamos inmediatamente la llamada.

   Un teléfono puede:
   - cambiar Wi-Fi / 5G
   - bloquear pantalla
   - perder Socket.IO unos segundos

   Dejamos margen para reconectar.
   ========================================================= */

socket.on(
  'disconnecting',
  reason => {

    try {

      if (
        !socket.vobixUser?.id ||
        !app.locals.vobixPendingCalls
      ) {

        return;

      }


      const userId =
        Number(
          socket.vobixUser.id
        );


      for (
        const [
          callId,
          call
        ]
        of app.locals.vobixPendingCalls.entries()
      ) {

        const participant =
          (
            Number(
              call.callerId
            ) === userId ||
            Number(
              call.receiverId
            ) === userId
          );


        if (!participant) {

          continue;

        }


        if (
          call.status !== 'accepted'
        ) {

          continue;

        }


        if (
          Number(
            call.callerId
          ) === userId &&
          call.callerSocketId ===
            socket.id
        ) {

          call.callerSocketId =
            null;


          call.callerDisconnectedAt =
            Date.now();

        }


        if (
          Number(
            call.receiverId
          ) === userId &&
          call.receiverSocketId ===
            socket.id
        ) {

          call.receiverSocketId =
            null;


          call.receiverDisconnectedAt =
            Date.now();

        }


        app.locals
          .vobixPendingCalls
          .set(
            callId,
            call
          );


        socket
          .to(
            `call:${callId}`
          )
          .emit(
            'call_peer_temporarily_disconnected',
            {

              callId,

              call_id:
                callId,

              userId,

              reason

            }
          );

      }


    } catch (error) {

      console.error(
        'VOBIXCHAT CALL DISCONNECTING ERROR:',
        error
      );

    }

  }
);


/* =========================================================
   CERRAMOS io.on('connection')

   El listener disconnect del BLOQUE 3 ya se encarga
   de presencia online/offline.

   ========================================================= */

});


/* =========================================================
   YA ESTAMOS FUERA DE io.on('connection')
   ========================================================= */


/* =========================================================
   CONFIGURACIÓN DE TIEMPOS DE LLAMADA
   ========================================================= */

const VOBIX_CALL_RING_TIMEOUT_MS =
  Number(
    process.env.CALL_RING_TIMEOUT_MS ||
    45000
  );


const VOBIX_CALL_RECONNECT_GRACE_MS =
  Number(
    process.env.CALL_RECONNECT_GRACE_MS ||
    30000
  );


const VOBIX_CALL_CLEAN_INTERVAL_MS =
  5000;


/* =========================================================
   PUSH DE LLAMADA PERDIDA
   ========================================================= */

async function sendVobixMissedCallPush(
  receiverId,
  call
) {

  try {

    return await sendVobixPushToUser(
      receiverId,
      {

        type:
          'missed-call',

        title:
          'Llamada perdida',

        body:
          `${call.callerName || 'Usuario'} te llamó`,

        tag:
          `vobix-missed-${call.callId}`,

        url:
          call.conversationId
            ? (
                '/chat.html?conversation=' +
                encodeURIComponent(
                  call.conversationId
                )
              )
            : '/chat.html',

        callerId:
          call.callerId,

        callerName:
          call.callerName,

        callId:
          call.callId,

        callType:
          call.callType,

        conversationId:
          call.conversationId

      }
    );


  } catch (error) {

    console.error(
      'VOBIXCHAT MISSED CALL PUSH ERROR:',
      error
    );


    return {

      total: 0,
      sent: 0,
      failed: 0,
      removed: 0

    };

  }

}


/* =========================================================
   FINALIZAR LLAMADA POR TIMEOUT
   ========================================================= */

async function expireVobixRingingCall(
  callId,
  call
) {

  if (
    !app.locals.vobixPendingCalls
      ?.has(
        callId
      )
  ) {

    return;

  }


  /*
    Volvemos a mirar el estado por si fue
    contestada justo antes del timeout.
  */

  const current =
    app.locals
      .vobixPendingCalls
      .get(
        callId
      );


  if (
    !current ||
    current.status !== 'ringing'
  ) {

    return;

  }


  current.status =
    'missed';


  current.endedAt =
    Date.now();


  const payload = {

    callId,

    call_id:
      callId,

    status:
      'missed',

    callerId:
      current.callerId,

    receiverId:
      current.receiverId,

    callType:
      current.callType

  };


  /*
    El llamante deja de escuchar el tono.
  */

  io
    .to(
      getVobixUserRoom(
        current.callerId
      )
    )
    .emit(
      'call_missed',
      payload
    );


  /*
    Si el receptor abrió la app tarde,
    también cerramos su interfaz.
  */

  io
    .to(
      getVobixUserRoom(
        current.receiverId
      )
    )
    .emit(
      'call_missed',
      payload
    );


  /*
    Notificación de llamada perdida.

    Se envía incluso si ya volvió a conectar,
    porque representa un evento que realmente
    no fue contestado.
  */

  await sendVobixMissedCallPush(
    current.receiverId,
    current
  );


  app.locals
    .vobixPendingCalls
    .delete(
      callId
    );


  console.log(
    `VOBIXCHAT | MISSED CALL | ${callId}`
  );

}


/* =========================================================
   TERMINAR LLAMADA SI UN PARTICIPANTE NO REGRESA
   ========================================================= */

function expireVobixDisconnectedCall(
  callId,
  call,
  disconnectedUserId
) {

  if (
    !app.locals.vobixPendingCalls
      ?.has(
        callId
      )
  ) {

    return;

  }


  const payload = {

    callId,

    call_id:
      callId,

    status:
      'disconnected',

    by:
      disconnectedUserId,

    endedAt:
      Date.now()

  };


  io
    .to(
      getVobixUserRoom(
        call.callerId
      )
    )
    .emit(
      'call_ended',
      payload
    );


  io
    .to(
      getVobixUserRoom(
        call.receiverId
      )
    )
    .emit(
      'call_ended',
      payload
    );


  io
    .to(
      `call:${callId}`
    )
    .emit(
      'call_ended',
      payload
    );


  app.locals
    .vobixPendingCalls
    .delete(
      callId
    );


  console.log(
    `VOBIXCHAT | CALL DISCONNECT TIMEOUT | ${callId}`
  );

}


/* =========================================================
   LIMPIADOR CENTRAL DE LLAMADAS
   ========================================================= */

const vobixCallCleanupTimer =
  setInterval(
    async () => {

      try {

        if (
          !app.locals.vobixPendingCalls
        ) {

          return;

        }


        const now =
          Date.now();


        const calls =
          Array.from(
            app.locals
              .vobixPendingCalls
              .entries()
          );


        for (
          const [
            callId,
            call
          ]
          of calls
        ) {

          /* ===============================================
             LLAMADA SONANDO DEMASIADO TIEMPO
             =============================================== */

          if (
            call.status === 'ringing'
          ) {

            const age =
              now -
              Number(
                call.createdAt ||
                now
              );


            if (
              age >=
              VOBIX_CALL_RING_TIMEOUT_MS
            ) {

              await expireVobixRingingCall(
                callId,
                call
              );

            }


            continue;

          }


          /* ===============================================
             LLAMADA ACEPTADA:
             PARTICIPANTE DESCONECTADO
             =============================================== */

          if (
            call.status === 'accepted'
          ) {

            if (
              call.callerDisconnectedAt &&
              !call.callerSocketId
            ) {

              const elapsed =
                now -
                call.callerDisconnectedAt;


              /*
                Si el usuario tiene otro socket conectado,
                todavía no terminamos.
              */

              if (
                elapsed >=
                  VOBIX_CALL_RECONNECT_GRACE_MS &&
                !isVobixUserSocketOnline(
                  call.callerId
                )
              ) {

                expireVobixDisconnectedCall(
                  callId,
                  call,
                  call.callerId
                );


                continue;

              }

            }


            if (
              call.receiverDisconnectedAt &&
              !call.receiverSocketId
            ) {

              const elapsed =
                now -
                call.receiverDisconnectedAt;


              if (
                elapsed >=
                  VOBIX_CALL_RECONNECT_GRACE_MS &&
                !isVobixUserSocketOnline(
                  call.receiverId
                )
              ) {

                expireVobixDisconnectedCall(
                  callId,
                  call,
                  call.receiverId
                );


                continue;

              }

            }

          }


          /* ===============================================
             SEGURIDAD:
             BORRAR REGISTROS YA FINALIZADOS
             =============================================== */

          if (
            call.status === 'ended' ||
            call.status === 'rejected' ||
            call.status === 'cancelled' ||
            call.status === 'missed'
          ) {

            app.locals
              .vobixPendingCalls
              .delete(
                callId
              );

          }

        }


      } catch (error) {

        console.error(
          'VOBIXCHAT CALL CLEANUP ERROR:',
          error
        );

      }

    },

    VOBIX_CALL_CLEAN_INTERVAL_MS
  );


/*
  No impedir que Node termine únicamente
  por este timer.
*/

if (
  typeof vobixCallCleanupTimer.unref ===
  'function'
) {

  vobixCallCleanupTimer.unref();

}


/* =========================================================
   ESTADO BÁSICO DEL SERVIDOR
   ========================================================= */

app.get(
  '/api/status',
  (
    req,
    res
  ) => {

    res.json({

      ok: true,

      service:
        'VOBIXCHAT',

      socket:
        true,

      push:
        vobixPushEnabled,

      connectedUsers:
        vobixUserSockets.size,

      activeCalls:
        app.locals.vobixPendingCalls
          ? app.locals
              .vobixPendingCalls
              .size
          : 0,

      timestamp:
        new Date()
          .toISOString()

    });

  }
);


/* =========================================================
   HEALTH CHECK PARA RENDER
   ========================================================= */

app.get(
  '/health',
  (
    req,
    res
  ) => {

    res
      .status(200)
      .json({

        ok: true,

        service:
          'VOBIXCHAT',

        timestamp:
          Date.now()

      });

  }
);


/* =========================================================
   404 PARA API

   IMPORTANTE:
   Esto va DESPUÉS de las rutas API.
   ========================================================= */

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


/* =========================================================
   MANEJO DE ERRORES DE MULTER
   ========================================================= */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {

    if (
      error instanceof
      multer.MulterError
    ) {

      if (
        error.code ===
        'LIMIT_FILE_SIZE'
      ) {

        return res
          .status(413)
          .json({

            ok: false,

            msg:
              'El archivo es demasiado grande'

          });

      }


      return res
        .status(400)
        .json({

          ok: false,

          msg:
            error.message

        });

    }


    if (
      error &&
      String(
        error.message ||
        ''
      ).includes(
        'Solo se permiten imágenes'
      )
    ) {

      return res
        .status(400)
        .json({

          ok: false,

          msg:
            error.message

        });

    }


    return next(
      error
    );

  }
);


/* =========================================================
   ERROR GENERAL
   ========================================================= */

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


/* =========================================================
   FIN SERVER.JS
   BLOQUE 5 DE 6

   YA CERRAMOS:

   io.on('connection', ...)

   NO PONGAS server.listen() TODAVÍA.

   EL BLOQUE 6 VA JUSTO DEBAJO Y CONTIENE:

   - ARRANQUE DE POSTGRESQL
   - initializeDatabase()
   - TABLA PUSH
   - LIMPIEZA DE PRESENCIA
   - PORT DE RENDER
   - server.listen()
   - CIERRE SEGURO SIGTERM / SIGINT
   ========================================================= */
/* =========================================================
   VOBIXCHAT SERVER
   server.js
   BLOQUE 6 DE 6

   - ARRANQUE SEGURO
   - POSTGRESQL / SUPABASE
   - INITIALIZE DATABASE
   - PUSH DATABASE
   - PRESENCIA
   - RENDER PORT
   - SERVER.LISTEN
   - SIGTERM / SIGINT
   ========================================================= */


/* =========================================================
   CONFIGURACIÓN DEL PUERTO

   Render proporciona process.env.PORT.
   ========================================================= */

const PORT =
  Number(
    process.env.PORT ||
    config.PORT ||
    3000
  );


/* =========================================================
   HOST

   0.0.0.0 es necesario para Render.
   ========================================================= */

const HOST =
  '0.0.0.0';


/* =========================================================
   MARCAR TODOS OFFLINE AL ARRANCAR

   Si Render reinicia el servidor, pueden quedar usuarios
   marcados online en PostgreSQL aunque sus sockets hayan
   desaparecido.

   Los sockets reales volverán a marcar online al conectar.
   ========================================================= */

async function resetVobixPresenceOnStartup() {

  try {

    await database.query(`
      UPDATE users

      SET
        online = FALSE,
        last_seen = NOW(),
        updated_at = NOW()

      WHERE online = TRUE
    `);


    console.log(
      'VOBIXCHAT | PRESENCE RESET: READY'
    );


  } catch (error) {

    console.error(
      'VOBIXCHAT PRESENCE RESET ERROR:',
      error.message
    );

    /*
      Esto no debe impedir que el servidor arranque.
    */

  }

}


/* =========================================================
   COMPROBAR CONEXIÓN POSTGRESQL
   ========================================================= */

async function testVobixDatabaseConnection() {

  try {

    const result =
      await database.query(
        `
          SELECT
            NOW() AS server_time
        `
      );


    console.log(
      'VOBIXCHAT | DATABASE: CONNECTED',
      result.rows[0]?.server_time || ''
    );


    return true;


  } catch (error) {

    console.error(
      'VOBIXCHAT DATABASE CONNECTION ERROR:',
      error
    );


    throw error;

  }

}


/* =========================================================
   LIMPIAR SESIONES PERIÓDICAMENTE
   ========================================================= */

const vobixSessionCleanupTimer =
  setInterval(
    () => {

      try {

        cleanExpiredSessions();

      } catch (error) {

        console.error(
          'VOBIXCHAT SESSION CLEANUP ERROR:',
          error.message
        );

      }

    },
    30 * 60 * 1000
  );


if (
  typeof vobixSessionCleanupTimer.unref ===
  'function'
) {

  vobixSessionCleanupTimer.unref();

}


/* =========================================================
   LIMPIAR LLAMADAS HUÉRFANAS

   Seguridad adicional por si alguna llamada queda en memoria
   por una excepción inesperada.
   ========================================================= */

const VOBIX_MAX_CALL_MEMORY_MS =
  2 * 60 * 60 * 1000;


const vobixOrphanCallCleanupTimer =
  setInterval(
    () => {

      try {

        if (
          !app.locals.vobixPendingCalls
        ) {

          return;

        }


        const now =
          Date.now();


        for (
          const [
            callId,
            call
          ]
          of app.locals.vobixPendingCalls.entries()
        ) {

          const createdAt =
            Number(
              call.createdAt ||
              now
            );


          if (
            now -
            createdAt >
            VOBIX_MAX_CALL_MEMORY_MS
          ) {

            app.locals
              .vobixPendingCalls
              .delete(
                callId
              );


            console.log(
              `VOBIXCHAT | ORPHAN CALL REMOVED | ${callId}`
            );

          }

        }


      } catch (error) {

        console.error(
          'VOBIXCHAT ORPHAN CALL CLEANUP ERROR:',
          error.message
        );

      }

    },
    10 * 60 * 1000
  );


if (
  typeof vobixOrphanCallCleanupTimer.unref ===
  'function'
) {

  vobixOrphanCallCleanupTimer.unref();

}


/* =========================================================
   INICIALIZAR MAPA DE LLAMADAS

   Si todavía no existe, lo creamos antes de escuchar
   peticiones.
   ========================================================= */

if (
  !app.locals.vobixPendingCalls
) {

  app.locals.vobixPendingCalls =
    new Map();

}


/* =========================================================
   ARRANQUE PRINCIPAL
   ========================================================= */

let vobixServerStarted =
  false;


async function startVobixServer() {

  if (
    vobixServerStarted
  ) {

    return;

  }


  try {

    console.log(
      '================================================='
    );

    console.log(
      'VOBIXCHAT | STARTING SERVER'
    );

    console.log(
      '================================================='
    );


    /* =====================================================
       1. COMPROBAR POSTGRESQL / SUPABASE
       ===================================================== */

    await testVobixDatabaseConnection();


    /* =====================================================
       2. CREAR / ACTUALIZAR ESQUEMA PRINCIPAL
       ===================================================== */

    console.log(
      'VOBIXCHAT | INITIALIZING DATABASE...'
    );


    await initializeDatabase();


    console.log(
      'VOBIXCHAT | DATABASE SCHEMA: READY'
    );


    /* =====================================================
       3. CREAR TABLA DE WEB PUSH
       ===================================================== */

    console.log(
      'VOBIXCHAT | INITIALIZING PUSH DATABASE...'
    );


    await prepareVobixPushDatabase();


    console.log(
      'VOBIXCHAT | PUSH DATABASE: READY'
    );


    /* =====================================================
       4. RESETEAR PRESENCIA ANTIGUA
       ===================================================== */

    await resetVobixPresenceOnStartup();


    /* =====================================================
       5. ABRIR SERVIDOR HTTP + SOCKET.IO

       ESTE ES EL ÚNICO server.listen()
       ===================================================== */

    await new Promise(
      (
        resolve,
        reject
      ) => {

        const onServerError =
          error => {

            server.off(
              'listening',
              onServerListening
            );


            reject(
              error
            );

          };


        const onServerListening =
          () => {

            server.off(
              'error',
              onServerError
            );


            resolve();

          };


        server.once(
          'error',
          onServerError
        );


        server.once(
          'listening',
          onServerListening
        );


        server.listen(
          PORT,
          HOST
        );

      }
    );


    vobixServerStarted =
      true;


    console.log(
      '================================================='
    );

    console.log(
      `VOBIXCHAT | SERVER ONLINE`
    );

    console.log(
      `VOBIXCHAT | PORT: ${PORT}`
    );

    console.log(
      `VOBIXCHAT | SOCKET.IO: READY`
    );

    console.log(
      `VOBIXCHAT | WEB PUSH: ${
        vobixPushEnabled
          ? 'READY'
          : 'NOT CONFIGURED'
      }`
    );

    console.log(
      `VOBIXCHAT | CALL RING TIMEOUT: ${
        VOBIX_CALL_RING_TIMEOUT_MS / 1000
      }s`
    );

    console.log(
      '================================================='
    );


  } catch (error) {

    console.error(
      '================================================='
    );

    console.error(
      'VOBIXCHAT | FATAL STARTUP ERROR'
    );

    console.error(
      error
    );

    console.error(
      '================================================='
    );


    /*
      Render necesita saber que el arranque falló.
    */

    process.exitCode =
      1;


    /*
      Damos un momento para que Render capture
      correctamente los logs.
    */

    setTimeout(
      () => {

        process.exit(1);

      },
      1000
    );

  }

}


/* =========================================================
   CIERRE SEGURO
   ========================================================= */

let vobixShuttingDown =
  false;


async function shutdownVobixServer(
  signal
) {

  if (
    vobixShuttingDown
  ) {

    return;

  }


  vobixShuttingDown =
    true;


  console.log(
    `VOBIXCHAT | ${signal} RECEIVED`
  );


  console.log(
    'VOBIXCHAT | SHUTTING DOWN...'
  );


  /*
    Dejamos de ejecutar timers.
  */

  try {

    clearInterval(
      vobixSessionCleanupTimer
    );

  } catch (error) {}


  try {

    clearInterval(
      vobixOrphanCallCleanupTimer
    );

  } catch (error) {}


  try {

    clearInterval(
      vobixCallCleanupTimer
    );

  } catch (error) {}


  /*
    Avisar a sockets conectados.
  */

  try {

    io.emit(
      'server_shutdown',
      {

        reason:
          signal,

        timestamp:
          Date.now()

      }
    );

  } catch (error) {}


  /*
    Marcar usuarios offline antes de cerrar.
  */

  try {

    await database.query(`
      UPDATE users

      SET
        online = FALSE,
        last_seen = NOW(),
        updated_at = NOW()

      WHERE online = TRUE
    `);

  } catch (error) {

    console.error(
      'VOBIXCHAT SHUTDOWN PRESENCE ERROR:',
      error.message
    );

  }


  /*
    Cerrar Socket.IO.
  */

  try {

    io.close();

  } catch (error) {

    console.error(
      'VOBIXCHAT SOCKET CLOSE ERROR:',
      error.message
    );

  }


  /*
    Cerrar HTTP.
  */

  const forceExitTimer =
    setTimeout(
      () => {

        console.error(
          'VOBIXCHAT | FORCED SHUTDOWN'
        );


        process.exit(0);

      },
      10000
    );


  if (
    typeof forceExitTimer.unref ===
    'function'
  ) {

    forceExitTimer.unref();

  }


  if (
    !server.listening
  ) {

    clearTimeout(
      forceExitTimer
    );


    process.exit(0);


    return;

  }


  server.close(
    () => {

      clearTimeout(
        forceExitTimer
      );


      console.log(
        'VOBIXCHAT | SERVER CLOSED'
      );


      process.exit(0);

    }
  );

}


/* =========================================================
   SEÑALES DE RENDER / NODE
   ========================================================= */

process.on(
  'SIGTERM',
  () => {

    shutdownVobixServer(
      'SIGTERM'
    );

  }
);


process.on(
  'SIGINT',
  () => {

    shutdownVobixServer(
      'SIGINT'
    );

  }
);


/* =========================================================
   ERRORES NO CAPTURADOS

   Los registramos claramente para Render.
   ========================================================= */

process.on(
  'unhandledRejection',
  reason => {

    console.error(
      'VOBIXCHAT | UNHANDLED REJECTION:',
      reason
    );

  }
);


process.on(
  'uncaughtException',
  error => {

    console.error(
      'VOBIXCHAT | UNCAUGHT EXCEPTION:',
      error
    );


    /*
      Un uncaughtException puede dejar Node
      en un estado inconsistente.

      Cerramos limpiamente.
    */

    shutdownVobixServer(
      'UNCAUGHT_EXCEPTION'
    );

  }
);


/* =========================================================
   ARRANCAR VOBIXCHAT
   ========================================================= */

startVobixServer();


/* =========================================================
   FIN DE server.js
   VOBIXCHAT
   6 DE 6
   ========================================================= */
