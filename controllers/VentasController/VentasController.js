const Ventas = require('../../models/VentaModel/ventamodel');
const User = require('../../models/ClientModel/ClientModel');
const Product = require('../../models/ProductModel/ProductModel');
const { pgPool } = require('../../config/db');

//generar una venta
exports.generarVenta = async (req, res) => {
    try {
        // 1. Obtener username desde MongoDB usando el userId del token
        const mongoUser = await User.findById(req.userId);
        if (!mongoUser) {
            return res.status(404).json({ message: 'Usuario no encontrado en MongoDB' });
        }
        const username = mongoUser.username;

        // 2. Consultar el proyecto_id en PostgreSQL usando el username
        const projectQuery = `
            SELECT p.proyecto_id, nombre
            FROM p_c p
            INNER JOIN administradores a ON p.cliente_id = a.cliente_id
            WHERE a.usuario = $1
        `;
        const projectResult = await pgPool.query(projectQuery, [username]);
        const proyectoId = projectResult.rows.length > 0 ? projectResult.rows[0].proyecto_id : null;

        // 3. Validar que proyecto_id sea válido
        if (!proyectoId || proyectoId === 0 || proyectoId === '' || proyectoId === null) {
            return res.status(403).json({ message: 'No autorizado: el usuario no tiene un proyecto asignado' });
        }
        
        const { cliente, email, producto, precio, cantidad } = req.body;

        // Validar que los campos requeridos estén presentes
        if (!producto || !precio || !cantidad) {
            return res.status(400).json({ message: 'Producto, precio y cantidad son requeridos' });
        }

        // Buscar el producto en la base de datos
        const prod = await Product.findById(producto);
        if (!prod) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }

        // Validar stock suficiente
        const stockActual = Number(prod.stock);
        const cantidadVenta = Number(cantidad);
        if (isNaN(stockActual) || isNaN(cantidadVenta) || cantidadVenta <= 0) {
            return res.status(400).json({ message: 'Stock o cantidad inválida' });
        }
        if (stockActual < cantidadVenta) {
            return res.status(400).json({ message: 'Stock insuficiente para la venta' });
        }

        // Calcular el total de la venta
        const totalVenta = precio * cantidadVenta;

        // Crear la venta en MongoDB, usando el proyectoId obtenido de Postgres
        const nuevaVenta = new Ventas({
            cliente,
            email,
            producto,
            precio,
            cantidad: cantidadVenta,
            totalVenta,
            proyecto: proyectoId
        });

        await nuevaVenta.save();

        // Actualizar el stock del producto
        prod.stock = String(stockActual - cantidadVenta);
        await prod.save();

        res.status(201).json({
            message: 'Venta generada exitosamente',
            ventaMongo: nuevaVenta,
            nuevoStock: prod.stock
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Obtener todas las ventas (para el panel de administración)
exports.getAllVentas = async (req, res) => {
    try {
        const ventas = await Ventas.find();
        // Para cada venta, obtener el nombre del producto usando el id
        const ventasConNombreProducto = await Promise.all(
            ventas.map(async (venta) => {
                let nombreProducto = "";
                if (venta.producto) {
                    const prod = await Product.findById(venta.producto);
                    nombreProducto = prod ? prod.name : venta.producto;
                }
                return {
                    ...venta._doc,
                    producto: nombreProducto
                };
            })
        );
        res.status(200).json(ventasConNombreProducto);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};