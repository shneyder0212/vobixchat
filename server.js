const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const axios = require('axios');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static(__dirname));

// TU INFOBIP CONFIGURADO
const INFOBIP_API_KEY = "6058df8a3e5f589f2d3376fa58ca96ce-4e6af13d-6906-46c1-874d-002f05ba5d24";
const INFOBIP_BASE_URL = "https://ee9nk3.api.infobip.com";
const INFOBIP_SENDER = "VOBIXCHAT";

let pins = {};
let usuarios = {};

app.get('/api/mi-pais', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
    const r = await axios.get(`https://ipapi.co/${ip}/json/`);
    res.json({ country: r.data.country_code, country_calling_code: r.data.country_calling_code || '+34' });
  } catch(e) {
    res.json({ country: "ES", country_calling_code: "+34" });
  }
});

app.post('/api/enviar-pin', async (req, res) => {
  const { telefono, usuario } = req.body;
  const pin = Math.floor(100000 + Math.random() * 900000).toString();
  pins[telefono] = { pin, usuario, expira: Date.now() + 5*60*1000 };
  try {
    await axios.post(`${INFOBIP_BASE_URL}/sms/2/text/advanced`, {
      messages: [{ destinations: [{ to: telefono.replace(/\+/g,'') }], from: INFOBIP_SENDER, text: `VOBIXCHAT: Tu PIN es ${pin}. Valido 5 min.` }]
    }, { headers: { 'Authorization': `App ${INFOBIP_API_KEY}`, 'Content-Type': 'application/json' } });
    res.json({ok:true});
  } catch(err) {
    res.status(500).json({ok:false, msg:"Error Infobip", detalle: err.response?.data});
  }
});

app.post('/api/verificar-pin', (req, res) => {
  const { telefono, pin } = req.body;
  const data = pins[telefono];
  if(!data) return res.json({ok:false, msg:"Pide PIN primero"});
  if(Date.now() > data.expira) return res.json({ok:false, msg:"PIN expirado"});
  if(data.pin!== pin) return res.json({ok:false, msg:"PIN incorrecto"});
  res.json({ok:true, usuario: data.usuario});
});

app.get('/', (req,res)=>res.sendFile(path.join(__dirname,'index.html')));

io.on('connection', socket => {
  socket.on('registrar-canal-llamada', d => { usuarios[d.identificador_usuario]=socket.id; socket.identificador=d.identificador_usuario; });
  socket.on('mensaje-privado', d => { if(usuarios[d.para]) io.to(usuarios[d.para]).emit('mensaje-privado-recibido', d); });
  socket.on('solicitar-remote', d => { if(usuarios[d.id]) io.to(usuarios[d.id]).emit('solicitud-remote-recibida', {de:d.de, id:d.de}); });
  socket.on('senal-remote', d => { if(usuarios[d.dest]) io.to(usuarios[d.dest]).emit('senal-remote-recibida', d); });
  socket.on('disconnect', ()=>{ if(socket.identificador) delete usuarios[socket.identificador]; });
});

server.listen(process.env.PORT || 10000, ()=>console.log("VOBIXCHAT INFOBIP OK"));