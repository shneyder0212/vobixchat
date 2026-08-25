const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, pingInterval: 10000, pingTimeout: 5000 });

app.use(express.json());
app.use(express.static(__dirname));

const INFOBIP_API_KEY = "PON_AQUI_TU_API_KEY_DE_INFOBIP";
const INFOBIP_BASE_URL = "https://api.infobip.com";
const VAPID_PUBLIC = "PON_AQUI_TU_VAPID_PUBLIC_KEY";
const VAPID_PRIVATE = "PON_AQUI_TU_VAPID_PRIVATE_KEY";

const NUMEROS_FAMILIA_GRATIS = [
  "34658616136",
  "34672953430",
  "18096025900",
  "18295159742",
  "34645711126",
  "18295229469",
  "34657956823",
  "34695746539",
  "34652024433",
  "18094527038"
];

const DB_FILE = path.join(__dirname, 'vobix_usuarios_db.json');
const PUSH_FILE = path.join(__dirname, 'vobix_push_db.json');

function leerDB(){ try{ if(!fs.existsSync(DB_FILE)) return []; return JSON.parse(fs.readFileSync(DB_FILE,'utf8')); }catch(e){return [];} }
function guardarDB(d){ fs.writeFileSync(DB_FILE, JSON.stringify(d,null,2)); }
function leerPush(){ try{ if(!fs.existsSync(PUSH_FILE)) return {}; return JSON.parse(fs.readFileSync(PUSH_FILE,'utf8')); }catch(e){return {};} }
function guardarPush(d){ fs.writeFileSync(PUSH_FILE, JSON.stringify(d,null,2)); }

function esVoIP_Servidor(num){ if(num.length<10) return true; return false; }

app.post('/api/enviar-pin-infobip', async (req,res)=>{
  const {to,nombre} = req.body;
  let numeroLimpio = to.replace(/[^0-9]/g,'');
  if(esVoIP_Servidor(numeroLimpio)) return res.json({ok:false,error:"⛔ VoIP prohibido - rechazo rotundo"});
  const esFamilia = NUMEROS_FAMILIA_GRATIS.some(n=>numeroLimpio.includes(n.slice(-9))||n===numeroLimpio);
  let db=leerDB();
  if(esFamilia){
    if(!db.find(u=>u.numero===numeroLimpio)){
      db.push({numero:numeroLimpio,nombre,verificado:true,esFamilia:true,tipo:"FAMILIA_GRATIS",fechaRegistro:new Date().toISOString(),amigos:NUMEROS_FAMILIA_GRATIS.filter(n=>n!==numeroLimpio)});
      guardarDB(db);
    }
    return res.json({ok:true,pin:"1234",familia:true});
  }
  const pin = Math.floor(100000+Math.random()*900000).toString();
  let ex=db.find(u=>u.numero===numeroLimpio);
  if(ex){ex.pinTemporal=pin;ex.fechaPin=Date.now();} else {db.push({numero:numeroLimpio,nombre,pinTemporal:pin,fechaPin:Date.now(),verificado:false});}
  guardarDB(db);
  if(INFOBIP_API_KEY!=="PON_AQUI_TU_API_KEY_DE_INFOBIP"){
    await fetch(`${INFOBIP_BASE_URL}/sms/2/text/advanced`,{
      method:'POST',headers:{'Authorization':`App ${INFOBIP_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({messages:[{destinations:[{to:numeroLimpio}],from:"VobixChat",text:`VobixChat PIN: ${pin} valido 5 min.`}]})
    });
  }
  console.log(`PIN Infobip ${numeroLimpio}: ${pin}`);
  res.json({ok:true,pin:pin});
});

app.post('/api/guardar-subscripcion',(req,res)=>{
  const {numero,subscription} = req.body;
  let pushDB=leerPush();
  pushDB[numero]=subscription;
  guardarPush(pushDB);
  console.log(`Push guardado ${numero} - Siempre viva`);
  res.json({ok:true});
});

io.on('connection',(socket)=>{
  socket.on('registrar-canal-llamada',(data)=>{ socket.join(data.identificador_usuario); });
  socket.on('senalizacion-grupal', async (data)=>{
    io.to(data.destinatario).emit('senalizacion-grupal',data);
    if(data.tipo==='oferta'){
      let pushDB=leerPush();
      let sub=pushDB[data.destinatario];
      if(sub){
        try{
          const webpush=require('web-push');
          webpush.setVapidDetails('mailto:admin@vobixchat.com',VAPID_PUBLIC,VAPID_PRIVATE);
          await webpush.sendNotification(sub, JSON.stringify({tipo:'llamada',emisor:data.emisor,nombre:data.aliasEmisor||data.emisor,conVideo:data.conVideo}));
        }catch(e){}
      }
    }
  });
  socket.on('enviar-mensaje-chat', async (data)=>{
    io.to(data.destinatario).emit('nuevo-mensaje-chat',data);
    let db=leerDB();
    let emisor=db.find(u=>u.numero===data.emisor);
    let dest=db.find(u=>u.numero===data.destinatario);
    if(emisor&&dest){
      if(!emisor.amigos) emisor.amigos=[];
      if(!emisor.amigos.includes(data.destinatario)) emisor.amigos.push(data.destinatario);
      if(!dest.amigos) dest.amigos=[];
      if(!dest.amigos.includes(data.emisor)) dest.amigos.push(data.emisor);
      guardarDB(db);
    }
    let pushDB=leerPush();
    let sub=pushDB[data.destinatario];
    if(sub){
      try{
        const webpush=require('web-push');
        webpush.setVapidDetails('mailto:admin@vobixchat.com',VAPID_PUBLIC,VAPID_PRIVATE);
        await webpush.sendNotification(sub, JSON.stringify({tipo:'mensaje',emisor:data.emisor,nombre:data.aliasEmisor,texto:data.texto}));
      }catch(e){}
    }
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>{ console.log(`VobixChat SIEMPRE VIVA puerto ${PORT} - 10 familia gratis`); });
