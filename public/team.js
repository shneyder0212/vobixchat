// Control Remoto TeamVobix - Gratis sin TeamViewer
let screenStream, peerTeam=null, isSharing=false;

async function startShare(){
  try{
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video:{width:1920,height:1080,frameRate:30},
      audio:true
    });
    isSharing=true;
    let v=document.createElement('video');
    v.srcObject=screenStream;
    v.autoplay=true;
    v.muted=true;
    v.style.cssText="width:100%;height:100%;object-fit:contain;background:#000";
    let view=document.getElementById('remoteView');
    view.innerHTML='';
    view.appendChild(v);
    socket.emit('team-share-start');
    showBan("Compartiendo pantalla - Control remoto activo");

    screenStream.getVideoTracks()[0].onended=()=>stopShare();
  }catch(e){
    showBan("Permiso denegado para compartir");
  }
}

function stopShare(){
  if(screenStream) screenStream.getTracks().forEach(t=>t.stop());
  isSharing=false;
  if(peerTeam){ peerTeam.destroy(); peerTeam=null; }
  document.getElementById('remoteView').innerHTML='<span style="color:#8696a0">Compartida detenida</span>';
  socket.emit('team-share-stop');
}

function requestControl(){
  if(!isSharing){
    socket.emit('team-control-request');
    showBan("Solicitud de control enviada");
  }
}

// Señalización Team
socket.on('team-share-start', id=>{
  if(peerTeam) peerTeam.destroy();
  peerTeam=new SimplePeer({initiator:true,trickle:false});
  peerTeam.on('signal', s=>socket.emit('team-signal',{to:id,signal:s}));
  peerTeam.on('stream', s=>{
    let v=document.createElement('video');
    v.srcObject=s;
    v.autoplay=true;
    v.style.cssText="width:100%;height:100%;object-fit:contain;background:#000";
    let view=document.getElementById('remoteView');
    view.innerHTML='';
    view.appendChild(v);
    // Enviar click y teclado de vuelta
    v.addEventListener('click',e=>{
      let r=v.getBoundingClientRect();
      socket.emit('team-event',{to:id,type:'click',x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height});
    });
  });
  peerTeam.on('connect',()=>showBan("Control remoto conectado 🔒"));
});

socket.on('team-share-stop',()=>{
  if(peerTeam){ peerTeam.destroy(); peerTeam=null; }
  document.getElementById('remoteView').innerHTML='<span style="color:#8696a0">El otro dejó de compartir</span>';
});

socket.on('team-signal', d=>{
  if(!peerTeam){
    peerTeam=new SimplePeer({initiator:false,trickle:false,stream:screenStream});
    peerTeam.on('signal', s=>socket.emit('team-signal',{to:d.from,signal:s}));
    peerTeam.on('data', data=>{
      try{
        let e=JSON.parse(data);
        if(e.type==='click') showBan("Click remoto: "+e.x.toFixed(2));
      }catch{}
    });
    peerTeam.on('connect',()=>showBan("Te están controlando - Vobix seguro"));
  }
  peerTeam.signal(d.signal);
});

socket.on('team-control-request', from=>{
  if(isSharing && confirm("¿Permitir control remoto a "+from+"?")){
    socket.emit('team-control-accept',{to:from});
    showBan("Control concedido");
    // Si acepta, el peer ya está conectado y enviará data channel
  }
});

socket.on('team-event', e=>{
  if(e.type==='click'){
    // Simular click local (para demo)
    console.log("Evento remoto",e);
  }
});