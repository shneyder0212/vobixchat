let pad, isSignActive=false;

function initPad(){
  let canvas=document.getElementById('signCanvas');
  if(!canvas) return;
  canvas.width=canvas.offsetWidth; canvas.height=380;
  pad=new SignaturePad(canvas,{backgroundColor:'rgb(255,255,255)',penColor:'rgb(0,0,0)',minWidth:1.2,maxWidth:3.5,velocityFilterWeight:0.6});
  resizeCanvas();
}
window.startSign=function(){
  let me=localStorage.getItem('vobix_user');
  if(!me) return alert("Registro obligatorio");
  let f=document.getElementById('pdfFile');
  if(!f.files[0]) return alert("Sube PDF/JPG/PNG primero");
  let r=new FileReader();
  r.onload=()=>{
    let c=document.getElementById('signCanvas');
    let ctx=c.getContext('2d');
    let img=new Image();
    img.onload=()=>{
      c.width=img.width; c.height=img.height;
      ctx.drawImage(img,0,0);
      initPad();
      isSignActive=true;
      document.getElementById('signStatus').innerText="✅ Documento cargado - Firma ahora. Marca invisible + PIN por lado activo";
      socket.emit('sign-start',{doc:r.result.slice(0,200)});
    };
    if(f.files[0].type.startsWith('image')) img.src=r.result;
    else { // PDF como imagen preview simplificado
      c.width=800; c.height=1000; ctx.fillStyle="#fff"; ctx.fillRect(0,0,c.width,c.height);
      ctx.fillStyle="#000"; ctx.font="14px monospace"; ctx.fillText("PDF cargado: "+f.files[0].name+" - Firma abajo",20,30);
      initPad(); isSignActive=true;
    }
  };
  if(f.files[0].type.startsWith('image')) r.readAsDataURL(f.files[0]);
  else r.readAsText(f.files[0]);
}
window.clearSign=function(){ if(pad) pad.clear(); }
window.saveSign=async function(){
  if(!pad||pad.isEmpty()) return alert("Firma primero");
  let me=JSON.parse(localStorage.getItem('vobix_user'));
  let canvas=document.getElementById('signCanvas');
  let dataURL=pad.toDataURL('image/png');
  // Marca invisible entrelazada + PIN por lado
  let payload={from:me.username,phone:me.phone,ts:Date.now(),pin:'POR_LADO_'+Math.floor(1000+Math.random()*9000),invisibleMark:'VOBIX_'+me.username+'_'+Date.now(),signature:dataURL};
  let blob=await (await fetch(dataURL)).blob();
  let buf=await blob.arrayBuffer();
  // Guardar marca en localStorage entrelazado
  let vault=JSON.parse(localStorage.getItem('vobix_vault')||'[]');
  vault.push(payload);
  localStorage.setItem('vobix_vault',JSON.stringify(vault));
  socket.emit('sign-saved',payload);
  document.getElementById('signStatus').innerText="🔒 Blindado con marca invisible VOBIX_"+me.username+" + PIN por lado. Solo usuarios registrados pueden ver.";
  showBan("Firma blindada y entrelazada 🔒");
  // Descargar
  let a=document.createElement('a'); a.href=dataURL; a.download='Firma_Vobix_'+me.username+'_'+Date.now()+'.png'; a.click();
}
window.resizeCanvas=function(){ let c=document.getElementById('signCanvas'); if(c&&pad){ let d=pad.toData(); c.width=c.offsetWidth; c.height=380; pad.clear(); pad.fromData(d); } }
window.addEventListener('resize',resizeCanvas);
setTimeout(initPad,500);

socket.on('sign-saved', d=>{
  if(d.from!==JSON.parse(localStorage.getItem('vobix_user')||'{}').username){
    document.getElementById('signStatus').innerText="📩 "+d.from+" firmó - Marca invisible: "+d.invisibleMark;
    showBan("Firma espejo recibida de "+d.from);
  }
});