const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });
const path = require('path');

// ================= SEGURIDAD ANTI-TUMBE =================
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
});

let ipRequests = {};
setInterval(()=>{ ipRequests = {}; }, 60000);
app.use((req, res, next) => {
  let ip = req.ip;
  ipRequests[ip] = (ipRequests[ip] || 0) + 1;
  if(ipRequests[ip] > 60) return res.status(429).send('Demasiadas peticiones');
  next();
});

const ADMIN_KEY = "sh6684";
function checkAdmin(req, res, next){
  const key = req.query.key || req.headers['x-admin-key'];
  if(key === ADMIN_KEY) return next();
  return res.status(401).send('401 No autorizado');
}

// ================= LISTA GRATIS - NUNCA SE BLOQUEA =================
const NUMEROS_GRATIS = [
  "+34655766134","+34695746539","+18295159742","+34652024433",
  "+18096025900","+34657956823","+34658616136","+34672953430",
  "+34617575586","+18298462666","+34640245520","+34602873902",
  "+34672912081","+34676103506","+34678962221","+34604287009",
  "+18094527038","+18097087187","+34603195097","+34675535733",
  "+34614594139","+34627562819","+18296014116"
];

function maskPhone(phone){ return "****"+phone.slice(-3); }

// FILTRO INTELIGENTE - NO BLOQUEA BUENOS POR ERROR
function isRealMobile(phone){
  phone = phone.replace(/\s/g,'');
  // Si está en lista gratis, pasa siempre
  if(NUMEROS_GRATIS.includes(phone)) return true;

  if(phone.startsWith("+34")){
    let resto = phone.slice(3);
    if(/^[67]\d{8}$/.test(resto)) return true; // Movil real ES
    return false; // Fijo ES
  }

  if(phone.startsWith("+1")){
    if(/^\+1(809|829|849)\d{7}$/.test(phone)) return true; // Movil real DO
    return false; // VOIP USA
  }

  return false;
}

// ================= RUTAS =================
app.get('/admin.html', checkAdmin, (req,res)=>{
  res.sendFile(path.join(__dirname,'public','admin.html'));
});
app.get('/ping', (req,res)=> res.send('alive'));
app.use(express.static('public'));

let users = {};
let pins = {};

app.post('/send-pin', (req,res)=>{
  let {phone, username} = req.body;
  if(!phone ||!username) return res.json({ok:false, msg:"faltan datos"});
  phone = phone.replace(/\s/g,'');

  if(!isRealMobile(phone)){
    return res.json({ok:false, msg:"Solo moviles reales de compañia fisica. VOIP no permitido."});
  }

  // GRATIS - SIN INFOBIP
  if(NUMEROS_GRATIS.includes(phone)){
    let pinGratis = Math.floor(100000 + Math.random()*900000).toString();
    pins[phone] = pinGratis;
    users[phone] = {username, phone, verified:false, gratis:true, created:Date.now()};
    console.log(`>>> PIN GRATIS [${username}] ${maskPhone(phone)}: ${pinGratis}`);
    return res.json({ok:true, gratis:true});
  }

  // PAGO CON INFOBIP
  let pin = Math.floor(100000 + Math.random()*900000).toString();
  pins[phone] = pin;
  users[phone] = {username, phone, verified:false, gratis:false, created:Date.now()};
  console.log(`>>> PIN INFOBIP [${username}] ${maskPhone(phone)}: ${pin}`);
  res.json({ok:true, gratis:false});
});

app.post('/verify-pin', (req,res)=>{
  let {phone, pin} = req.body;
  if(pins[phone] && pins[phone] == pin){
    if(users[phone]) users[phone].verified = true;
    delete pins[phone];
    return res.json({ok:true, permanent:true});
  }
  res.json({ok:false, msg:"PIN incorrecto"});
});

app.get('/api/users', checkAdmin, (req,res)=>{
  let list = Object.values(users).map(u=>({
    username:u.username,
    phoneMasked:maskPhone(u.phone),
    fullPhone:u.phone,
    verified:u.verified,
    gratis:u.gratis
  }));
  res.json(list);
});

io.on('connection', socket=>{
  socket.on('chat', data=>{
    if(!data.username ||!data.text) return;
    if(data.text.length > 500) return;
    io.emit('chat', {username:data.username, text:data.text, time:Date.now()});
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, ()=> console.log("VobixChat BLINDADO FINAL listo en "+PORT));