const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// === MEMORIA FAMILIA GRATIS - SIN PAGAR SMS ===
let pins = {}; // phone -> pin
let users = {}; // phone -> username
let connectedUsers = {}; // socket.id -> username

// LISTA FAMILIA - TODOS GRATIS, PUEDES AÑADIR MAS AQUI
const FAMILIA_GRATIS = [
  "346", "347", "3460", "3461", "3462" // TODOS LOS ESPAÑOLES GRATIS EN PRUEBA
  // Añade aqui los numeros largos de tu familia: "34612345678"
];

function esFamilia(phone){
  let clean = phone.replace(/[^0-9]/g,'');
  return true; // EN MODO PRUEBA TODOS SON FAMILIA GRATIS
  // Si quieres filtrar luego: return FAMILIA_GRATIS.some(p => clean.includes(p));
}

// === RUTAS FAMILIA GRATIS ===
app.post('/send-pin', async (req, res) => {
  let { phone, username } = req.body;
  if (!phone ||!username) return res.json({ ok: false, msg: 'Faltan datos' });

  let cleanPhone = phone.replace(/[^0-9]/g,'');
  let pin = Math.floor(100000 + Math.random() * 900000).toString();

  pins[phone] = pin;
  pins[cleanPhone] = pin;
  users[phone] = username;
  users[cleanPhone] = username;

  console.log(`[FAMILIA GRATIS] ${username} | ${phone} | PIN: ${pin} | BRINP!`);

  // MODO PRUEBA: NO MANDA SMS, DEVUELVE PIN GRATIS
  return res.json({
    ok: true,
    pin: pin,
    ia: { time: '0.3ms' },
    msg: 'Familia GRATIS - PIN en pantalla - Sin SMS - Sin pagar'
  });
});

app.post('/verify-pin', (req, res) => {
  let { phone, pin } = req.body;
  let cleanPhone = phone.replace(/[^0-9]/g,'');

  if ((pins[phone] && pins[phone] === pin) || (pins[cleanPhone] && pins[cleanPhone] === pin)) {
    console.log(`[LOGIN OK] ${users[phone] || users[cleanPhone]} entro`);
    return res.json({ ok: true, username: users[phone] || users[cleanPhone] });
  } else {
    return res.json({ ok: false, msg: 'PIN incorrecto' });
  }
});

app.post('/save-key', (req, res) => {
  res.json({ ok: true });
});

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// === SOCKET.IO - SALA PRIVADA + VIDEOLLAMADA + BRINP ===
io.on('connection', socket => {
  console.log('Conectado:', socket.id);

  socket.on('set-user', username => {
    socket.username = username;
    connectedUsers[socket.id] = username;
    console.log(`Usuario: ${username} -> ${socket.id}`);
  });

  // CHAT PRIVADO - NO SE CIERRA NUNCA
  socket.on('chat', data => {
    // data = {from, text, room}
    io.emit('chat', data); // sala privada simple - todos entrelazados
    // Si quieres salas: io.to(data.room).emit('chat', data);
  });

  // MEET - VIDEOLLAMADA CON AGREGAR PERSONA Y COLGAR
  socket.on('meet-join', ({ room, user }) => {
    socket.join(room);
    socket.to(room).emit('meet-user-joined', { id: socket.id, user: user || socket.username });

    let roomSet = io.sockets.adapter.rooms.get(room);
    let others = roomSet? Array.from(roomSet).filter(id => id!== socket.id).map(id => ({ id, user: connectedUsers[id] || 'peer' })) : [];

    io.to(socket.id).emit('meet-users', others);
    console.log(`${user} se unio a video ${room}`);
  });

  socket.on('meet-signal', ({ to, signal }) => {
    io.to(to).emit('meet-signal', { from: socket.id, signal });
  });

  socket.on('meet-leave', ({ room }) => {
    socket.leave(room);
    socket.to(room).emit('meet-user-left', socket.id);
  });

  socket.on('disconnect', () => {
    console.log('Desconectado:', socket.id, connectedUsers[socket.id]);
    io.emit('meet-user-left', socket.id);
    delete connectedUsers[socket.id];
  });

  // KEEP ALIVE - PARA QUE NO SE CIERRE NUNCA
  socket.on('ping-keepalive', () => {
    socket.emit('pong-keepalive');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`

  VOBIXCHAT VERDE LISTO
  Puerto: ${PORT}
  Familia: GRATIS - Sin SMS
  BRINP: cada 5 min
  Siempre activo: ON
  Videollamada: colgar + agregar persona ON

  `);
});