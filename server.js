const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const app=express();
const server=http.createServer(app);
const io=new Server(server,{cors:{origin:"*"}});
app.get('/',(req,res)=>{res.sendFile(__dirname+'/index.html')});
app.use(express.static(__dirname));
let usuarios={};
io.on('connection',socket=>{
socket.on('registrar-canal-llamada',d=>{usuarios[d.identificador_usuario]=socket.id});
socket.on('registrar-remote',d=>{usuarios['remote-'+d.id]=socket.id});
socket.on('solicitar-remote',d=>{let dest=usuarios['remote-'+d.id]||usuarios[d.id];if(dest) io.to(dest).emit('solicitud-remote-recibida',{id:d.id,de:d.de})});
socket.on('senal-remote',d=>{let dest=usuarios['remote-'+d.dest]||usuarios[d.id];if(dest) io.to(dest).emit('senal-remote-recibida',d)});
socket.on('mensaje-privado',d=>{let dest=usuarios[d.para];if(dest) io.to(dest).emit('mensaje-privado-recibido',d)});
});
server.listen(process.env.PORT||10000,()=>{console.log('OK')});