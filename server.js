const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Servir VOBIXCHAT TODO EN UNO
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use(express.static(__dirname));

let usuarios = {};

io.on('connection', (socket) => {
  console.log('Conectado:', socket.id);

  socket.on('registrar-canal-llamada', (d) => {
    if(d.identificador_usuario){
      usuarios[d.identificador_usuario] = socket.id;
      console.log('Usuario registrado:', d.identificador_usuario);
    }
  });

  socket.on('registrar-remote', (d) => {
    if(d.id){
      usuarios['remote-' + d.id] = socket.id;
    }
  });

  socket.on('solicitar-remote', (d) => {
    let dest = usuarios['remote-' + d.id] || usuarios[d.id];
    if(dest){
      io.to(dest).emit('solicitud-remote-recibida', { id: d.id, de: d.de });
    }
  });

  socket.on('senal-remote', (d) => {
    let dest = usuarios['remote-' + d.dest] || usuarios[d.dest];
    if(dest){
      io.to(dest).emit('senal-remote-recibida', d);
    }
  });

  socket.on('mensaje-privado', (d) => {
    let dest = usuarios[d.para];
    if(dest){
      io.to(dest).emit('mensaje-privado-recibido', d);
    }
  });

  socket.on('disconnect', () => {
    for(let k in usuarios){
      if(usuarios[k] === socket.id) delete usuarios[k];
    }
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log('VOBIXCHAT TODO EN UNO corriendo en puerto ' + PORT);
});