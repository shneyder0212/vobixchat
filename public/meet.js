// VobixMeet - Reuniones 30K HD E2E - Sin Ruido Sin Eco
let localStream, peersMeet={};

async function joinZoomHD(){
  // HIPERREALISTA - CONFIG PRO
  localStream = await navigator.mediaDevices.getUserMedia({
    video: {
      width:{ideal:1920},
      height:{ideal:1080},
      frameRate:{ideal:60},
      facingMode:"user"
    },
    audio: {
      echoCancellation:true, // Quita eco
      noiseSuppression:true, // Quita ruido
      autoGainControl:true, // Voz clara
      sampleRate:48000,
      channelCount:2,
      suppressLocalAudioPlayback:true
    }
  });
  addMeetVideo('yo', localStream);
  socket.emit('meet-join');
  document.getElementById('videoGrid').innerHTML='';
  addMeetVideo('yo', localStream);
}

function addMeetVideo(id,s){
  let g=document.getElementById('videoGrid');
  if(document.getElementById(id)) return;
  let v=document.createElement('video');
  v.id=id; v.srcObject=s; v.autoplay=true; v.playsInline=true; v.muted=(id==='yo');
  v.style.cssText="width:100%;height:180px;background:#111;border-radius:12px;object-fit:cover";
  g.appendChild(v);
}

function leaveZoom(){
  for(let k in peersMeet) peersMeet[k].destroy();
  peersMeet={};
  document.getElementById('videoGrid').innerHTML='';
  if(localStream) localStream.getTracks().forEach(t=>t.stop());
  socket.emit('meet-leave');
}

async function shareScreen(){
  let sc=await navigator.mediaDevices.getDisplayMedia({video:{width:1920,height:1080,frameRate:60}});
  addMeetVideo('pantalla',sc);
  // Cambia camara por pantalla en todas las llamadas
  for(let k in peersMeet){
    let sender = peersMeet[k]._pc.getSenders().find(s=>s.track && s.track.kind==='video');
    if(sender) sender.replaceTrack(sc.getVideoTracks()[0]);
  }
}

// Señalización VobixMeet
socket.on('meet-user', id=>{
  let p=new SimplePeer({initiator:true,trickle:false,stream:localStream});
  p.on('signal', s=>socket.emit('meet-signal',{to:id,signal:s}));
  p.on('stream', s=>addMeetVideo(id,s));
  p.on('connect',()=>console.log("VobixMeet E2E conectado con",id));
  peersMeet[id]=p;
});

socket.on('meet-signal', d=>{
  if(!peersMeet[d.from]){
    let p=new SimplePeer({initiator:false,trickle:false,stream:localStream});
    p.on('signal', s=>socket.emit('meet-signal',{to:d.from,signal:s}));
    p.on('stream', s=>addMeetVideo(d.from,s));
    peersMeet[d.from]=p;
    peersMeet[d.from].signal(d.signal);
  } else {
    peersMeet[d.from].signal(d.signal);
  }
});

socket.on('meet-leave', id=>{
  if(peersMeet[id]){ peersMeet[id].destroy(); delete peersMeet[id]; }
  let v=document.getElementById(id); if(v) v.remove();
});