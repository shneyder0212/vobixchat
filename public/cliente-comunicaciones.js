// VOBIXCHAT - Cliente Comunicaciones Familia
let remotePeer = null;
let remoteStream = null;
let reunionStream = null;

// Musica demo para probar audio
let cancionesDemo = [
  { title: "Happy Lofi", artist: "Pixabay $0", url: "/audio/demo1.mp3" },
  { title: "Family Vibe", artist: "Vobix", url: "/audio/demo2.mp3" }
];

// Conexion siempre viva
let socket = null;

function iniciarVobixChat(nombre, telefono) {
  // Aqui va tu validacion anti-VoIP
  if(telefono.includes('VoIP')) {
    alert('VoIP / virtuales rechazo rotundo');
    return;
  }
  
  console.log('Conectando:', nombre, telefono, 'PIN 1234');
  
  // Conectar a server.js
  socket = new WebSocket(`wss://${location.host}`);
  
  socket.onopen = () => {
    console.log('App siempre viva + notificaciones activa');
  };
}

function iniciarReunion() {
  console.log('Iniciando reunion familiar...');
  // Aqui tu codigo WebRTC
}
