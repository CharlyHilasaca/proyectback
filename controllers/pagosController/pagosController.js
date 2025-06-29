const fetch = require("node-fetch");
const dotenv = require("dotenv");
dotenv.config();

// Usa tu access token de pruebas o producción
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

exports.pagarConCheckoutPro = async (req, res) => {
  const { monto, descripcion, email } = req.body;
  // Validar monto
  if (!monto || isNaN(monto) || Number(monto) <= 0.1) {
    return res.status(400).json({ error: "Monto inválido" });
  }
  const preference = {
    items: [
      {
        title: descripcion || "Pago en HiMarket",
        quantity: 1,
        currency_id: "PEN",
        unit_price: Number(monto)
      }
    ],
    back_urls: {
      success: "https://proyectfront.onrender.com/pago-exitoso",
      failure: "https://proyectfront.onrender.com/pago-fallido",
      pending: "https://proyectfront.onrender.com/pago-pendiente"
    },
    // Forzar sandbox (opcional, pero ayuda en pruebas)
    sandbox_mode: true
  };

  // Si se proporciona un email, agregar el campo payer
  if (email) {
    preference.payer = { email };
  }

  console.log("[PagosController] Preferencia enviada a Mercado Pago:", preference);

  try {
    const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ACCESS_TOKEN}`
      },
      body: JSON.stringify(preference)
    });
    const data = await response.json();
    console.log("[PagosController] Respuesta Mercado Pago:", data);
    // Devuelve ambos enlaces para que el frontend use el correcto según el ambiente
    res.json({ 
      init_point: data.init_point, 
      sandbox_init_point: data.sandbox_init_point, 
      mp_response: data 
    });
  } catch (err) {
    console.error("[PagosController] Error en pagarConCheckoutPro:", err);
    res.status(500).json({ error: "Error procesando el pago" });
  }
};
