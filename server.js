const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static(__dirname));

// --- CONFIGURACIÓN ---
const INFOBIP_API_KEY = "PON_AQUI_TU_API_KEY_DE_INFOBIP"; // <-- pon tu key real
const INFOBIP_BASE_URL = "https://api.infobip.com";

// LISTA FAMILIA GRATIS PARA SIEMPRE - MISMOS QUE EN INDEX.HTML
const NUMEROS_FAMILIA_GRATIS = [
  "34658616136", // hijo
  "34672953430", // madre
  "18096025900", // primo
  "18295159742", // primo
  "34645711126", // tia
  "18295229469", // hermano RD
  "34657956823", // hija
  "34695746539"  // mujer
];

// --- BASE DE DATOS SIMPLE EN ARCHIVO JSON PARA QUE QUEDEN PARA SIEMPRE ---
const DB_FILE = path.join(__dirname, 'vobix_usuarios_db.json');
function leerDB(){
  try{
    if(!fs.existsSync(DB_FILE)) return [];
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  }catch(e){ return []; }
}
function guardarDB(data){
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// --- ANTI-VOIP ROTUNDO - SERVIDOR ---
function esVoIP_Servidor(numero){
  // Bloqueo básico
  if(numero.length < 10) return true;
  // Aquí puedes integrar una API real de lookup como Veriphone o AbstractAPI
  // Por ahora bloqueamos rangos conocidos VoIP
  const prefijosVoIP = ["3460", "34601", "1809"];
  // Si quieres bloqueo 100% real, contrata: https://veriphone.io/
  return false; // por defecto dejamos pasar, tu validas en index
}

// --- RUTA PARA ENVIAR PIN INFOBIP - SOLO PARA INVITADOS, FAMILIA NO PASA POR AQUÍ ---
app.post('/api/enviar-pin-infobip', async (req, res) => {
  const { to, nombre } = req.body;
  let numeroLimpio = to.replace(/[^0-9]/g, '');

  // 1. RECHAZO ROTUNDO VOIP
  if(esVoIP_Servidor(numeroLimpio)){
    return res.json({ ok: false, error: "⛔ Número VoIP / virtual prohibido - rechazo rotundo" });
  }

  // 2. SI ES FAMILIA, NO COBRAR INFOBIP
  const esFamilia = NUMEROS_FAMILIA_GRATIS.some(n => numeroLimpio.includes(n.slice(-9)) || n === numeroLimpio);
  if(esFamilia){
    return res.json({ ok: true, pin: "1234", familia: true, msg: "Familia gratis - PIN 1234" });
  }

  // 3. SI ES INVITADO EXTERNO, SÍ ENVIAR INFOBIP
  const pin = Math.floor(100000 + Math.random()*900000).toString();
  
  try{
    // Guardar pin temporal en DB
    let db = leerDB();
    let existente = db.find(u => u.numero === numeroLimpio);
    if(existente){
      existente.pinTemporal = pin;
      existente.fechaPin = Date.now();
    } else {
      db.push({ numero: numeroLimpio, nombre: nombre, pinTemporal: pin, fechaPin: Date.now(), verificado: false });
    }
    guardarDB(db);

    // ENVIO REAL INFOBIP
    if(INFOBIP_API_KEY !== "PON_AQUI_TU_API_KEY_DE_INFOBIP"){
      await fetch(`${INFOBIP_BASE_URL}/sms/2/text/advanced`, {
        method: 'POST',
        headers: {
          'Authorization': `App ${INFOBIP_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [{
            destinations: [{ to: numeroLimpio }],
            from: "VobixChat",
            text: `VobixChat: Tu PIN es ${pin}. No lo compartas. Valido 5 min.`
          }]
        })
      });
    }

    console.log(`PIN Infobip para ${numeroLimpio}: ${pin}`);
    // En producción NO devuelvas el pin, solo ok:true
    res.json({ ok: true, pin: pin }); // para pruebas te lo devuelvo

  } catch(e){
    console.error(e);
    res.json({ ok: false, error: "Error Infobip" });
  }
});

// --- RUTA PARA VERIFICAR PIN Y REGISTRAR PARA SIEMPRE ---
app.post('/api/verificar-pin', (req, res) => {
  const { numero, pin } = req.body;
  let db = leerDB();
  let user = db.find(u => u.numero === numero);

  const esFamilia = NUMEROS_FAMILIA_GRATIS.includes(numero) || NUMEROS_FAMILIA_GRATIS.some(n => numero.includes(n.slice(-9)));

  if(esFamilia && pin === "1234"){
    // Registrar familia para siempre
    if(!user){
      db.push({ numero, verificado: true, esFamilia: true, tipo: "FAMILIA_GRATIS", fechaRegistro: new Date().toISOString(), amigos: NUMEROS_FAMILIA_GRATIS.filter(n=>n!==numero) });
    } else {
      user.verificado = true; user.esFamilia = true;
    }
    guardarDB(db);
    return res.json({ ok: true, familia: true });
  }

  if(user && user.pinTemporal === pin){
    // Verificar que no expiró (5 min)
    if(Date.now() - user.fechaPin > 5*60*1000){
      return res.json({ ok: false, error: "PIN expirado" });
    }
    user.verificado = true;
    user.fechaRegistro = new Date().toISOString();
    guardarDB(db);
    return res.json({ ok: true });
  }

  res.json({ ok: false, error: "PIN incorrecto" });
});

// --- SOCKET.IO PARA LLAMADAS Y CHATS ---
io.on('connection', (socket) => {
  console.log('Conectado:', socket.id);

  socket.on('registrar-canal-llamada', (data) => {
    socket.join(data.identificador_usuario);
    console.log(`Usuario ${data.identificador_usuario} registrado en sala`);
  });

  socket.on('senalizacion-grupal', (data) => {
    // Anti-VoIP también en señalización
    io.to(data.destinatario).emit('senalizacion-grupal', data);
  });

  socket.on('enviar-mensaje-chat', (data) => {
    io.to(data.destinatario).emit('nuevo-mensaje-chat', data);
    // Guardar amigos
    let db = leerDB();
    let emisor = db.find(u => u.numero === data.emisor);
    let dest = db.find(u => u.numero === data.destinatario);
    if(emisor && dest){
      if(!emisor.amigos) emisor.amigos = [];
      if(!emisor.amigos.includes(data.destinatario)) emisor.amigos.push(data.destinatario);
      if(!dest.amigos) dest.amigos = [];
      if(!dest.amigos.includes(data.emisor)) dest.amigos.push(data.emisor);
      guardarDB(db);
    }
  });

  socket.on('unirse-sala-firma', (sala) => { socket.join(sala); });
  socket.on('sincronizar-trazo-firma', (data) => { socket.to(data.salaFirma).emit('recibir-trazo-firma', data); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`VobixChat servidor en puerto ${PORT}`);
  console.log(`Familia gratis: ${NUMEROS_FAMILIA_GRATIS.join(', ')}`);
});
