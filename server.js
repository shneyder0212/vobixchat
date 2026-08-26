const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let pins = {};
let users = {};

app.post('/send-pin', async (req,res)=>{
 try{
  let {phone} = req.body;
  phone = phone.toString().replace(/\s/g,'');
  if(!phone.startsWith('+')) phone='+34'+phone.replace(/^34/,'');
  const pin = Math.floor(100000+Math.random()*900000).toString();
  pins[phone]=pin;
  console.log(`PIN ${pin} para ${phone}`);
  const resp = await fetch(`https://${process.env.INFOBIP_BASE_URL}/sms/2/text/advanced`,{
    method:'POST',
    headers:{'Authorization':`App ${process.env.INFOBIP_API_KEY}`,'Content-Type':'application/json'},
    body: JSON.stringify({messages:[{from:'InfoSMS',destinations:[{to:phone}],text:`VOBIXCHAT: Tu codigo es ${pin}`} ]})
  });
  const data = await resp.json();
  console.log(data);
  if(!resp.ok) throw new Error(JSON.stringify(data));
  res.json({ok:true});
 }catch(e){console.error(e); res.json({ok:false,error:e.message})}
});

app.post('/verify-pin',(req,res)=>{
 let {phone,pin,username}=req.body;
 phone=phone.toString().replace(/\s/g,'');
 if(!phone.startsWith('+')) phone='+34'+phone.replace(/^34/,'');
 if(pins[phone]==pin){
   users[phone]={username, phone, verified:true, date:new Date()};
   delete pins[phone];
   return res.json({ok:true,user:users[phone]});
 }
 res.json({ok:false});
});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(process.env.PORT||10000,()=>console.log('VobixChat TODO EN UNO listo'));