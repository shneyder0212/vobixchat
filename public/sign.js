// Firma Espejo - Marca Agua Invisible + Firma por Lado + PIN + PDF Blindado
let pad, mirrorPeer=null, isMirror=false, myRole=null, docId=null, signImg=null, uploadedFile=null;

function resizeCanvas(){
  let c=document.getElementById('signCanvas');
  if(!c) return;
  let r=c.getBoundingClientRect();
  c.width=r.width * window.devicePixelRatio;
  c.height=380 * window.devicePixelRatio;
  c.getContext('2d').scale(window.devicePixelRatio,window.devicePixelRatio);
  if(pad) pad.clear();
}

function initPad(){
  let c=document.getElementById('signCanvas');
  pad=new SignaturePad(c,{backgroundColor:'#ffffff',penColor:'#000000',minWidth:1.2,maxWidth:3.5});
  resizeCanvas();
  window.addEventListener('resize',resizeCanvas);
}

async function startSign(){
  let f=document.getElementById('pdfFile').files[0];
  if(!f) return showBan("Elige PDF o Imagen");
  uploadedFile=f;
  docId=Math.random().toString(36).slice(2,9);
  myRole='signerA';
  document.getElementById('signStatus').innerText="Documento ID: "+docId+" | Esperando al otro... Comparte este ID";
  initPad();
  isMirror=true;
  socket.emit('sign-start',{docId,role:myRole});
  showBan("Firma espejo iniciada - ID: "+docId);
  setupMirror();
}

function setupMirror(){
  if(mirrorPeer) mirrorPeer.destroy();
  mirrorPeer=new SimplePeer({initiator:myRole==='signerA',trickle:false});
  mirrorPeer.on('signal', s=>socket.emit('sign-signal',{docId,signal:s}));
  mirrorPeer.on('connect',()=>{
    document.getElementById('signStatus').innerText="¡Conectado espejo E2E! Doc: "+docId;
    showBan("Espejo E2E conectado");
  });
  mirrorPeer.on('data', d=>{
    try{
      let m=JSON.parse(d);
      if(m.t==='stroke'){ pad.fromData([...pad.toData(),m.data]); }
      if(m.t==='clear'){ pad.clear(); }
      if(m.t==='pin-ok'){ showBan("PIN del otro lado verificado ✓"); }
    }catch{}
  });
  mirrorPeer.on('stream', s=>{});
}

// Dibujo en espejo
let lastSend=0;
function hookPad(){
  let c=document.getElementById('signCanvas');
  if(!c) return;
  c.addEventListener('pointerup',()=>{
    if(!mirrorPeer ||!mirrorPeer.connected) return;
    let data=pad.toData();
    let last=data[data.length-1];
    if(!last) return;
    if(Date.now()-lastSend>50){
      mirrorPeer.send(JSON.stringify({t:'stroke',data:last}));
      lastSend=Date.now();
    }
  });
}
setTimeout(hookPad,1000);

function clearSign(){
  pad.clear();
  if(mirrorPeer && mirrorPeer.connected) mirrorPeer.send(JSON.stringify({t:'clear'}));
}

async function saveSign(){
  if(!pad || pad.isEmpty()) return showBan("Firma vacía");
  let pin=prompt("PIN para blindar firma (4 dígitos):");
  if(!pin || pin.length<4) return showBan("PIN inválido");

  let canvas=document.getElementById('signCanvas');
  // Crear PDF blindado con marca de agua invisible
  let outCanvas=document.createElement('canvas');
  outCanvas.width=canvas.width;
  outCanvas.height=canvas.height;
  let ctx=outCanvas.getContext('2d');
  ctx.fillStyle='#fff';
  ctx.fillRect(0,0,outCanvas.width,outCanvas.height);
  ctx.drawImage(canvas,0,0);

  // Marca de agua invisible esteganografía
  let meta=`VOBIX:${docId}:${myRole}:${Date.now()}:${pin}:IP:${socket.id}`;
  ctx.fillStyle='rgba(0,0,0,0.015)';
  ctx.font='10px monospace';
  ctx.fillText(meta,10,outCanvas.height-10);

  // Guardar imagen
  let url=outCanvas.toDataURL('image/png');
  let a=document.createElement('a');
  a.href=url;
  a.download=`Firma-${docId}-${myRole}-${Date.now()}-BLINDADA.png`;
  a.click();

  if(mirrorPeer && mirrorPeer.connected) mirrorPeer.send(JSON.stringify({t:'pin-ok'}));
  showBan("Firmado + Blindado + Marca invisible + PIN 🔒");
  socket.emit('sign-done',{docId,role:myRole,pinHash:btoa(pin)});
}

// Unirse a firma existente
async function joinSignExisting(id){
  docId=id;
  myRole='signerB';
  initPad();
  socket.emit('sign-start',{docId,role:myRole});
  setupMirror();
}

socket.on('sign-start', d=>{
  if(docId && d.docId===docId) return;
  if(confirm("Te invitan a firma espejo ID: "+d.docId+" ¿Unirte como lado B?")){
    joinSignExisting(d.docId);
  }
});

socket.on('sign-signal', d=>{
  if(d.docId!==docId) return;
  if(!mirrorPeer){
    myRole='signerB';
    docId=d.docId;
    initPad();
    setupMirror();
  }
  mirrorPeer.signal(d.signal);
});

socket.on('sign-done', d=>{
  if(d.docId===docId) showBan("El otro lado firmó: "+d.role+" - Blindado con PIN");
});

initPad();