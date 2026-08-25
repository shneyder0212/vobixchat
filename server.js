const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/', (req,res)=>{ res.sendFile(path.join(__dirname,'public','index.html')); });
app.get('/api/ping', (req,res)=>{ res.json({ok:true,time:Date.now(),msg:"VOBIX BOMBA 24H + TeamViewer+Zoom+Musica $0 P2P"}); });
app.post('/api/ping', (req,res)=>{ console.log('📡 Ping', req.body.c || 0, 'TeamViewer P2P $0'); res.json({ok:true}); });

let usuarios = {};
let reuniones = {};

io.on('connection', socket=>{
  console.log('🔌 Conectado', socket.id);

  socket.on('registrar-canal-llamada', d=>{
    if(!d.identificador_usuario) return;
    usuarios[d.identificador_usuario] = socket.id;
    socket.identificador = d.identificador_usuario;
  });

  socket.on('registrar-remote', d=>{
    if(!d.id) return;
    usuarios['remote-'+d.id] = socket.id;
  });

  socket.on('solicitar-remote', d=>{
    const dest = usuarios['remote-'+d.id] || usuarios[d.id];
    if(dest) io.to(dest).emit('solicitud-remote-recibida', {id:d.id, de:d.de});
  });

  socket.on('senal-remote', d=>{
    const dest = usuarios['remote-'+d.dest] || usuarios[d.id] || usuarios['remote-'+d.id];
    if(dest) io.to(dest).emit('senal-remote-recibida', d);
  });

  socket.on('crear-reunion', d=>{
    if(!d.id) return;
    if(!reuniones[d.id]) reuniones[d.id] = {creador:d.de, participantes:[d.de]};
    else if(!reuniones[d.id].participantes.includes(d.de)) reuniones[d.id].participantes.push(d.de);
    usuarios['reunion-'+d.id+'-'+d.de] = socket.id;
    socket.reunionId = d.id;
  });

  socket.on('unirse-reunion', d=>{
    if(!d.id || !reuniones[d.id]) reuniones[d.id] = {creador:d.de, participantes:[d.de]};
    else if(!reuniones[d.id].participantes.includes(d.de)) reuniones[d.id].participantes.push(d.de);
    socket.join('reunion-'+d.id);
    usuarios['reunion-'+d.id+'-'+d.de] = socket.id;
    socket.reunionId = d.id;
    socket.to('reunion-'+d.id).emit('nuevo-participante-reunion', {id:d.id, de:d.de});
  });

  socket.on('senal-reunion', d=>{
    if(!d.id) return;
    socket.to('reunion-'+d.id).emit('senal-reunion-recibida', d);
  });

  socket.on('salir-reunion', d=>{
    if(d.id && reuniones[d.id]){
      reuniones[d.id].participantes = reuniones[d.id].participantes.filter(p=>p!==d.de);
      if(reuniones[d.id].participantes.length===0) delete reuniones[d.id];
    }
    socket.leave('reunion-'+d.id);
  });

  socket.on('chat-reunion', d=>{
    if(!d.id) return;
    socket.to('reunion-'+d.id).emit('chat-reunion-recibido', d);
  });

  socket.on('ping-keepalive', d=>{
    socket.emit('pong-keepalive', {ok:true, c:d.c});
  });

  socket.on('mensaje-privado', d=>{
    const dest = usuarios[d.para];
    if(dest) io.to(dest).emit('mensaje-privado-recibido', d);
  });

  socket.on('senalizacion-grupal', d=>{
    const dest = usuarios[d.destinatario];
    if(dest) io.to(dest).emit('recibir-senalizacion-grupal', {emisor:d.emisor, tipo:d.tipo, payload:d.payload});
  });

  socket.on('disconnect', ()=>{
    if(socket.identificador) delete usuarios[socket.identificador];
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, ()=>{ console.log('🚀 VOBIX BOMBA - TEAMVIEWER + ZOOM + MUSICA $0 en puerto', PORT); });
