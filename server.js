const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const config = require('./config');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let pins = {};
let users = {};

// ==========================================
// VOBIXCHAT - PIN DE PRUEBAS GRATIS
// ==========================================
function sendPin(req, res) {

  const phone = req.body.phone;

  // Compatibilidad con index.html y app.js
  const username = req.body.username || req.body.user;

  if (!phone || !username) {
    return res.status(400).json({
      ok: false,
      msg: 'Falta usuario o teléfono'
    });
  }

  let pin;

  if (config.TEST_PIN_MODE) {

    // PRUEBAS: NO ENVÍA SMS
    pin = config.TEST_PIN;

    console.log(
      `VOBIXCHAT - PIN PRUEBAS GRATIS | ${username} | ${phone} | PIN: ${pin}`
    );

  } else {

    // Aquí conectaremos Infobip cuando autorices producción.
    return res.status(503).json({
      ok: false,
      msg: 'SMS real todavía no configurado'
    });
  }

  pins[phone] = pin;
  users[phone] = username;

  res.json({
    ok: true,
    pin: pin,
    testMode: true
  });
}

// Las DOS rutas funcionan.
// index.html utiliza /api/send-pin
// app.js utiliza /send-pin
app.post('/send-pin', sendPin);
app.post('/api/send-pin', sendPin);


// ==========================================
// VERIFICAR PIN
// ==========================================
app.post('/verify-pin', (req, res) => {

  const phone = req.body.phone;
  const pin = req.body.pin;

  if (pins[phone] === pin) {

    return res.json({
      ok: true,
      username: users[phone]
    });

  }

  res.json({
    ok: false
  });
});


// ==========================================
// SOCKET.IO
// ==========================================
io.on('connection', socket => {

  socket.on('set-user', user => {
    socket.username = user;
  });

  socket.on('chat', data => {
    io.emit('chat', data);
  });

  socket.on('meet-join', ({ room } = {}) => {

    if (!room) return;

    socket.join(room);

    socket.to(room).emit('meet-user-joined', {
      id: socket.id
    });

    const others =
      Array.from(io.sockets.adapter.rooms.get(room) || [])
        .filter(id => id !== socket.id)
        .map(id => ({ id }));

    io.to(socket.id).emit('meet-users', others);
  });

  socket.on('meet-signal', ({ to, signal }) => {

    if (!to) return;

    io.to(to).emit('meet-signal', {
      from: socket.id,
      signal
    });

  });

  socket.on('meet-leave', ({ room } = {}) => {

    if (!room) return;

    socket.leave(room);

    socket.to(room).emit(
      'meet-user-left',
      socket.id
    );

  });

  socket.on('disconnect', () => {
    io.emit('meet-user-left', socket.id);
  });

});


// ==========================================
// INICIAR VOBIXCHAT
// ==========================================
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(
    `VobixChat LISTO | Puerto ${PORT} | PIN pruebas: ${
      config.TEST_PIN_MODE ? 'ACTIVADO' : 'DESACTIVADO'
    }`
  );
});