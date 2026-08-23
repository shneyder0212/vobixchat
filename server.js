app.post('/api/seguridad/verificar-usuario', verificarLimitePeticionesIP, async (req, res) => {
    const { numeroCrudo, codigoPais } = req.body;
    if (!numeroCrudo) return res.status(400).json({ success: false, error: "NUMERO_REQUERIDO" });

    let telefonoLimpio = numeroCrudo.trim().replace(/[^0-9]/g, '');
    let prefijo = "+34";
    if (codigoPais === "US" || codigoPais === "DO") prefijo = "+1";
    else if (codigoPais === "MX") prefijo = "+52";
    else if (codigoPais === "AR") prefijo = "+54";
    else if (codigoPais === "CO") prefijo = "+57";
    else if (codigoPais === "VE") prefijo = "+58";
    else if (codigoPais === "PE") prefijo = "+51";

    if (!telefonoLimpio.startsWith(prefijo.replace("+", ""))) {
        telefonoLimpio = prefijo + telefonoLimpio;
    } else {
        telefonoLimpio = "+" + telefonoLimpio;
    }

    if (telefonoLimpio.includes("800") || telefonoLimpio.includes("888") || telefonoLimpio.includes("voip")) {
        return res.status(400).json({ success: false, error: "VOIP_REJECTED" });
    }

    // EXONERACIÓN TOTAL / ADMIN BYPASS PARA TU NÚMERO (Cero costo de SMS)
    if (telefonoLimpio.includes("655766134") || telefonoLimpio === "+34655766134" || telefonoLimpio === "+1655766134") {
        pinesTemporales.set(telefonoLimpio, { pin: "777777", timestamp: Date.now() });
        return.status(200).json({ success: true, message: "NÚMERO EXONERADO. PIN DE ACCESO: 777777" });
    }

    try {
        const pinSecreto = Math.floor(1000 + Math.random() * 9000).toString();
        pinesTemporales.set(telefonoLimpio, { pin: pinSecreto, timestamp: Date.now() });

        await fetch(process.env.INFOBIP_BASE_URL + "/sms/2/text/advanced", {
            method: 'POST',
            headers: { 'Authorization': "App " + process.env.INFOBIP_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{
                    destinations: [{ to: telefonoLimpio }],
                    from: "VobixChat",
                    text: "[VOBIXCHAT] Tu PIN de acceso seguro es: " + pinSecreto
                }]
            })
        });
        return res.status(200).json({ success: true, message: "PIN ENVIADO POR SMS CON ÉXITO." });
    } catch (error) {
        return res.status(500).json({ success: false, error: "TRANSMISSION_FAILED" });
    }
});
