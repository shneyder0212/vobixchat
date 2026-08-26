const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });
const path = require('path');
const fs = require('fs');

app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false }));

const ADMIN_KEY = "sh6684";
const NUMEROS_GRATIS = ["+34655766134","+34695746539","+18295159742","+34652024433","+18096025900","+34657956823","+34658616136","+34672953430","+34617575586","+18298462666","+34640245520","+34602873902","+34672912081","+34676103506","+34678962221","+34604287009","+18094527038","+18097087187","+34603195097","+34675535733","+34614594139","+34627562819","+18296014116"];

let users = {};
let pins = {};
let banned = {};
let msgHistory = [];
let userMsgs = {};
let spamCount = {};

try{ if(fs.existsSync('banned.json')) banned = JSON.parse(fs.readFileSync('banned.json')); }catch{}
function saveBanned(){ try{ fs.writeFileSync('banned.json', JSON.stringify(banned)); }catch{} }
function isRealMobile(phone){
  phone=phone.replace(/\s/g,'');
  if(NUMEROS_GRATIS.includes(phone)) return true;
  if(phone.startsWith("+34") && /^[67]\d{8}$/.test(phone.slice(3))) return true;
  if(/^\+1(809|829|849)\d{7}$/.test(phone)) return true;
  return false;
}
function maskPhone(p){ return "****"+p.slice(-3); }
function checkAdmin(req,res,next){ if((req.query.key||req.headers['x-admin-key'])===ADMIN_KEY) return next(); return res.status(401).send('No autorizado'); }

function isSpamming(phone){
  let now = Date.now();
  if(banned[phone] && banned[phone] > now){
    return {banned:true, timeLeft: Math.ceil((banned[phone]-now)/60000)};
  }
  if(banned[phone] && banned[phone] <= now){ delete banned[phone]; saveBanned(); }
  if(!userMsgs[phone]) userMsgs[phone]=[];
  userMsgs[phone] = userMsgs[phone].filter(t=> now - t < 10000);
  userMsgs[phone].push(now);
  if(userMsgs[phone].length > 5){
    if(!spamCount[phone]) spamCount[phone]=0;
    spamCount[phone]++;
    if(spamCount[phone]>=2){
      banned[phone]= now + 5*60*1000;
      saveBanned();
      return {banned:true, timeLeft:5};
    }
    return {spam:true};
  }
  return {ok:true};
}

function containsSpam(text){
  let t = text.toLowerCase();
  let malas = ["porno","xxx","http://","https://","t.me/","@everyone","compra seguidores","dinero facil","crypto","onlyfans"];
  return malas.some(p=> t.includes(p));
}

app.get('/admin.html', checkAdmin, (req,res)=> res.sendFile(path.join(__dirname,'public','admin.html')));
app.use(express.static('public'));

app.post('/send-pin',(req,res)=>{
  let {phone,username}=req.body;
  if(!phone||!username) return res.json({ok:false,msg:"Faltan datos"});
  phone=phone.replace(/\s/g,'');
  if(banned[phone] && banned[phone] > Date.now()) return res.json({ok:false,msg:`Baneado ${Math.ceil((banned[phone]-Date.now())/60000)} min`});
  if(!isRealMobile(phone)) return res.json({ok:false,msg:"Solo moviles reales"});
  let pin=Math.floor(100000+Math.random()*900000).toString();
  pins[phone]=pin;
  if(!users[phone]) users[phone]={username,phone,verified:false,gratis:NUMEROS_GRATIS.includes(phone),publicKey:null,created:Date.now()};
  else users[phone].username=username;
  console.log(`>>> PIN [${username}] ${maskPhone(phone)}: ${pin}`);
  res.json({ok:true,gratis:NUMEROS_GRATIS.includes(phone)});
});

app.post('/verify-pin',(req,res)=>{
  let {phone,pin}=req.body;
  if(pins[phone] && pins[phone]==pin){
    if(users[phone]) users[phone].verified=true;
    delete pins[phone];
    return res.json({ok:true});
  }
  res.json({ok:false});
});

app.post('/save-key',(req,res)=>{
  let {phone,publicKey}=req.body;
  if(phone && publicKey && users[phone]) users[phone].publicKey=publicKey;
  res.json({ok:true});
});

app.get('/api/keys',(req,res)=>{
  res.json(Object.values(users).map(u=>({username:u.username,publicKey:u.publicKey})).filter(u=>u.publicKey));
});

app.get('/api/users',checkAdmin,(req,res)=>{
  res.json(Object.values(users).map(u=>({
    username:u.username,phoneMasked:maskPhone(u.phone),fullPhone:u.phone,verified:u.verified,gratis:u.gratis,hasKey:!!u.publicKey,banned:!!banned[u.phone]
  })));
});

app.post('/api/unban',checkAdmin,(req,res)=>{
  let {phone}=req.body;
  delete banned[phone]; delete spamCount[phone]; delete userMsgs[phone];
  saveBanned();
  res.json({ok:true});
});

io.on('connection', s=>{
  s.emit('history', msgHistory);
  s.on('chat', d=>{
    if(!d.username ||!d.text ||!d.phone) return;
    let phone = d.phone.replace(/\s/g,'');
    let check = isSpamming(phone);
    if(check.banned){
      s.emit('banned', {msg:`Baneado ${check.timeLeft} min por spam`});
      return;
    }
    if(check.spam){
      s.emit('spam_warn', {msg:"Vas muy rapido, espera"});
      return;
    }
    if(containsSpam(d.text)){
      if(!spamCount[phone]) spamCount[phone]=0;
      spamCount[phone]++;
      if(spamCount[phone]>=3){
        banned[phone]=Date.now()+10*60*1000;
        saveBanned();
        s.emit('banned',{msg:"Baneado 10 min por spam"});
        return;
      }
      s.emit('spam_warn',{msg:"Mensaje bloqueado por spam"});
      return;
    }
    let msg = {...d, time:Date.now()};
    msgHistory.push(msg);
    if(msgHistory.length>100) msgHistory.shift();
    io.emit('chat', msg);
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, ()=> console.log("VobixChat BLINDADO FINAL en "+PORT));