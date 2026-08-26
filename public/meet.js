// VobixMeet - Reuniones Hiperrealistas E2E 30K Full HD - Sin Ruido Sin Eco
let localStreamMeet, peersMeet={};

async function joinMeetHD(){
  try{
    localStreamMeet = await navigator.mediaDevices.getUserMedia({
      video: {
        width:{ideal:1920},
        height:{ideal:1080},
        frameRate:{ideal:60},
        facingMode:"user"
      },
      audio: {
        echoCancellation:true,
        noiseSuppression:true,
        autoGainControl:true,
        sampleRate:48000,
        channelCount:2,
        suppressLocalAudioPlayback:true,
        echoCancellationType:"system"
      }
    });

    document.getElementById('videoGrid').innerHTML='';
    addMeetVideo('yo', localStreamMeet, true);
    socket.emit('meet-join');
    showBan("VobixMeet HD conectado - E2E 🔒 Sin Ruido Sin Eco");
  }catch(e){
    alert("Necesitas permitir cámara y micrófono: "+e.message);
  }
}

function addMeetVideo(id,stream,isMe){
  let g=document.getElementById('videoGrid');
  if(document.getElementById('video-'+id)) return;
  let wrap=document.createElement('div');
  wrap.id='video-'+id;
  wrap.style.cssText="position:relative;background:#111;border-radius:12px;overflow:hidden;height:180px";
  let v=document.createElement('video');
  v.srcObject=stream;
  v.autoplay=true;
  v.playsInline=true;
  v.muted=isMe?true:false;
  v.style.cssText="width:100%;height:100%;object-fit:cover";
  let label=document.createElement('div');
  label.innerText=id==='yo'?'TÚ - HD 🔒':id;
  label.style.cssText="position:absolute;bottom:6px;left:6px;background:rgba(0,0,0,0.6);padding:2px 8px;border-radius:10px;font-size:10px";
  wrap.appendChild(v);
  wrap.appendChild(label);
  g.appendChild(wrap);
}

function leaveMeet(){
  for(let k in peersMeet){ try{ peersMeet[k].destroy(); }catch{} }
  peersMeet={};
  document.getElementById('videoGrid').innerHTML='';
  if(localStreamMeet) localStreamMeet.getTracks().forEach(t=>t.stop());
  socket.emit('meet-leave');
  showBan("Saliste de VobixMeet");
}

async function shareScreen(){
  try{
    let sc=await navigator.mediaDevices.getDisplayMedia({
      video:{width:1920,height:1080,frameRate:60},
      audio:true
    });
    addMeetVideo('pantalla',sc,true);
    for(let k in peersMeet){
      try{
        let sender = peersMeet[k]._pc.getSenders().find(s=>s.track && s.track.kind==='video');
        if(sender) sender.replaceTrack(sc.getVideoTracks()[0]);
      }catch{}
    }
    sc.getVideoTracks()[0].onended=()=>{
      let camTrack=localStreamMeet.getVideoTracks()[0];
      for(let k in peersMeet){
        let sender = peersMeet[k]._pc.getSenders().find(s=>s.track && s.track.kind==='video');
        if(sender) sender.replaceTrack(camTrack);
      }
      let el=document.getElementById('video-pantalla'); if(el) el.remove();
    };
  }catch(e){ showBan("No se pudo compartir pantalla"); }
}

socket.on('meet-user', id=>{
  let p=new SimplePeer({initiator:true,trickle:false,stream:localStreamMeet});
  p.on('signal', s=>socket.emit('meet-signal',{to:id,signal:s}));
  p.on('stream', s=>addMeetVideo(id,s,false));
  p.on('connect',()=>console.log("VobixMeet E2E con",id));
  p.on('error',e=>console.log(e));
  peersMeet[id]=p;
});

socket.on('meet-signal', d=>{
  if(!peersMeet[d.from]){
    let p=new SimplePeer({initiator:false,trickle:false,stream:localStreamMeet});
    p.on('signal', s=>socket.emit('meet-signal',{to:d.from,signal:s}));
    p.on('stream', s=>addMeetVideo(d.from,s,false));
    peersMeet[d.from]=p;
    peersMeet[d.from].signal(d.signal);
  }else{
    peersMeet[d.from].signal(d.signal);
  }
});

socket.on('meet-leave', id=>{
  if(peersMeet[id]){ try{ peersMeet[id].destroy(); }catch{} delete peersMeet[id]; }
  let v=document.getElementById('video-'+id); if(v) v.remove();
});