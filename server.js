// VobixChat Server - Obligatorio + Anti-VOIP + Entrelazado E2E
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server,{cors:{origin:"*"},maxHttpBufferSize:1e8});

app.use(express.json({limit:'50mb'}));
app.use(express.static(path.join(__dirname,'public')));

let dbPath='./db.json';
let db={pins:{},keys:[],bans:{},history:[],reports:[]};
if(fs.existsSync(dbPath)){ try{ db=JSON.parse(fs.readFileSync(dbPath,'utf8')); }catch{} }
function saveDB(){ fs.writeFileSync(dbPath,JSON.stringify(db,null,2)); }

// ============ BLOQUEO VOIP OBLIGATORIO ============
function isVoIP(phone){
  if(!phone) return true;
  let p=phone.replace(/\s|-|\(|\)/g,'');
  // 1. Longitud minima SIM real
  if(p.replace('+','').length < 9) return true;
  // 2. Numeros repetidos 11111111, 0000000
  if(/^(\d)\1{6,}$/.test(p.replace('+',''))) return true;
  // 3. Patrones falsos
  if(p.includes('123456') || p.includes('0000') || p.includes('1111')) return true;
  // 4. VOIP USA +1 TextNow, Google Voice - BLOQUEADO
  if(p.startsWith('+1') || (p.startsWith('1') && p.length==11)) return true;
  // 5. Solo permitimos numeros reales España/Latam (puedes editar lista)
  // Si quieres solo España, deja solo +34
  let allowed = ['+34','+52','+54','+57','+51','+56','+58','+593','+591','+595','+598'];
  let isAllowed = allowed.some(c=>p.startsWith(c));
  if(!isAllowed){
    // Si no está en lista, es sospechoso -> Bloquear
    console.log(`🚫 Número no permitido por país: ${p}`);
    return true;
  }
  return false;
}

// ============ APIS ============
app.post('/send-pin',(req,res)=>{
  let {phone,username}=req.body;
  if(!phone||!username) return res.json({ok:false,msg:'Faltan datos'});

  phone=phone.trim();
  // BLOQUEO VOIP
  if(isVoIP(phone)){
    console.log(`🚫 VOIP BLOQUEADO INTENTO: ${phone} @${username}`);
    return res.json({ok:false,msg:'🚫 Números VOIP / Virtuales NO permitidos. Usa SIM real +34'});
  }
  // Ban check
  if(db.bans[phone] && db.bans[phone] > Date.now()){
    return res.json({ok:false,msg:'Baneado 24h por spam'});
  }
  let pin=Math.floor(100000+Math.random()*900000).toString();
  db.pins[phone]={pin,username,exp:Date.now()+600000}; // 10 min
  console.log(`\n🔐 PIN REAL para @${username} ${phone} = ${pin} - REGISTRO OBLIGATORIO\n`);
  saveDB();
  res.json({ok:true,msg:'PIN en logs Render'});
});

app.post('/verify-pin',(req,res)=>{
  let {phone,pin}=req.body;
  let rec=db.pins[phone];
  if(!rec || rec.pin!==pin || rec.exp < Date.now()){
    return res.json({ok:false,msg:'PIN expirado o incorrecto'});
  }
  delete db.pins[phone];
  saveDB();
  res.json({ok:true,username:rec.username});
});

app.post('/save-key',(req,res)=>{
  let {phone,publicKey}=req.body;
  let username=null;
  // Buscar usuario por phone o dejar que cliente lo mande
  for(let k of db.keys){ if(k.phone===phone) username=k.username; }
  if(!username){
    // buscar en pins o pedir
    let u=req.body.username;
    if(u) username=u;
  }
  // Guardar / actualizar clave = ENTRELAZADO
  let idx=db.keys.findIndex(k=>k.phone===phone);
  if(idx>=0) db.keys[idx].publicKey=publicKey;
  else db.keys.push({phone,username:username||'anon',publicKey,entangledAt:Date.now()});
  console.log(`🔗 ENTRELAZADO: ${phone} -> Clave guardada`);
  saveDB();
  res.json({ok:true});
});

app.get('/api/keys',(req,res)=>{
  res.json(db.keys);
});

// ============ SOCKET IO - TODO OBLIGATORIO REGISTRADO ============
let users={}; // socketId -> {username,phone}
let meetUsers=new Set();

io.on('connection',socket=>{
  console.log('Conectado',socket.id);

  socket.on('set-user',(username)=>{
    // Validar que está registrado en DB keys
    let found=db.keys.find(k=>k.username===username);
    if(!found){
      socket.emit('banned',{msg:'Debes registrarte - Obligatorio'});
      return socket.disconnect();
    }
    users[socket.id]={username,phone:found.phone};
    // Enviar historial solo a registrados entrelazados
    socket.emit('history', db.history.slice(-80));
    console.log(`✅ Entrelazado activo: @${username} ${found.phone}`);
  });

  // Chat E2E solo registrados
  socket.on('chat',d=>{
    let u=users[socket.id];
    if(!u){ socket.emit('banned',{msg:'Registro obligatorio'}); return; }
    // Spam filtro
    if(d.text && d.text.length>2000) return socket.emit('spam_warn',{msg:'Mensaje muy largo'});
    // Guardar
    db.history.push({...d,ts:Date.now()});
    if(db.history.length>300) db.history=db.history.slice(-300);
    saveDB();
    // Enviar a todos
    io.emit('chat',d);
  });

  // Meet
  socket.on('meet-join',()=>{
    if(!users[socket.id]) return;
    meetUsers.add(socket.id);
    socket.broadcast.emit('meet-user',socket.id);
  });
  socket.on('meet-signal',d=>{
    io.to(d.to).emit('meet-signal',{from:socket.id,signal:d.signal});
  });
  socket.on('meet-leave',()=>{
    meetUsers.delete(socket.id);
    socket.broadcast.emit('meet-leave',socket.id);
  });

  // Team
  socket.on('team-share-start',()=>{ if(users[socket.id]) socket.broadcast.emit('team-share-start',socket.id); });
  socket.on('team-share-stop',()=>{ if(users[socket.id]) socket.broadcast.emit('team-share-stop'); });
  socket.on('team-signal',d=>{ io.to(d.to).emit('team-signal',{from:socket.id,signal:d.signal}); });
  socket.on('team-control-request',()=>{ if(users[socket.id]) socket.broadcast.emit('team-control-request',users[socket.id].username); });
  socket.on('team-control-accept',d=>{ io.to(d.to).emit('team-control-accept'); });
  socket.on('team-event',d=>{ io.to(d.to).emit('team-event',d); });

  // Firma Espejo
  socket.on('sign-start',d=>{ if(users[socket.id]) socket.broadcast.emit('sign-start',d); });
  socket.on('sign-saved',d=>{
    if(!users[socket.id]) return;
    io.emit('sign-saved',d);
    db.reports.push({type:'sign',...d,ts:Date.now()});
    saveDB();
  });

  socket.on('disconnect',()=>{
    delete users[socket.id];
    meetUsers.delete(socket.id);
    socket.broadcast.emit('meet-leave',socket.id);
  });
});

let PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`VobixChat OBLIGATORIO ANTI-VOIP corriendo en ${PORT}`));