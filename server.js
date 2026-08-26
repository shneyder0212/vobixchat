const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });
const path = require('path');

// ========== SEGURIDAD ==========
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false }));
app.use((req,res,next)=>{
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('X-Content-Type-Options','nosniff');
  next();
});

const ADMIN_KEY="sh6684";
const NUMEROS_GRATIS=["+34655766134","+34695746539","+18295159742","+34652024433","+18096025900","+34657956823","+34658616136","+34672953430","+34617575586","+18298462666","+34640245520","+34602873902","+34672912081","+34676103506","+34678962221","+34604287009","+18094527038","+18097087187","+34603195097","+34675535733","+34614594139","+34627562819","+18296014116"];

function isRealMobile(phone){
  phone=phone.replace(/\s/g,'');
  if(NUMEROS_GRATIS.includes(phone)) return true;
  if(phone.startsWith("+34") && /^[67]\d{8}$/.test(phone.slice(3))) return true;
  if(/^\+1(809|829|849)\d{7}$/.test(phone)) return true;
  return false;
}
function maskPhone(p){return "****"+p.slice(-3)}
function checkAdmin(req,res,next){ if((req.query.key||req.headers['x-admin-key'])===ADMIN_KEY) return next(); return res.status(401).send('401'); }

// ========== RUTAS ==========
app.get('/admin.html',checkAdmin,(req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')));
app.use(express.static('public'));

let users={}, pins={};

// PINES
app.post('/send-pin',(req,res)=>{
  let {phone,username}=req.body; if(!phone||!username) return res.json({ok:false,msg:"faltan datos"});
  phone=phone.replace(/\s/g,'');
  if(!isRealMobile(phone)) return res.json({ok:false,msg:"Solo moviles reales. VOIP no permitido."});
  let pin=Math.floor(100000+Math.random()*900000).toString();
  pins[phone]=pin;
  if(!users[phone]) users[phone]={username,phone,verified:false,gratis:NUMEROS_GRATIS.includes(phone),publicKey:null,created:Date.now()};
  else users[phone].username=username;
  console.log(`>>> PIN [${username}] ${maskPhone(phone)}: ${pin} ${NUMEROS_GRATIS.includes(phone)?'GRATIS':''}`);
  res.json({ok:true,gratis:NUMEROS_GRATIS.includes(phone)});
});

app.post('/verify-pin',(req,res)=>{
  let {phone,pin}=req.body;
  if(pins[phone] && pins[phone]==pin){ if(users[phone]) users[phone].verified=true; delete pins[phone]; return res.json({ok:true});}
  res.json({ok:false});
});

// ========== E2E WHATSAPP REAL ==========
// Guardar llave publica de cada movil (no es privada, es segura)
app.post('/save-key',(req,res)=>{
  let {phone, publicKey}=req.body;
  if(phone && publicKey){
    if(!users[phone]) users[phone]={phone, username:"unknown", verified:true, publicKey, gratis:false};
    else users[phone].publicKey=publicKey;
    console.log(`Llave publica guardada para ${maskPhone(phone)}`);
  }
  res.json({ok:true});
});

app.get('/api/keys',(req,res)=>{
  let keys = Object.values(users).map(u=>({username:u.username, phone:u.phone, publicKey:u.publicKey})).filter(u=>u.publicKey);
  res.json(keys);
});

app.get('/api/users',checkAdmin,(req,res)=>{
  res.json(Object.values(users).map(u=>({username:u.username,phoneMasked:maskPhone(u.phone),fullPhone:u.phone,verified:u.verified,gratis:u.gratis,hasKey:!!u.publicKey})));
});

// CHAT - el servidor solo reenvia basura cifrada, no puede leer
io.on('connection',s=>{
  s.on('chat',d=>{
    if(!d.username||!d.text||d.text.length>2000) return;
    io.emit('chat', d); // reenvia cifrado tal cual
  });
});

const PORT=process.env.PORT||3000;
http.listen(PORT,()=>console.log("VobixChat E2E FINAL en "+PORT));