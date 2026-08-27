'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const config = require('./config');
const database = require('./database/db');

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
// VOBIXCHAT
// NORMALIZACIÓN INTERNACIONAL DE TELÉFONOS
// ======================================================

function normalizeInternationalPhone(phone, callingCode = '') {

  let number = String(phone || '').trim();

  let prefix = String(callingCode || '').trim();


  // Quitar espacios, guiones, paréntesis, etc.
  number = number.replace(/[^\d+]/g, '');

  prefix = prefix.replace(/[^\d+]/g, '');


  // ----------------------------------------------
  // 0034XXXXXXXXX -> +34XXXXXXXXX
  // ----------------------------------------------

  if (number.startsWith('00')) {

    number =
      '+' + number.substring(2);

  }


  // ----------------------------------------------
  // SI YA VIENE EN FORMATO INTERNACIONAL
  // NO VOLVEMOS A AÑADIR EL PREFIJO
  // ----------------------------------------------

  if (number.startsWith('+')) {

    if (!/^\+[1-9]\d{6,14}$/.test(number)) {

      return '';

    }

    return number;

  }


  // ----------------------------------------------
  // NECESITAMOS PREFIJO INTERNACIONAL
  // ----------------------------------------------

  if (!prefix) {

    return '';

  }


  if (!prefix.startsWith('+')) {

    prefix =
      '+' + prefix;

  }


  // ----------------------------------------------
  // QUITAR CEROS INICIALES DEL NÚMERO NACIONAL
  // ----------------------------------------------

  number =
    number.replace(/^0+/, '');


  const internationalPhone =
    prefix + number;


  // ----------------------------------------------
  // VALIDACIÓN BÁSICA E.164
  // ----------------------------------------------

  if (
    !/^\+[1-9]\d{6,14}$/.test(
      internationalPhone
    )
  ) {

    return '';

  }


  return internationalPhone;

}


// ======================================================
// VOBIXCHAT - REGISTRO / PIN DE PRUEBAS
// ======================================================

const pins = {};
const pendingUsers = {};


// ======================================================
// GENERAR PIN
// ======================================================

function sendPin(req, res) {

  const phone =
    normalizeInternationalPhone(
      req.body.phone || '',
      req.body.callingCode || ''
    );


  const username =
    String(
      req.body.username ||
      req.body.user ||
      ''
    ).trim();


  const country =
    String(
      req.body.country || ''
    )
      .trim()
      .toUpperCase();


  const language =
    String(
      req.body.language || ''
    )
      .trim()
      .toLowerCase();


  if (!phone || !username) {

    return res.status(400).json({

      ok: false,

      msg:
        'Falta usuario, teléfono o prefijo internacional'

    });

  }


  if (!config.TEST_PIN_MODE) {

    return res.status(503).json({

      ok: false,

      msg:
        'SMS real todavía no configurado'

    });

  }


  const pin =
    String(config.TEST_PIN);


  pins[phone] = pin;


  pendingUsers[phone] = {

    username,

    phone,

    country,

    language,

    createdAt:
      Date.now()

  };


  console.log(
    `VOBIXCHAT | PIN PRUEBAS | ${username} | ${country || 'SIN PAIS'}`
  );


  return res.json({

    ok: true,

    pin,

    testMode: true,

    phone

  });

}


// Mantener compatibilidad con las dos rutas

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

app.post(
  '/verify-pin',
  async (req, res) => {

    const phone =
      normalizeInternationalPhone(
        req.body.phone || '',
        req.body.callingCode || ''
      );


    const pin =
      String(
        req.body.pin || ''
      ).trim();


    if (!phone || !pin) {

      return res.status(400).json({

        ok: false,

        msg:
          'Faltan datos de verificación'

      });

    }


    // --------------------------------------------------
    // COMPROBAR QUE EXISTE UN PIN
    // --------------------------------------------------

    if (!pins[phone]) {

      return res.json({

        ok: false,

        msg:
          'Solicita un PIN primero'

      });

    }


    // --------------------------------------------------
    // COMPROBAR PIN
    // --------------------------------------------------

    if (pins[phone] !== pin) {

      return res.json({

        ok: false,

        msg:
          'PIN incorrecto'

      });

    }


    // --------------------------------------------------
    // RECUPERAR REGISTRO PENDIENTE
    // --------------------------------------------------

    const pending =
      pendingUsers[phone];


    if (!pending) {

      return res.json({

        ok: false,

        msg:
          'Registro no encontrado'

      });

    }


    try {

      // =================================================
      // GUARDAR USUARIO EN POSTGRESQL / SUPABASE
      // =================================================

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


      // ------------------------------------------------
      // PIN DE UN SOLO USO
      // ------------------------------------------------

      delete pins[phone];

      delete pendingUsers[phone];


      console.log(
        `VOBIXCHAT | USUARIO GUARDADO | ${user.username} | ${user.phone}`
      );


      return res.json({

        ok: true,

        user: {

          id:
            user.id,

          username:
            user.username,

          phone:
            user.phone,

          verified:
            user.verified,

          country:
            pending.country,

          language:
            pending.language

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


      return res.status(500).json({

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
            io.sockets.adapter.rooms.get(room) ||
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

        if (!to || !signal) {

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
      ({ room } = {}) => {

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
      await database.testConnection();


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
