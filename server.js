const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const path=require('path');
const fs=require('fs');

const app=express();
const server=http.createServer(app);
const io=new Server(server,{cors:{origin:"*"}});

app.use(express.json());
app.use(express.static(path.join(__dirname,'public')));

let db={pins:{},users:{},keys:{},bans:{},chats:[]};
let spam={};
const DB_FILE='./db.json';

function loadDB(){ try{ if(fs.existsSync(DB_FILE)) db=JSON.parse(fs.readFileSync(DB_FILE,'utf8')); }catch{} }
function saveDB(){ fs.writeFileSync(DB_FILE,JSON.stringify(db,null,2)); }
loadDB();

// PIN
app.post('/send-pin',(req,res)=>{
  let {phone,username}=req.body;
  if(!phone||!username) return res.json({ok:false,msg:'faltan datos'});
  if(db.bans[phone] && db.bans[phone] > Date.now()) return res.json({ok:false,msg:'Baneado hasta '+new Date(db.bans[phone]).toLocaleTimeString()});
  let pin=Math.floor(100000+Math.random()*900000).toString();
  db.pins[phone]={pin,username,exp:Date.now()+600000};
  console.log(`\n🔐 PIN para ${username} ${phone} = ${pin}\n`);
  saveDB();
  res.json({ok:true});
});

app.post('/verify-pin',(req,res)=>{
  let {phone,pin}=req.body;
  let p=db.pins[phone];
  if(!p||p.pin!==pin||p.exp<Date.now()) return res.json({ok:false});
  db.users[phone]=p.username;
  saveDB();
  res.json({ok:true,username:p.username});
});

app.post('/save-key',(req,res)=>{
  let {phone,publicKey}=req.body;
  if(db.users[phone]){
    db.keys[db.users[phone]]=publicKey;
    saveDB();
  }
  res.json({ok:true});
});

app.get('/api/keys',(req,res)=>{
  let arr=Object.keys(db.keys).map(u=>({username:u,publicKey:db.keys[u]}));
  res.json(arr);
});

io.on('connection',s=>{
  console.log('Conectado',s.id);

  s.on('chat',d=>{
    let phone=d.phone;
    // Anti-spam
    let now=Date.now();
    if(!spam[phone]) spam[phone]=[];
    spam[phone]=spam[phone].filter(t=>now-t<10000);
    spam[phone].push(now);
    if(spam[phone].length>6){
      db.bans[phone]=now+60000;
      saveDB();
      s.emit('banned',{msg:'Baneado 1 min por spam'});
      io.emit('banned',{msg:`Usuario ${d.username} baneado por spam`});
      return;
    }
    if(spam[phone].length>4){
      s.emit('spam_warn',{msg:'¡Baja la velocidad! Anti-spam'});
      return;
    }

    db.chats.push({...d,time:now});
    if(db.chats.length>300) db.chats.shift();
    saveDB();

    if(d.to){
      // Mensaje privado E2E - buscar socket del destinatario
      for(let [id,sock] of io.sockets.sockets){
        if(sock.username===d.to) io.to(id).emit('chat',d);
      }
      s.emit('chat',d);
    }else{
      io.emit('chat',d);
    }
  });

  s.on('set-user',u=>{ s.username=u; });

  s.emit('history',db.chats.slice(-80));

  // VobixMeet 30K HD
  s.on('meet-join',()=>s.broadcast.emit('meet-user',s.id));
  s.on('meet-signal',d=>io.to(d.to).emit('meet-signal',{from:s.id,signal:d.signal}));
  s.on('meet-leave',()=>s.broadcast.emit('meet-leave',s.id));

  // TeamViewer gratis
  s.on('team-share-start',()=>s.broadcast.emit('team-share-start',s.id));
  s.on('team-share-stop',()=>s.broadcast.emit('team-share-stop',s.id));
  s.on('team-signal',d=>io.to(d.to).emit('team-signal',{from:s.id,signal:d.signal}));
  s.on('team-control-request',()=>s.broadcast.emit('team-control-request',s.id));
  s.on('team-control-accept',d=>io.to(d.to).emit('team-control-accept',s.id));
  s.on('team-event',d=>io.to(d.to).emit('team-event',d));

  // Firma espejo
  s.on('sign-start',d=>s.broadcast.emit('sign-start',d));
  s.on('sign-signal',d=>s.broadcast.emit('sign-signal',d));
  s.on('sign-done',d=>s.broadcast.emit('sign-done',d));
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log('VobixChat DIOS en '+PORT));