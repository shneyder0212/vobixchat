const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// --- CONFIGURACION INFOBIP ---
const INFOBIP_BASE_URL = "https://ee9nk3.api.infobip.com";
const INFOBIP_API_KEY = "6058df8a3e5f589f2d3376fa58ca96ce-4e6af13d-6906-46c1-874d-002f05ba5d24";

// Memoria temporal para PINs
const pins = new Map();

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/send-pin', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Falta teléfono' });

    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    pins.set(phone, { pin, expires: Date.now() + 5 * 60 * 1000 });
    
    console.log(`Enviando PIN ${pin} a ${phone}`);

    const response = await fetch(`${INFOBIP_BASE_URL}/sms/2/text/advanced`, {
      method: 'POST',
      headers: {
        'Authorization': `App ${INFOBIP_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          {
            destinations: [{ to: phone }],
            from: "VobixChat",
            text: `Tu codigo VOBIXCHAT es: ${pin}. Valido por 5 minutos.`
          }
        ]
      })
    });

    const data = await response.json();
    console.log('Respuesta Infobip:', JSON.stringify(data));

    if (!response.ok) {
      console.error('Error Infobip:', data);
      return res.status(500).json({ error: 'Error enviando SMS', details: data });
    }

    res.json({ ok: true, message: 'PIN enviado' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error servidor' });
  }
});

app.post('/verify-pin', (req, res) => {
  const { phone, pin } = req.body;
  const saved = pins.get(phone);
  
  if (!saved) return res.status(400).json({ error: 'No hay PIN para ese numero' });
  if (Date.now() > saved.expires) {
    pins.delete(phone);
    return res.status(400).json({ error: 'PIN expirado' });
  }
  if (saved.pin !== pin) return res.status(400).json({ error: 'PIN incorrecto' });

  pins.delete(phone);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`VOBIXCHAT corriendo en puerto ${PORT}`));