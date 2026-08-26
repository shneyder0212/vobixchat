let screenStream, peerTeam=null, isSharing=false;

async function startShare(){
  let me = localStorage.getItem('vobix_user');
  if(!me) return alert("Registro obligatorio primero");
  try{
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video:{width:1920,height:1080,frameRate:30}, audio:true });
    isSharing=true;
    let v=document.createElement('video');
    v.srcObject=screenStream; v.autoplay=true; v.muted=true; v.style.cssText="width:100%;height:100%;object-fit:contain;background:#000";
    let view=document.getElementById('remoteView'); view.innerHTML=''; view.appendChild(v);
    socket.emit('team-share-start');
    showBan("Compartiendo - Entrelazado");
    screenStream.getVideoTracks()[0].onended=()=>stopShare();
  }catch(e){ showBan("Permiso denegado"); }
}
function stopShare(){
  if(screenStream) screenStream.getTracks().forEach(t=>t.stop());
  isSharing=false;
  if(peerTeam){ peerTeam.destroy(); peerTeam=null; }
  document.getElementById('remoteView').innerHTML='<span style="color:#8696a0">Detenida</span>';
  socket.emit('team-share-stop');
}
function requestControl(){
  if(!isSharing){ socket.emit('team-control-request'); showBan("Solicitud enviada"); }
}
socket.on('team-share-start', id=>{
  if(peerTeam) peerTeam.destroy();
  peerTeam=new SimplePeer({initiator:true,trickle:false});
  peerTeam.on('signal', s=>socket.emit('team-signal',{to:id,signal:s}));
  peerTeam.on('stream', s=>{
    let v=document.createElement('video'); v.srcObject=s; v.autoplay=true; v.style.cssText="width:100%;height:100%;object-fit:contain;background:#000";
    let view=document.getElementById('remoteView'); view.innerHTML=''; view.appendChild(v);
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
    peerTeam.on('connect',()=>showBan("Te están viendo - seguro"));
  }
  peerTeam.signal(d.signal);
});
socket.on('team-control-request', from=>{
  if(isSharing && confirm("¿Permitir control a "+from+"?")){ socket.emit('team-control-accept',{to:from}); showBan("Control concedido"); }
});
socket.on('team-event', e=>{ console.log("Evento remoto",e); });