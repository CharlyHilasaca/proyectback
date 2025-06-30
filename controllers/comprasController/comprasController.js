const Carrito = require('../../models/ComprasModel/comprasModel');
const Email = require('../../models/UserModel/UserModel');
const Ventas = require('../../models/VentaModel/ventamodel');
const { pgPool } = require('../../config/db');

// Función auxiliar para validar usuario y proyecto
async function validarUsuarioYProyecto(req) {
  const userId = req.userId;
  if (!userId) {
    throw { status: 401, message: 'No autenticado' };
  }
  const mongoUser = await Email.findById(userId);
  if (!mongoUser) {
    throw { status: 404, message: 'Usuario no encontrado en MongoDB' };
  }
  const email = mongoUser.email;
  if (!email) {
    throw { status: 404, message: 'No se pudo determinar el email del usuario' };
  }
  const query = 'SELECT proyecto_f FROM clientes WHERE email = $1 LIMIT 1';
  const result = await pgPool.query(query, [email]);
  if (result.rows.length === 0 || !result.rows[0].proyecto_f) {
    throw { status: 404, message: 'No se encontró proyecto asociado al usuario' };
  }
  const proyecto_id = String(result.rows[0].proyecto_f);
  return { email, proyecto_id };
}

// Crear un carrito de compras para el usuario autenticado (email de la sesión)
exports.createCarrito = async (req, res) => {
  try {
    const { email, proyecto_id } = await validarUsuarioYProyecto(req);

    // Buscar si ya existe un carrito pendiente
    let carrito = await Carrito.findOne({ cliente_id: email, proyecto_id, estado: 'pendiente' });
    if (carrito) {
      return res.status(200).json({ message: 'Ya existe un carrito pendiente', carrito });
    }

    carrito = new Carrito({
      cliente_id: email,
      proyecto_id,
      productos: [],
      total: 0,
      estado: 'pendiente'
    });
    await carrito.save();
    res.status(201).json({ message: 'Carrito creado', carrito });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || 'Error interno' });
  }
};

// Actualizar productos y total del carrito pendiente del usuario y proyecto de la sesión
exports.updateCarrito = async (req, res) => {
  try {
    const { email, proyecto_id } = await validarUsuarioYProyecto(req);

    // Buscar el carrito pendiente
    let carrito = await Carrito.findOne({ cliente_id: email, proyecto_id, estado: 'pendiente' });
    if (!carrito) {
      return res.status(404).json({ message: 'No existe un carrito pendiente para este usuario y proyecto' });
    }

    // Validación de productos y total
    const { productos, total } = req.body;
    if (!Array.isArray(productos) || typeof total !== "number" || total < 0) {
      return res.status(400).json({ message: 'Productos debe ser un array y total un número mayor o igual a 0' });
    }
    // Validar cada producto
    for (const prod of productos) {
      if (
        !prod.producto_id ||
        typeof prod.producto_id !== "string" ||
        typeof prod.cantidad !== "number" ||
        prod.cantidad < 0.01 ||
        typeof prod.precio !== "number" ||
        prod.precio < 0.01
      ) {
        return res.status(400).json({ message: 'Cada producto debe tener producto_id (string), cantidad (>=1) y precio (>=0)' });
      }
    }

    carrito.productos = productos;
    carrito.total = total;
    await carrito.save();

    res.status(200).json({ message: 'Carrito actualizado', carrito });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || 'Error interno' });
  }
};

// Obtener el carrito de compras pendiente por email de la sesión y proyecto asociado
exports.getCarrito = async (req, res) => {
  try {
    const { email, proyecto_id } = await validarUsuarioYProyecto(req);

    // Buscar el carrito pendiente
    const carrito = await Carrito.findOne({ cliente_id: email, proyecto_id, estado: 'pendiente' });
    if (!carrito) {
      return res.status(404).json({ message: 'No existe un carrito pendiente para este usuario y proyecto' });
    }

    res.status(200).json(carrito);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || 'Error interno' });
  }
};

// Obtener historial de compras del cliente autenticado
exports.getHistorialComprasCliente = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ message: 'No autenticado' });
    }
    const mongoUser = await Email.findById(userId);
    if (!mongoUser) {
      return res.status(404).json({ message: 'Usuario no encontrado en MongoDB' });
    }
    const email = mongoUser.email;
    if (!email) {
      return res.status(404).json({ message: 'No se pudo determinar el email del usuario' });
    }
    // Buscar ventas por email, ordenadas por fecha descendente
    const ventas = await Ventas.find({ email }).sort({ createdAt: -1 });
    res.json(ventas);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
