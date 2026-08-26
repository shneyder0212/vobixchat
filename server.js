const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname,'public')));
let pins={};
app.post('/send-pin', async (req,res)=>{
 let phone=(req.body.phone||'').replace(/\s/g,'');
 if(!phone.startsWith('+')) phone='+34'+phone.replace(/^34/,'');
 const pin=Math.floor(100000+Math.random()*900000).toString();
 pins[phone]=pin; console.log('PIN',pin,'para',phone);
 try{
  let base=(process.env.INFOBIP_BASE_URL||'').trim().replace(/^https?:\/\//,'').split('/')[0];
  const key=(process.env.INFOBIP_API_KEY||'').trim();
  if(!base) throw new Error('En Render falta INFOBIP_BASE_URL - pon solo: xxx.api.infobip.com');
  const url=`https://${base}/sms/2/text/advanced`;
  const r=await fetch(url,{method:'POST',headers:{Authorization:`App ${key}`,'Content-Type':'application/json'},body:JSON.stringify({messages:[{from:'InfoSMS',destinations:[{to:phone}],text:`VobixChat: ${pin}`} ]})});
  const d=await r.json(); console.log(d); if(!r.ok) throw new Error(JSON.stringify(d));
  res.json({ok:true});
 }catch(e){res.json({ok:false,error:e.message});}
});
app.post('/verify-pin',(req,res)=>{
 let phone=(req.body.phone||'').replace(/\s/g,''); if(!phone.startsWith('+')) phone='+34'+phone.replace(/^34/,'');
 if(pins[phone]==req.body.pin){delete pins[phone];return res.json({ok:true});}
 res.json({ok:false});
});
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(process.env.PORT||10000,()=>console.log('OK'));