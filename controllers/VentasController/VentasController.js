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
            SELECT p.proyecto_id, nombres
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

        const { dni, items, totalVenta, estado, tipoPago, nfac, email } = req.body;

        // Buscar cliente por DNI en la tabla clientes (Postgres)
        let clienteId = null;
        if (dni) {
            try {
                const clienteQuery = `SELECT id FROM clientes WHERE dni = $1 LIMIT 1`;
                const clienteResult = await pgPool.query(clienteQuery, [dni]);
                if (clienteResult.rows.length > 0) {
                    clienteId = clienteResult.rows[0].id;
                }
            } catch (err) {
                console.error("Error buscando cliente por DNI:", err);
            }
        }

        // Buscar y validar productos y stock
        for (const item of items) {
            const prod = await Product.findById(item.producto);
            if (!prod) {
                return res.status(404).json({ message: `Producto no encontrado: ${item.producto}` });
            }
            const tieneProyecto = prod.projectDetails?.some(
                (pd) => String(pd.proyectoId) === String(proyectoId)
            );
            if (!tieneProyecto) {
                return res.status(403).json({ message: 'Solo puedes vender productos de tu propio proyecto.' });
            }
            const detalleProyecto = prod.projectDetails.find(
                (pd) => String(pd.proyectoId) === String(proyectoId)
            );
            if (!detalleProyecto) {
                return res.status(400).json({ message: 'No se encontró detalle de proyecto para este producto.' });
            }
            const stockActual = Number(detalleProyecto.stock);
            const cantidadVenta = Number(item.cantidad);
            if (isNaN(stockActual) || isNaN(cantidadVenta) || cantidadVenta <= 0) {
                return res.status(400).json({ message: 'Stock o cantidad inválida' });
            }
            if (stockActual < cantidadVenta) {
                return res.status(400).json({ message: 'Stock insuficiente para la venta' });
            }
        }

        const nuevaVenta = new Ventas({
            nfac,
            cliente: clienteId,
            email,
            items,
            totalVenta,
            proyecto_id: String(proyectoId),
            estado,
            tipoPago
        });

        await nuevaVenta.save();

        // Actualizar stock de cada producto vendido
        for (const item of items) {
            const prod = await Product.findById(item.producto);
            if (prod && prod.projectDetails) {
                const detalleProyecto = prod.projectDetails.find(
                    (pd) => String(pd.proyectoId) === String(proyectoId)
                );
                if (detalleProyecto) {
                    detalleProyecto.stock = Number(detalleProyecto.stock) - Number(item.cantidad);
                }
                await prod.save();
            }
        }

        res.status(201).json({
            message: 'Venta generada exitosamente',
            ventaMongo: nuevaVenta
        });
    } catch (error) {
        console.error("Error en generarVenta:", error);
        res.status(500).json({ message: error.message });
    }
};

// Obtener todas las ventas (para el panel de administración)
exports.getAllVentas = async (req, res) => {
    try {
        // Obtener username y proyecto_id del usuario autenticado
        const mongoUser = await User.findById(req.userId);
        if (!mongoUser) {
            return res.status(404).json({ message: 'Usuario no encontrado en MongoDB' });
        }
        const username = mongoUser.username;
        const projectQuery = `
            SELECT p.proyecto_id
            FROM p_c p
            INNER JOIN administradores a ON p.cliente_id = a.cliente_id
            WHERE a.usuario = $1
        `;
        const projectResult = await pgPool.query(projectQuery, [username]);
        const proyectoId = projectResult.rows.length > 0 ? String(projectResult.rows[0].proyecto_id) : null;
        if (!proyectoId) {
            return res.status(403).json({ message: 'No autorizado: el usuario no tiene un proyecto asignado' });
        }
        // Buscar solo ventas de ese proyecto
        const ventas = await Ventas.find({ proyecto_id: proyectoId });
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

// Obtener la suma total de ventas pagadas
exports.getTotalGanancias = async (req, res) => {
    try {
        const resultado = await Ventas.aggregate([
            { $match: { estado: 'pagado' } },
            { $group: { _id: null, total: { $sum: "$totalVenta" } } }
        ]);
        const total = resultado.length > 0 ? resultado[0].total : 0;
        res.json({ total });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};