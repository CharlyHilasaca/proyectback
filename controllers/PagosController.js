const fetch = require("node-fetch");

// Usa tu access token de pruebas o producción
const ACCESS_TOKEN = "APP_USR-1386255511612102-062911-63c3809fe330a10efc3e2bdc2ad360d5-2477587753";

exports.pagarConCheckoutPro = async (req, res) => {
  const { monto, descripcion } = req.body;
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
    }
  };

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
    res.json({ init_point: data.init_point, mp_response: data });
  } catch (err) {
    console.error("[PagosController] Error en pagarConCheckoutPro:", err);
    res.status(500).json({ error: "Error procesando el pago" });
  }
};
