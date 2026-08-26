const socket = io();

// Si ya se registró, queda para siempre
let myUser = JSON.parse(localStorage.getItem('vobix_user') || 'null');
if(myUser){
  document.getElementById('login') && (document.getElementById('login').style.display='none');
  document.getElementById('chat') && (document.getElementById('chat').style.display='block');
  document.getElementById('myUser') && (document.getElementById('myUser').innerText = '@' + myUser.username);
}

// PING cada 5 min para que Render nunca se duerma
setInterval(() => {
  fetch('/ping').then(r => console.log('ping vivo')).catch(()=>{});
}, 300000); // 5 minutos
fetch('/ping'); // primer ping al entrar

// Permiso para timbre y vibrador
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('/sw.js');
}
if(Notification && Notification.permission !== 'granted'){
  Notification.requestPermission();
}

function sonarTimbre(){
  // Sonido
  try{
    let audio = new Audio('/ring.mp3');
    audio.play();
  }catch(e){}
  // Vibrador
  if(navigator.vibrate) navigator.vibrate([500,200,500,200,500]);
  // Notificación aunque esté cerrada
  if(Notification.permission === 'granted'){
    new Notification('VobixChat - Te llaman', { body: 'Tienes una llamada entrante', vibrate: [500,200,500] });
  }
}

// Socket chat
socket.on('chat', data => {
  sonarTimbre();
  let box = document.getElementById('messages');
  if(box){
    let div = document.createElement('div');
    div.innerText = '@' + data.username + ': ' + data.text;
    box.appendChild(div);
  }
});

// Cuando verifica el PIN
window.guardarParaSiempre = function(username, phone){
  localStorage.setItem('vobix_user', JSON.stringify({username, phone}));
  myUser = {username, phone};
}