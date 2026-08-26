const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

let pins = {}; // guarda los pines temporalmente

app.post('/send-pin', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ ok: false, error: 'Falta telefono' });

  const pin = Math.floor(100000 + Math.random() * 900000).toString();
  pins[phone] = pin;

  try {
    // CONFIGURACIÓN CORREGIDA PARA ESPAÑA
    const response = await fetch(`https://${process.env.INFOBIP_BASE_URL}/sms/2/text/advanced`, {
      method: 'POST',
      headers: {
        'Authorization': `App ${process.env.INFOBIP_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [{
          from: 'InfoSMS', // <--- ANTES decia VobixChat y España lo bloquea. Ahora si funciona
          destinations: [{ to: phone }],
          text: `Tu PIN VOBIXCHAT: ${pin}`
        }]
      })
    });

    const data = await response.json();
    console.log('Infobip:', data);

    if (!response.ok) throw new Error(JSON.stringify(data));

    return res.json({ ok: true, message: 'PIN enviado' });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: 'Error enviando SMS', detalle: e.message });
  }
});

app.post('/verify-pin', (req, res) => {
  const { phone, pin } = req.body;
  if (pins[phone] && pins[phone] === pin) {
    delete pins[phone];
    return res.json({ ok: true });
  }
  return res.status(400).json({ ok: false, error: 'PIN incorrecto' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('VobixChat corriendo en', PORT));