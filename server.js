'use strict';

const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const path = require('path');

const config = require('./config');
const database = require('./database/db');
const { normalizePhone } = require('./core/users');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


// ======================================================
// VOBIXCHAT - SEGURIDAD / PIN / SESIONES
// ======================================================

const pins = {};
const pendingUsers = {};
const sessions = {};

const SESSION_TTL_MS =
  7 * 24 * 60 * 60 * 1000; // 7 días


// ======================================================
// CREAR TOKEN SEGURO
// ======================================================

function createSessionToken() {

  return crypto
    .randomBytes(32)
    .toString('hex');

}


// ======================================================
// OBTENER TOKEN DEL REQUEST
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
// GENERAR PIN
// ======================================================

function sendPin(req, res) {

  const phone = normalizePhone(
    req.body.phone || ''
  );

  const username = String(
    req.body.username ||
    req.body.user ||
    ''
  ).trim();


  if (!phone || !username) {

    return res.status(400).json({
      ok: false,
      msg: 'Falta usuario o teléfono'
    });

  }


  if (!config.TEST_PIN_MODE) {

    return res.status(503).json({
      ok: false,
      msg: 'SMS real todavía no configurado'
    });

  }


  const pin =
    String(config.TEST_PIN);


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

async function verifyPin(req, res) {

  const phone = normalizePhone(
    req.body.phone || ''
  );

  const pin = String(
    req.body.pin || ''
  ).trim();


  if (!phone || !pin) {

    return res.status(400).json({

      ok: false,

      msg:
        'Faltan datos'

    });

  }


  const pinData =
    pins[phone];


  if (!pinData) {

    return res.status(400).json({

      ok: false,

      msg:
        'Solicita un PIN primero'

    });

  }


  // ====================================================
  // COMPROBAR CADUCIDAD
  // ====================================================

  if (
    Date.now() -
    pinData.createdAt >
    config.PIN_TTL_MS
  ) {

    delete pins[phone];
    delete pendingUsers[phone];


    return res.status(400).json({

      ok: false,

      msg:
        'El PIN ha caducado. Solicita otro.'

    });

  }


  // ====================================================
  // COMPROBAR INTENTOS
  // ====================================================

  if (
    pinData.attempts >=
    config.PIN_MAX_ATTEMPTS
  ) {

    delete pins[phone];
    delete pendingUsers[phone];


    return res.status(429).json({

      ok: false,

      msg:
        'Demasiados intentos. Solicita otro PIN.'

    });

  }


  // ====================================================
  // COMPROBAR PIN
  // ====================================================

  if (
    pinData.pin !== pin
  ) {

    pinData.attempts += 1;


    return res.status(400).json({

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

    return res.status(400).json({

      ok: false,

      msg:
        'Registro no encontrado'

    });

  }


  try {

    // ==================================================
    // GUARDAR / ACTUALIZAR USUARIO
    // ==================================================

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
          true,
          false,
          NOW(),
          NOW()
        )

        ON CONFLICT (phone)

        DO UPDATE SET

          username =
            EXCLUDED.username,

          verified =
            true,

          updated_at =
            NOW()

        RETURNING

          id,
          username,
          phone,
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


    // ==================================================
    // CREAR SESIÓN
    // ==================================================

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


    // PIN YA NO SE PUEDE REUTILIZAR

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

        verified:
          user.verified

      }

    });


  } catch (error) {

    console.error(
      'VOBIXCHAT DATABASE REGISTER ERROR:',
      error.message
    );


    return res.status(500).json({

      ok: false,

      msg:
        'No se pudo guardar el usuario'

    });

  }

}


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


    if (!token) {

      return res.status(401).json({

        ok: false,

        authenticated: false

      });

    }


    const session =
      sessions[token];


    if (!session) {

      return res.status(401).json({

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
            verified
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


        return res.status(401).json({

          ok: false,

          authenticated: false

        });

      }


      const user =
        result.rows[0];


      if (!user.verified) {

        delete sessions[token];


        return res.status(401).json({

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

          verified:
            user.verified

        }

      });


    } catch (error) {

      console.error(
        'VOBIXCHAT SESSION ERROR:',
        error.message
      );


      return res.status(500).json({

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
// ESTADO DE LA BASE DE DATOS
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
// SOCKET.IO
// ======================================================

io.on(
  'connection',
  socket => {


    // --------------------------------------------------
    // USUARIO
    // --------------------------------------------------

    socket.on(
      'set-user',
      user => {

        socket.username =
          user;

      }
    );


    // --------------------------------------------------
    // CHAT ACTUAL
    // --------------------------------------------------

    socket.on(
      'chat',
      data => {

        io.emit(
          'chat',
          data
        );

      }
    );


    // --------------------------------------------------
    // REUNIONES
    // --------------------------------------------------

    socket.on(
      'meet-join',
      ({ room } = {}) => {

        if (!room) {
          return;
        }


        socket.join(room);


        socket
          .to(room)
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
              .get(room) ||
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


        socket.leave(room);


        socket
          .to(room)
          .emit(
            'meet-user-left',
            socket.id
          );

      }
    );


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
// ARRANQUE DEL SERVIDOR
// ======================================================

const PORT =
  process.env.PORT ||
  3000;


server.listen(
  PORT,
  async () => {

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


    const connected =
      await database
        .testConnection();


    if (connected) {

      console.log(
        'VOBIXCHAT CORE: PostgreSQL conectado correctamente'
      );

    } else {

      console.error(
        'VOBIXCHAT CORE: PostgreSQL NO conectado'
      );

    }

  }
);
