const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.json());
app.use(express.static('public'));

let users = {}; // phone -> {username, pin, verified}
let pins = {};

function maskPhone(phone){
  if(!phone || phone.length < 4) return "****";
  return "****" + phone.slice(-3);
}

app.post('/send-pin', (req,res)=>{
  let {phone, username} = req.body;
  if(!phone ||!username) return res.json({ok:false, error:"Falta dato"});
  let pin = Math.floor(100000 + Math.random()*900000).toString();
  pins[phone] = pin;
  users[phone] = {username, phone, verified:false};
  console.log(`PIN para ${username} (${maskPhone(phone)}): ${pin}`);
  // Aquí va tu SMS real, por ahora solo consola
  res.json({ok:true});
});

app.post('/verify-pin', (req,res)=>{
  let {phone, username, pin} = req.body;
  if(pins[phone] == pin){
    users[phone].verified = true;
    res.json({ok:true});
  } else {
    res.json({ok:false});
  }
});

// Solo el admin ve datos, y con mascara
app.get('/api/users', (req,res)=>{
  let list = Object.values(users).map(u=>({
    username: u.username,
    phoneMasked: maskPhone(u.phone),
    verified: u.verified
  }));
  res.json(list);
});

app.get('/', (req,res)=> res.sendFile(path.join(__dirname,'public','index.html')));

io.on('connection', socket=>{
  socket.on('chat', data=>{
    // Nunca enviamos el telefono real
    io.emit('chat', {username: data.username, text: data.text});
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, ()=> console.log("Servidor en puerto "+PORT));