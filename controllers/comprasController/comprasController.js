const Carrito = require('../../models/ComprasModel/comprasModel');
const Email = require('../../models/UserModel/UserModel');
const { pgPool } = require('../../config/db');

// Crear un carrito de compras para el usuario autenticado (email de la sesión)
exports.createCarrito = async (req, res) => {
  try {
    // Obtener el userId del token (middleware debe ponerlo en req.userId)
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ message: 'No autenticado' });
    }

    // Buscar el usuario en MongoDB por _id
    const mongoUser = await Email.findById(userId);
    if (!mongoUser) {
      return res.status(404).json({ message: 'Usuario no encontrado en MongoDB' });
    }
    const email = mongoUser.email;
    if (!email) {
      return res.status(404).json({ message: 'No se pudo determinar el email del usuario' });
    }

    // Buscar el proyecto_f en PostgreSQL
    const query = 'SELECT proyecto_f FROM clientes WHERE email = $1 LIMIT 1';
    const result = await pgPool.query(query, [email]);
    if (result.rows.length === 0 || !result.rows[0].proyecto_f) {
      return res.status(404).json({ message: 'No se encontró proyecto asociado al usuario' });
    }
    const proyecto_id = String(result.rows[0].proyecto_f);

    // Crear el carrito (si ya existe uno pendiente para ese usuario y proyecto, no crear otro)
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
    res.status(500).json({ message: error.message });
  }
};

// Actualizar productos y total del carrito pendiente del usuario y proyecto de la sesión
exports.updateCarrito = async (req, res) => {
  try {
    // Obtener el userId del token (middleware debe ponerlo en req.userId)
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ message: 'No autenticado' });
    }

    // Buscar el usuario en MongoDB por _id
    const mongoUser = await Email.findById(userId);
    if (!mongoUser) {
      return res.status(404).json({ message: 'Usuario no encontrado en MongoDB' });
    }
    const email = mongoUser.email;
    if (!email) {
      return res.status(404).json({ message: 'No se pudo determinar el email del usuario' });
    }

    // Buscar el proyecto_f en PostgreSQL
    const query = 'SELECT proyecto_f FROM clientes WHERE email = $1 LIMIT 1';
    const result = await pgPool.query(query, [email]);
    if (result.rows.length === 0 || !result.rows[0].proyecto_f) {
      return res.status(404).json({ message: 'No se encontró proyecto asociado al usuario' });
    }
    const proyecto_id = String(result.rows[0].proyecto_f);

    // Buscar el carrito pendiente
    let carrito = await Carrito.findOne({ cliente_id: email, proyecto_id, estado: 'pendiente' });
    if (!carrito) {
      return res.status(404).json({ message: 'No existe un carrito pendiente para este usuario y proyecto' });
    }

    // Actualizar productos y total
    const { productos, total } = req.body;
    if (!Array.isArray(productos) || typeof total !== "number") {
      return res.status(400).json({ message: 'Productos y total requeridos' });
    }

    carrito.productos = productos;
    carrito.total = total;
    await carrito.save();

    res.status(200).json({ message: 'Carrito actualizado', carrito });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener el carrito de compras pendiente por email de la sesión y proyecto asociado
exports.getCarrito = async (req, res) => {
  try {
    // Obtener el userId del token (middleware debe ponerlo en req.userId)
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ message: 'No autenticado' });
    }

    // Buscar el usuario en MongoDB por _id
    const mongoUser = await Email.findById(userId);
    if (!mongoUser) {
      return res.status(404).json({ message: 'Usuario no encontrado en MongoDB' });
    }
    const email = mongoUser.email;
    if (!email) {
      return res.status(404).json({ message: 'No se pudo determinar el email del usuario' });
    }

    // Buscar el proyecto_f en PostgreSQL
    const query = 'SELECT proyecto_f FROM clientes WHERE email = $1 LIMIT 1';
    const result = await pgPool.query(query, [email]);
    if (result.rows.length === 0 || !result.rows[0].proyecto_f) {
      return res.status(404).json({ message: 'No se encontró proyecto asociado al usuario' });
    }
    const proyecto_id = String(result.rows[0].proyecto_f);

    // Buscar el carrito pendiente
    const carrito = await Carrito.findOne({ cliente_id: email, proyecto_id, estado: 'pendiente' });
    if (!carrito) {
      return res.status(404).json({ message: 'No existe un carrito pendiente para este usuario y proyecto' });
    }

    res.status(200).json(carrito);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
