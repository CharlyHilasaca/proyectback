const fetch = require("node-fetch");
const dotenv = require("dotenv");
dotenv.config();

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const Carrito = require("../../models/ComprasModel/comprasModel");
const Ventas = require("../../models/VentaModel/ventamodel");
const Email = require("../../models/UserModel/UserModel");
const { pgPool } = require("../../config/db");
const Product = require("../../models/ProductModel/ProductModel");

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

    // Si el pago fue exitoso (simulación, ya que aquí solo se crea la preferencia)
    // En producción, deberías usar el webhook de Mercado Pago para confirmar el pago.
    // Aquí, para efectos de ejemplo, si el frontend llama a este endpoint tras el pago exitoso:
    if (req.body.pagoExitoso) {
      // Limpiar carrito y crear venta pagada
      try {
        // Buscar usuario por email
        const mongoUser = await Email.findOne({ email });
        if (!mongoUser) throw new Error("Usuario no encontrado en MongoDB");
        // Buscar carrito pendiente
        const carrito = await Carrito.findOne({ cliente_id: email, estado: 'pendiente' });
        if (!carrito) throw new Error("No existe un carrito pendiente para este usuario");
        // Buscar id cliente en Postgres
        const clienteQuery = `SELECT id FROM clientes WHERE email = $1 LIMIT 1`;
        const clienteResult = await pgPool.query(clienteQuery, [email]);
        const clienteId = clienteResult.rows.length > 0 ? clienteResult.rows[0].id : null;
        // Obtener proyecto_id
        const proyecto_id = carrito.proyecto_id;
        // Obtener nro de venta
        const ultimaVenta = await Ventas.findOne({ proyecto_id: String(proyecto_id) }).sort({ nro: -1 }).select("nro");
        const nro = ultimaVenta && ultimaVenta.nro ? ultimaVenta.nro + 1 : 1;
        const nfac = `T${proyecto_id}-${nro}`;
        // Crear venta pagada
        const nuevaVenta = new Ventas({
          nro,
          nfac,
          cliente: clienteId,
          email,
          items: carrito.productos.map(prod => ({
            producto: prod.producto_id,
            precio: prod.precio,
            cantidad: prod.cantidad
          })),
          totalVenta: carrito.total,
          proyecto_id: String(proyecto_id),
          estado: "pagado",
          tipoPago: "mercadopago",
          origen: "web"
        });
        await nuevaVenta.save();
        // Actualizar stock de productos
        for (const item of carrito.productos) {
          const prod = await Product.findById(item.producto_id);
          if (prod && prod.projectDetails) {
            const detalleProyecto = prod.projectDetails.find(
              (pd) => String(pd.proyectoId) === String(proyecto_id)
            );
            if (detalleProyecto) {
              detalleProyecto.stock = Number(detalleProyecto.stock) - Number(item.cantidad);
            }
            await prod.save();
          }
        }
        // Limpiar carrito
        await Carrito.deleteOne({ _id: carrito._id });
      } catch (err) {
        console.error("[PagosController] Error al limpiar carrito y crear venta:", err);
        // No retornes error al frontend, solo loguea
      }
    }

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
