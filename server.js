const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// --- CONFIGURACION ---
const INFOBIP_BASE_URL = "https://ee9nk3.api.infobip.com";
const INFOBIP_API_KEY = "6058df8a3e5f589f2d3376fa58ca96ce-4e6af13d-6906-46c1-874d-002f05ba5d24";

// !!! CAMBIA ESTA CLAVE POR LA QUE SOLO TU SEPAS !!!
const ADMIN_KEY = "VOBIX_2026_ADMIN_99";

const pins = new Map();
const usersDB = []; // Solo usuarios registrados en TU app

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Enviar PIN
app.post('/send-pin', async (req, res) => {
  try {
    const { phone, lang } = req.body;
    if (!phone) return res.status(400).json({ error: 'Falta teléfono' });

    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    pins.set(phone, { pin, expires: Date.now() + 5 * 60 * 1000, lang: lang || 'es', country: req.headers['cf-ipcountry'] || req.ip });
    
    console.log(`PIN ${pin} para ${phone} idioma ${lang}`);

    const response = await fetch(`${INFOBIP_BASE_URL}/sms/2/text/advanced`, {
      method: 'POST',
      headers: {
        'Authorization': `App ${INFOBIP_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        messages: [{
          destinations: [{ to: phone }],
          from: "VobixChat",
          text: `Tu codigo VobixChat es: ${pin}. Valido 5 min.`
        }]
      })
    });

    const data = await response.json();
    console.log('Infobip:', JSON.stringify(data));

    if (!response.ok) {
      return res.status(500).json({ error: 'Error SMS', details: data });
    }

    res.json({ ok: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error servidor' });
  }
});

// Verificar PIN
app.post('/verify-pin', (req, res) => {
  const { phone, pin, lang } = req.body;
  const saved = pins.get(phone);
  
  if (!saved) return res.status(400).json({ error: 'No hay PIN' });
  if (Date.now() > saved.expires) {
    pins.delete(phone);
    return res.status(400).json({ error: 'PIN expirado' });
  }
  if (saved.pin !== pin) return res.status(400).json({ error: 'PIN incorrecto' });

  // Guardamos usuario solo cuando verifica correctamente - LEGAL
  const exists = usersDB.find(u => u.phone === phone);
  if (!exists) {
    usersDB.push({
      phone,
      date: new Date().toLocaleString(),
      country: saved.country,
      lang: lang || saved.lang || 'es'
    });
  }

  pins.delete(phone);
  res.json({ ok: true });
});

// PANEL ADMIN LEGAL - Solo tu con clave
app.get('/admin/users', (req, res) => {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Clave admin incorrecta' });
  }
  res.json({ users: usersDB, total: usersDB.length });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`VOBIXCHAT corriendo puerto ${PORT} | Admin key: ${ADMIN_KEY}`));