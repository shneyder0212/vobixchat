// VobixChat - Obligatorio + Entrelazado + E2E
const socket = io();
let myKeys, myPub, usersKeys={};

(function(){
  let u = localStorage.getItem('vobix_user');
  if(!u){
    let login = document.getElementById('login');
    let app = document.getElementById('app');
    if(login) login.style.display='flex';
    if(app) app.style.display='none';
  } else {
    try{
      let me = JSON.parse(u);
      socket.emit('set-user', me.username);
      console.log("Entrelazado activo:", me.username);
    }catch{}
  }
})();

function toggleMenu(){ let m=document.getElementById('menu3'); m.style.display=m.style.display==='flex'?'none':'flex'; }
function openView(id){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.getElementById('menu3').style.display='none';
  if(id==='signView') setTimeout(resizeCanvas,100);
}
function showBan(t){ let b=document.getElementById('ban'); b.innerText=t; b.style.display='block'; setTimeout(()=>b.style.display='none',4000); }

async function initKeys(){
  let saved=localStorage.getItem('vobix_keys');
  if(saved){
    let j=JSON.parse(saved);
    myKeys={
      privateKey:await crypto.subtle.importKey("jwk",j.privateKey,{name:"ECDH",namedCurve:"P-256"},false,["deriveKey"]),
      publicKey:await crypto.subtle.importKey("jwk",j.publicKey,{name:"ECDH",namedCurve:"P-256"},true,[])
    };
    myPub=j.publicKey;
  }else{
    let kp=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveKey"]);
    myPub=await crypto.subtle.exportKey("jwk",kp.publicKey);
    let priv=await crypto.subtle.exportKey("jwk",kp.privateKey);
    localStorage.setItem('vobix_keys',JSON.stringify({privateKey:priv,publicKey:myPub}));
    myKeys=kp;
  }
  let me=JSON.parse(localStorage.getItem('vobix_user')||'null');
  if(me) fetch('/save-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:me.phone,publicKey:myPub})});
  loadKeys();
}
async function loadKeys(){
  try{
    let r=await fetch('/api/keys');
    let a=await r.json();
    for(let u of a) if(u.publicKey) usersKeys[u.username]=await crypto.subtle.importKey("jwk",u.publicKey,{name:"ECDH",namedCurve:"P-256"},true,[]);
  }catch{}
}
async function getSecret(pub){ return await crypto.subtle.deriveKey({name:"ECDH",public:pub},myKeys.privateKey,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]); }
async function encryptForAll(t){
  let enc=new TextEncoder(), packs=[]; let me=JSON.parse(localStorage.getItem('vobix_user'));
  for(let u in usersKeys){
    if(u===me.username) continue;
    let s=await getSecret(usersKeys[u]);
    let iv=crypto.getRandomValues(new Uint8Array(12));
    let c=await crypto.subtle.encrypt({name:"AES-GCM",iv},s,enc.encode(t));
    packs.push({to:u,data:btoa(String.fromCharCode(...iv)+String.fromCharCode(...new Uint8Array(c)))});
  }
  let iv2=crypto.getRandomValues(new Uint8Array(12));
  let selfS=await crypto.subtle.deriveKey({name:"ECDH",public:myKeys.publicKey},myKeys.privateKey,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
  let c2=await crypto.subtle.encrypt({name:"AES-GCM",iv:iv2},selfS,enc.encode(t));
  packs.push({to:me.username,data:btoa(String.fromCharCode(...iv2)+String.fromCharCode(...new Uint8Array(c2)))});
  return packs;
}
async function decryptOne(b64,from){
  try{
    let k=usersKeys[from]; if(!k) return null;
    let s=await getSecret(k);
    let raw=atob(b64);
    let iv=new Uint8Array([...raw.slice(0,12)].map(c=>c.charCodeAt(0)));
    let data=new Uint8Array([...raw.slice(12)].map(c=>c.charCodeAt(0)));
    let p=await crypto.subtle.decrypt({name:"AES-GCM",iv},s,data);
    return new TextDecoder().decode(p);
  }catch{ return null; }
}

async function sendPin(){
  let u=document.getElementById('username').value.trim();
  let p=document.getElementById('phone').value.trim();
  if(!u||!p) return alert("rellena usuario y telefono con +34");
  if(p.length<9) return alert("Número muy corto - usa SIM real");
  if(/^(\d)\1{6,}$/.test(p.replace(/\+/g,''))) return alert("Número no válido");
  document.getElementById('msg').innerText="Enviando...";
  let r=await fetch('/send-pin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:p,username:u})});
  let d=await r.json();
  if(d.ok){
    document.getElementById('msg').innerText="✅ PIN generado en LOGS de Render - Mira el panel";
    document.getElementById('pinBox').style.display='block';
  }else{
    document.getElementById('msg').innerText="❌ "+d.msg;
  }
}
async function verifyPin(){
  let p=document.getElementById('phone').value.trim();
  let pin=document.getElementById('pin').value.trim();
  let r=await fetch('/verify-pin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:p,pin})});
  let d=await r.json();
  if(d.ok){
    let u=document.getElementById('username').value.trim();
    localStorage.setItem('vobix_user',JSON.stringify({username:u,phone:p}));
    document.getElementById('login').style.display='none';
    document.getElementById('app').style.display='flex';
    socket.emit('set-user', u);
    await initKeys();
    showBan("¡Entrelazado! "+u+" registrado 🔒");
  }else alert("PIN incorrecto o expirado");
}

window.sendChat=async function(){
  let t=document.getElementById('text');
  let txt=t.value.trim(); if(!txt) return;
  let me=JSON.parse(localStorage.getItem('vobix_user'));
  if(!me) return location.reload();
  let packs=await encryptForAll(txt);
  for(let p of packs) socket.emit('chat',{username:me.username,phone:me.phone,to:p.to,text:p.data,encrypted:true,from:me.username});
  t.value='';
}

function addMsg(d,txt){
  let me=JSON.parse(localStorage.getItem('vobix_user')||'{}');
  let div=document.createElement('div');
  div.style.cssText="background:#202c33;color:#e9edef;padding:8px 12px;border-radius:10px;margin:6px 0;max-width:78%;word-break:break-word;"+(d.username===me.username?"margin-left:auto;background:#005c4b":"");
  div.innerHTML=`<div style="font-size:11px;color:#53bdeb;font-weight:bold">@${d.username}</div>${txt}<div style="font-size:9px;color:#8696a0;text-align:right;margin-top:4px">🔒 ${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} ✓✓</div>`;
  document.getElementById('messages').appendChild(div);
  document.getElementById('messages').scrollTop=999999;
}

socket.on('history',async a=>{
  for(let d of a){
    let me=JSON.parse(localStorage.getItem('vobix_user')||'{}');
    if(d.to&&d.to!==me.username) continue;
    let t=d.encrypted?await decryptOne(d.text,d.from||d.username):d.text;
    if(t) addMsg(d,t);
  }
});
socket.on('chat',async d=>{
  let me=JSON.parse(localStorage.getItem('vobix_user')||'{}');
  if(d.to&&d.to!==me.username) return;
  let t=d.encrypted?await decryptOne(d.text,d.from||d.username):d.text;
  if(t) addMsg(d,t);
});
socket.on('banned',e=>showBan(e.msg));
socket.on('spam_warn',e=>showBan(e.msg));

function logout(){ localStorage.removeItem('vobix_user'); localStorage.removeItem('vobix_keys'); location.reload(); }
function resizeCanvas(){ let c=document.getElementById('signCanvas'); if(!c) return; c.width=c.offsetWidth; c.height=380; }
function openVault(){ let p=document.getElementById('vaultPin').value; if(p==='1234'){ document.getElementById('vaultContent').style.display='block'; showBan("Vault abierto"); } else showBan("PIN incorrecto"); }
function doTranslate(){ let t=document.getElementById('transText').value; if(!t) return; document.getElementById('transResult').innerText="Traduciendo..."; fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(t)}&langpair=es|en`).then(r=>r.json()).then(d=>{ document.getElementById('transResult').innerText=d.responseData.translatedText||"Error"; }); }

let su=localStorage.getItem('vobix_user');
if(su){ document.getElementById('login').style.display='none'; document.getElementById('app').style.display='flex'; initKeys(); }
setInterval(loadKeys,5000);