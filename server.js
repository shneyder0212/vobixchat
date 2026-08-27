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


// ========================================================
// VOBIXCHAT
// PIN TEMPORAL DE PRUEBAS
// ========================================================

const pins = {};
const users = {};


// ========================================================
// GENERAR PIN
// ========================================================

function sendPin(req, res) {

  const phone = req.body.phone;

  // Compatibilidad con index.html y app.js
  const username =
    req.body.username ||
    req.body.user;

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

  const pin = config.TEST_PIN;

  pins[phone] = pin;
  users[phone] = username;

  console.log(
    `VOBIXCHAT | PIN PRUEBAS | ${username} | PIN ${pin}`
  );

  return res.json({
    ok: true,
    pin,
    testMode: true
  });
}


// Las dos versiones actuales del frontend funcionan.

app.post('/send-pin', sendPin);
app.post('/api/send-pin', sendPin);


// ========================================================
// VERIFICAR PIN
// ========================================================

app.post('/verify-pin', (req, res) => {

  const phone = req.body.phone;
  const pin = req.body.pin;

  if (
    !phone ||
    !pin ||
    pins[phone] !== pin
  ) {

    return res.json({
      ok: false
    });

  }

  return res.json({
    ok: true,
    username: users[phone]
  });

});


// ========================================================
// COMPROBACIÓN INTERNA DE SALUD
// ========================================================

app.get('/api/health', async (req, res) => {

  try {

    const result = await database.query(
      'SELECT NOW() AS server_time'
    );

    return res.json({

      ok: true,

      app: 'VobixChat',

      database: 'connected',

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

      app: 'VobixChat',

      database: 'disconnected'

    });

  }

});


// ========================================================
// SOCKET.IO
// ========================================================

io.on('connection', socket => {

  socket.on('set-user', user => {

    socket.username = user;

  });


  socket.on('chat', data => {

    io.emit('chat', data);

  });


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
            id: socket.id
          }
        );

      const others =
        Array.from(
          io.sockets.adapter.rooms.get(room) || []
        )
          .filter(
            id => id !== socket.id
          )
          .map(
            id => ({ id })
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
    ({ to, signal } = {}) => {

      if (!to || !signal) {
        return;
      }

      io
        .to(to)
        .emit(
          'meet-signal',
          {
            from: socket.id,
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


  socket.on('disconnect', () => {

    io.emit(
      'meet-user-left',
      socket.id
    );

  });

});


// ========================================================
// INICIAR SERVIDOR
// ========================================================

const PORT =
  process.env.PORT || 3000;


server.listen(PORT, async () => {

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


  // ------------------------------------------------------
  // PRUEBA AUTOMÁTICA DE POSTGRESQL
  // ------------------------------------------------------

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

});
