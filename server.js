const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let pins = {};

app.post('/send-pin', async (req, res) => {
  let { phone } = req.body;
  if (!phone) return res.status(400).json({ ok: false, error: 'Falta telefono' });

  // Limpia el numero
  phone = phone.toString().replace(/\s/g, '');
  if (!phone.startsWith('+')) phone = '+34' + phone.replace(/^34/, '');

  const pin = Math.floor(100000 + Math.random() * 900000).toString();
  pins[phone] = pin;
  console.log(`PIN para ${phone}: ${pin}`);

  try {
    const baseUrl = process.env.INFOBIP_BASE_URL;
    const apiKey = process.env.INFOBIP_API_KEY;

    const response = await fetch(`https://${baseUrl}/sms/2/text/advanced`, {
      method: 'POST',
      headers: {
        'Authorization': `App ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [{
          from: 'InfoSMS', // CORREGIDO - Ya no es VobixChat
          destinations: [{ to: phone }],
          text: `VOBIXCHAT Tu codigo es ${pin}. Valido 5 min.`
        }]
      })
    });

    const data = await response.json();
    console.log('Infobip respuesta:', JSON.stringify(data));

    if (!response.ok) throw new Error(JSON.stringify(data));

    return res.json({ ok: true, message: 'PIN enviado' });

  } catch (e) {
    console.error('Error SMS:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/verify-pin', (req, res) => {
  let { phone, pin } = req.body;
  phone = phone.toString().replace(/\s/g, '');
  if (!phone.startsWith('+')) phone = '+34' + phone.replace(/^34/, '');

  if (pins[phone] && pins[phone] == pin) {
    delete pins[phone];
    return res.json({ ok: true });
  }
  return res.json({ ok: false, error: 'PIN incorrecto' });
});

// Para que cargue tu diseño negro con verde
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('VobixChat OK en ' + PORT));