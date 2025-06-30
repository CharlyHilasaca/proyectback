const fetch = require("node-fetch");
const dotenv = require("dotenv");
dotenv.config();

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const Carrito = require("../models/ComprasModel/comprasModel");
const Ventas = require("../models/VentaModel/ventamodel");
const Email = require("../models/UserModel/UserModel");
const { pgPool } = require("../config/db");
const Product = require("../models/ProductModel/ProductModel");

exports.pagarConCheckoutPro = async (req, res) => {
  const { monto, descripcion, email, pagoExitoso } = req.body;

  // Si es post-pago (limpieza y generación de venta), NO generes preferencia de pago
  if (pagoExitoso && email) {
    try {
      // Buscar usuario por email en MongoDB
      const mongoUser = await Email.findOne({ email });
      if (!mongoUser) return res.status(404).json({ error: "Usuario no encontrado en MongoDB" });

      // Buscar cliente en Postgres por email
      const clienteQuery = `SELECT id, proyecto_f FROM clientes WHERE email = $1 LIMIT 1`;
      const clienteResult = await pgPool.query(clienteQuery, [email]);
      if (clienteResult.rows.length === 0) return res.status(404).json({ error: "Cliente no encontrado en PostgreSQL" });
      const clienteId = clienteResult.rows[0].id;
      const proyecto_id = String(clienteResult.rows[0].proyecto_f);

      // Buscar carrito pendiente
      const carrito = await Carrito.findOne({ cliente_id: email, proyecto_id, estado: 'pendiente' });
      if (!carrito) return res.status(404).json({ error: "No existe un carrito pendiente para este usuario" });

      // Validación: carrito debe tener productos
      if (!Array.isArray(carrito.productos) || carrito.productos.length === 0) {
        return res.status(400).json({ error: "El carrito está vacío" });
      }
      // Validación: total debe ser mayor a cero
      if (typeof carrito.total !== "number" || carrito.total <= 0) {
        return res.status(400).json({ error: "El total del carrito es inválido" });
      }
      // Validar productos y stock
      for (const item of carrito.productos) {
        const prod = await Product.findById(item.producto_id);
        if (!prod) return res.status(404).json({ error: `Producto no encontrado: ${item.producto_id}` });
        const detalleProyecto = prod.projectDetails?.find(
          (pd) => String(pd.proyectoId) === String(proyecto_id)
        );
        if (!detalleProyecto) return res.status(400).json({ error: `No se encontró detalle de proyecto para el producto: ${item.producto_id}` });
        const stockActual = Number(detalleProyecto.stock);
        const cantidadVenta = Number(item.cantidad);
        if (isNaN(stockActual) || isNaN(cantidadVenta) || cantidadVenta <= 0) {
          return res.status(400).json({ error: `Stock o cantidad inválida para el producto: ${item.producto_id}` });
        }
        if (stockActual < cantidadVenta) {
          return res.status(400).json({ error: `Stock insuficiente para el producto: ${item.producto_id}` });
        }
      }

      // Obtener nro de venta
      const ultimaVenta = await Ventas.findOne({ proyecto_id }).sort({ nro: -1 }).select("nro");
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
        proyecto_id,
        estado: "para entrega",
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
      console.log("[PagosController] Venta generada y carrito limpiado correctamente.");

      return res.json({ message: "Venta generada y carrito limpiado correctamente." });
    } catch (err) {
      console.error("[PagosController] Error al procesar venta y limpiar carrito:", err);
      return res.status(500).json({ error: "Error al procesar venta y limpiar carrito" });
    }
  }

  // Si NO es post-pago, genera preferencia de pago normalmente
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
      success: "https://proyectfront.onrender.com/",
      failure: "https://proyectfront.onrender.com/",
      pending: "https://proyectfront.onrender.com/"
    },
    sandbox_mode: true
  };

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
