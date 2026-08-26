const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.json());
const ADMIN_KEY = "sh6684";

// === TU LISTA DE NUMEROS GRATIS - YA INCLUIDA ===
const NUMEROS_GRATIS = [
  "+34655766134","+34695746539","+18295159742","+34652024433",
  "+18096025900","+34657956823","+34658616136","+34672953430",
  "+34617575586","+18298462666","+34640245520","+34602873902",
  "+34672912081","+34676103506","+34678962221","+34604287009",
  "+18094527038","+18097087187","+34603195097","+34675535733",
  "+34614594139","+34627562819","+18296014116"
];

function maskPhone(phone){ return "****"+phone.slice(-3); }

// Filtro anti-VOIP simple: solo moviles reales ES y DO
function isRealMobile(phone){
  // España: +34 6xx y 7xx es movil real
  if(phone.startsWith("+34") && /^\+34[67]\d{8}$/.test(phone)) return true;
  // Dominicana: +1 809, 829, 849 son moviles reales de Claro/Altice
  if(/^\+1(809|829|849)\d{7}$/.test(phone)) return true;
  return false;
}

function checkAdmin(req,res,next){
  const key = req.query.key || req.headers['x-admin-key'];
  if(key === ADMIN_KEY) return next();
  return res.status(401).send('401 No autorizado');
}

app.get('/admin.html', checkAdmin, (req,res)=>{ res.sendFile(path.join(__dirname,'public','admin.html')); });
app.get('/api/users', checkAdmin);
app.use(express.static('public'));

let users = {}; let pins = {};

app.post('/send-pin', (req,res)=>{
  let {phone, username} = req.body;
  if(!phone ||!username) return res.json({ok:false, msg:"faltan datos"});

  // Bloqueo VOIP
  if(!isRealMobile(phone)){
    return res.json({ok:false, msg:"Solo se aceptan moviles reales de compañia fisica (ES +34 6/7 y DO +1 809/829/849). VOIP no permitido."});
  }

  // Si es GRATIS
  if(NUMEROS_GRATIS.includes(phone)){
    let pinGratis = Math.floor(100000 + Math.random()*900000).toString();
    pins[phone] = pinGratis;
    users[phone] = {username, phone, verified:false};
    console.log(`PIN GRATIS (SIN INFOBIP) para ${username} ${maskPhone(phone)}: ${pinGratis}`);
    return res.json({ok:true, gratis:true, msg:"PIN gratis generado - miralo en logs de Render"});
  }

  // Flujo normal con Infobip
  let pin = Math.floor(100000 + Math.random()*900000).toString();
  pins[phone] = pin;
  users[phone] = {username, phone, verified:false};
  console.log(`PIN INFOBIP para ${username} ${maskPhone(phone)}: ${pin}`);
  // aqui iria tu codigo de Infobip
  res.json({ok:true});
});

app.post('/verify-pin', (req,res)=>{
  let {phone, pin} = req.body;
  if(pins[phone] == pin){
    if(users[phone]) users[phone].verified = true;
    res.json({ok:true});
  } else {
    res.json({ok:false});
  }
});

app.get('/api/users', (req,res)=>{
  let list = Object.values(users).map(u=>({ username:u.username, phoneMasked:maskPhone(u.phone), verified:u.verified }));
  res.json(list);
});

io.on('connection', socket=>{
  socket.on('chat', data=>{ io.emit('chat', {username:data.username, text:data.text}); });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, ()=> console.log("Servidor listo en "+PORT));