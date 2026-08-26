const socket = io();
let myKeyPair, myPublicJwk;
let usersKeys = {}; // public keys de los demás

// 1. GENERAR LLAVES AL REGISTRARSE (solo 1 vez, se queda para siempre)
async function initKeys(){
  let saved = localStorage.getItem('vobix_keys');
  if(saved){
    let jwks = JSON.parse(saved);
    myKeyPair = {
      privateKey: await crypto.subtle.importKey("jwk", jwks.privateKey, {name:"ECDH", namedCurve:"P-256"}, false, ["deriveKey"]),
      publicKey: await crypto.subtle.importKey("jwk", jwks.publicKey, {name:"ECDH", namedCurve:"P-256"}, true, [])
    };
    myPublicJwk = jwks.publicKey;
  } else {
    let kp = await crypto.subtle.generateKey({name:"ECDH", namedCurve:"P-256"}, true, ["deriveKey"]);
    let pubJwk = await crypto.subtle.exportKey("jwk", kp.publicKey);
    let privJwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
    localStorage.setItem('vobix_keys', JSON.stringify({privateKey:privJwk, publicKey:pubJwk}));
    myKeyPair = kp;
    myPublicJwk = pubJwk;
  }
  // subir mi publica al servidor
  let me = JSON.parse(localStorage.getItem('vobix_user')||'{}');
  if(me.phone){
    fetch('/save-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:me.phone, publicKey:myPublicJwk})});
  }
  loadAllKeys();
}

async function loadAllKeys(){
  let r = await fetch('/api/keys'); let arr = await r.json();
  for(let u of arr){
    if(u.publicKey){
      usersKeys[u.username] = await crypto.subtle.importKey("jwk", u.publicKey, {name:"ECDH", namedCurve:"P-256"}, true, []);
    }
  }
}

// 2. DERIVAR SECRETO COMPARTIDO SOLO ENTRE 2 USUARIOS
async function getSharedSecret(theirPublicKey){
  let derived = await crypto.subtle.deriveKey({name:"ECDH", public:theirPublicKey}, myKeyPair.privateKey, {name:"AES-GCM", length:256}, false, ["encrypt","decrypt"]);
  return derived;
}

// 3. CIFRAR PARA CADA USUARIO (como WhatsApp grupo)
async function encryptForAll(text){
  let enc = new TextEncoder();
  let payloads = [];
  for(let username in usersKeys){
    if(username===JSON.parse(localStorage.getItem('vobix_user')).username) continue;
    let secret = await getSharedSecret(usersKeys[username]);
    let iv = crypto.getRandomValues(new Uint8Array(12));
    let cipher = await crypto.subtle.encrypt({name:"AES-GCM", iv}, secret, enc.encode(text));
    let b64 = btoa(String.fromCharCode(...iv)+String.fromCharCode(...new Uint8Array(cipher)));
    payloads.push({to:username, data:b64});
  }
  // tambien para mi mismo para ver mi mensaje
  let iv2 = crypto.getRandomValues(new Uint8Array(12));
  let selfSecret = await crypto.subtle.deriveKey({name:"ECDH", public:myKeyPair.publicKey}, myKeyPair.privateKey, {name:"AES-GCM", length:256}, false, ["encrypt","decrypt"]);
  let cipher2 = await crypto.subtle.encrypt({name:"AES-GCM", iv:iv2}, selfSecret, enc.encode(text));
  payloads.push({to:JSON.parse(localStorage.getItem('vobix_user')).username, data:btoa(String.fromCharCode(...iv2)+String.fromCharCode(...new Uint8Array(cipher2)))});
  return payloads;
}

async function decryptOne(b64, fromUsername){
  try{
    let theirKey = usersKeys[fromUsername]; if(!theirKey) return "[esperando llave...]";
    let secret = await getSharedSecret(theirKey);
    let raw = atob(b64); let iv = new Uint8Array([...raw.slice(0,12)].map(c=>c.charCodeAt(0)));
    let data = new Uint8Array([...raw.slice(12)].map(c=>c.charCodeAt(0)));
    let plain = await crypto.subtle.decrypt({name:"AES-GCM", iv}, secret, data);
    return new TextDecoder().decode(plain);
  }catch{ return null; }
}

// ENVIAR
window.sendChat = async function(){
  let t = document.getElementById('text').value.trim(); if(!t) return;
  let my = JSON.parse(localStorage.getItem('vobix_user'));
  let packs = await encryptForAll(t);
  for(let p of packs){
    socket.emit('chat', {username:my.username, to:p.to, text:p.data, encrypted:true, from:my.username});
  }
  document.getElementById('text').value=''; document.getElementById('text').style.height='44px';
}

// RECIBIR
socket.on('chat', async d=>{
  let me = JSON.parse(localStorage.getItem('vobix_user')||'{}');
  if(d.to && d.to!==me.username) return; // no es para mi
  let realText = d.encrypted? await decryptOne(d.text, d.from||d.username) : d.text;
  if(!realText) return;
  let div = document.createElement('div');
  div.className = d.username===me.username? 'me' : '';
  div.innerText = '@'+d.username+': '+realText+' 🔒';
  document.getElementById('messages').appendChild(div);
  document.getElementById('messages').scrollTop=document.getElementById('messages').scrollHeight;
});

function guardarParaSiempre(u,p){ localStorage.setItem('vobix_user', JSON.stringify({username:u, phone:p})); setTimeout(initKeys,500); }

initKeys();
setInterval(loadAllKeys, 5000); // actualiza llaves cada 5s