const socket = io();

// ===== CIFRADO EXTREMO A EXTREMO VOBIX =====
const SECRET_KEY = "vobix-2024-clave-fija-32chars!!"; // 32 chars

async function encrypt(text){
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(SECRET_KEY), {name:"AES-GCM"}, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({name:"AES-GCM", iv}, key, enc.encode(text));
  return btoa(String.fromCharCode(...iv) + String.fromCharCode(...new Uint8Array(cipher)));
}
async function decrypt(b64){
  try{
    const enc = new TextEncoder(); const dec = new TextDecoder();
    const raw = atob(b64); const iv = new Uint8Array([...raw.slice(0,12)].map(c=>c.charCodeAt(0)));
    const data = new Uint8Array([...raw.slice(12)].map(c=>c.charCodeAt(0)));
    const key = await crypto.subtle.importKey("raw", enc.encode(SECRET_KEY), {name:"AES-GCM"}, false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({name:"AES-GCM", iv}, key, data);
    return dec.decode(plain);
  }catch{ return "[mensaje cifrado]"; }
}

// Enviar cifrado
async function sendChatCifrado(){
  let t = document.getElementById('text').value.trim();
  if(!t) return;
  let my = JSON.parse(localStorage.getItem('vobix_user'));
  let cifrado = await encrypt(t);
  socket.emit('chat', {username: my.username, text: cifrado, encrypted: true});
  document.getElementById('text').value = '';
  document.getElementById('text').style.height='44px';
}

// Recibir y descifrar
socket.on('chat', async data=>{
  let textoReal = data.encrypted ? await decrypt(data.text) : data.text;
  let div = document.createElement('div');
  let my = JSON.parse(localStorage.getItem('vobix_user')||'{}');
  div.className = data.username===my.username ? 'me' : '';
  div.innerText = '@'+data.username+': '+textoReal;
  document.getElementById('messages').appendChild(div);
  document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
});

// Para que tu index.html siga funcionando con el boton
window.sendChat = sendChatCifrado;

function guardarParaSiempre(u,p){ localStorage.setItem('vobix_user', JSON.stringify({username:u, phone:p})); }