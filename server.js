// server.js - VobixChat Familia Gratis - Todo en uno
const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const path=require('path');
const app=express();
const server=http.createServer(app);
const io=new Server(server,{cors:{origin:"*"}});
app.use(express.json());
app.use(express.static(path.join(__dirname,'public')));
let pins={}; let users={};

app.post('/send-pin',(req,res)=>{
  let {phone,username}=req.body;
  let pin=Math.floor(100000+Math.random()*900000).toString();
  pins[phone]=pin;
  users[phone]=username;
  console.log(`PIN GRATIS ${username} ${phone}: ${pin}`);
  res.json({ok:true,pin:pin});
});

app.post('/verify-pin',(req,res)=>{
  if(pins[req.body.phone]==req.body.pin){
    res.json({ok:true,username:users[req.body.phone]});
  }else res.json({ok:false});
});

io.on('connection',s=>{
  s.on('set-user',u=>s.username=u);
  s.on('chat',d=>io.emit('chat',d));
  s.on('meet-join',({room})=>{
    s.join(room);
    s.to(room).emit('meet-user-joined',{id:s.id});
    let others=Array.from(io.sockets.adapter.rooms.get(room)||[]).filter(id=>id!=s.id).map(id=>({id}));
    io.to(s.id).emit('meet-users',others);
  });
  s.on('meet-signal',({to,signal})=>io.to(to).emit('meet-signal',{from:s.id,signal}));
  s.on('meet-leave',({room})=>{s.leave(room); s.to(room).emit('meet-user-left',s.id);});
  s.on('disconnect',()=>io.emit('meet-user-left',s.id));
});

server.listen(process.env.PORT||3000,()=>console.log('VobixChat Familia Gratis LISTO'));