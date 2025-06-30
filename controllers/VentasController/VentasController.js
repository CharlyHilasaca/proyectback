const Ventas = require('../../models/VentaModel/ventamodel');
const User = require('../../models/ClientModel/ClientModel');
const Product = require('../../models/ProductModel/ProductModel');
const Carrito = require('../../models/ComprasModel/comprasModel');
const Email = require('../../models/UserModel/UserModel');
const { pgPool } = require('../../config/db');
const { jwtSecret } = require('../../config/auth.config');
const jwt = require('jsonwebtoken');

//generar una venta en tienda (admin)
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

        const { dni, items, totalVenta, estado, tipoPago, email } = req.body;

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

        // Obtener el último nro de venta para este proyecto
        const ultimaVenta = await Ventas.findOne({ proyecto_id: String(proyectoId) })
            .sort({ nro: -1 })
            .select("nro");
        const nro = ultimaVenta && ultimaVenta.nro ? ultimaVenta.nro + 1 : 1;
        const nfac = `T${proyectoId}-${nro}`; //cambio en facturacion

        // Determinar origen de la venta
        let origen = "tienda";
        if (req.userId) {
            // Si el usuario autenticado es un cliente (web), origen = web
            // Puedes mejorar esta lógica si tienes roles
            if (mongoUser && mongoUser.username === undefined && mongoUser.email) {
                origen = "web";
            }
        }

        // Buscar cliente por email si es venta web
        let clienteIdByEmail = null;
        if (origen === "web" && email) {
            try {
                const clienteQuery = `SELECT id FROM clientes WHERE email = $1 LIMIT 1`;
                const clienteResult = await pgPool.query(clienteQuery, [email]);
                if (clienteResult.rows.length > 0) {
                    clienteIdByEmail = clienteResult.rows[0].id;
                }
            } catch (err) {
                // No error fatal
            }
        }

        const nuevaVenta = new Ventas({
            nro,
            nfac,
            cliente: clienteId || clienteIdByEmail,
            email,
            items,
            totalVenta,
            proyecto_id: String(proyectoId),
            estado,
            tipoPago,
            origen
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

        // Eliminar carrito pendiente del cliente si existe (por si el admin vende a un cliente con carrito)
        if (email) {
            await Carrito.deleteMany({ cliente_id: email, estado: 'pendiente' });
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

// generar una venta web (cliente)
exports.generarVentaWeb = async (req, res) => {
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
        // Buscar cliente en Postgres usando el email
        const clienteQuery = `SELECT id, proyecto_f FROM clientes WHERE email = $1 LIMIT 1`;
        const clienteResult = await pgPool.query(clienteQuery, [email]);
        if (clienteResult.rows.length === 0) {
            return res.status(404).json({ message: 'Cliente no encontrado en PostgreSQL' });
        }
        const clienteId = clienteResult.rows[0].id;
        const proyecto_id = String(clienteResult.rows[0].proyecto_f);

        // Buscar carrito pendiente usando el email
        const carrito = await Carrito.findOne({ cliente_id: email, proyecto_id, estado: 'pendiente' });
        if (!carrito) {
            return res.status(404).json({ message: 'No existe un carrito pendiente para este usuario' });
        }

        // Validación: carrito debe tener productos
        if (!Array.isArray(carrito.productos) || carrito.productos.length === 0) {
            return res.status(400).json({ message: 'El carrito está vacío' });
        }

        // Validación: total debe ser mayor a cero
        if (typeof carrito.total !== "number" || carrito.total <= 0) {
            return res.status(400).json({ message: 'El total del carrito es inválido' });
        }

        // Validar productos y stock
        for (const item of carrito.productos) {
            const prod = await Product.findById(item.producto_id);
            if (!prod) {
                return res.status(404).json({ message: `Producto no encontrado: ${item.producto_id}` });
            }
            const detalleProyecto = prod.projectDetails?.find(
                (pd) => String(pd.proyectoId) === String(proyecto_id)
            );
            if (!detalleProyecto) {
                return res.status(400).json({ message: `No se encontró detalle de proyecto para el producto: ${item.producto_id}` });
            }
            const stockActual = Number(detalleProyecto.stock);
            const cantidadVenta = Number(item.cantidad);
            if (isNaN(stockActual) || isNaN(cantidadVenta) || cantidadVenta <= 0) {
                return res.status(400).json({ message: `Stock o cantidad inválida para el producto: ${item.producto_id}` });
            }
            if (stockActual < cantidadVenta) {
                return res.status(400).json({ message: `Stock insuficiente para el producto: ${item.producto_id}` });
            }
        }

        // Obtener el último nro de venta para este proyecto
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

        res.status(201).json({
            message: 'Venta web generada exitosamente',
            ventaMongo: nuevaVenta
        });
    } catch (error) {
        console.error("Error en generarVentaWeb:", error);
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
        // Buscar solo ventas de ese proyecto, ordenadas por fecha descendente (más recientes primero)
        const ventas = await Ventas.find({ proyecto_id: proyectoId }).sort({ createdAt: -1 });
        // Para cada venta, obtener el nombre del producto usando el id y los datos del cliente si existe
        const ventasConDetalles = await Promise.all(
            ventas.map(async (venta) => {
                // Mapear los items para reemplazar el id por el nombre del producto
                const itemsConNombre = await Promise.all(
                    (venta.items || []).map(async (item) => {
                        let nombreProducto = item.producto;
                        try {
                            const prod = await Product.findById(item.producto);
                            if (prod) nombreProducto = prod.name;
                        } catch {}
                        return {
                            ...item._doc,
                            nombre: nombreProducto
                        };
                    })
                );
                let clienteNombres = null;
                let clienteApellidos = null;
                let clienteCelular = null;
                if (venta.cliente) {
                    try {
                        const clienteQuery = `SELECT nombres, apellidos, cellphone FROM clientes WHERE id = $1 LIMIT 1`;
                        const clienteResult = await pgPool.query(clienteQuery, [venta.cliente]);
                        if (clienteResult.rows.length > 0) {
                            clienteNombres = clienteResult.rows[0].nombres;
                            clienteApellidos = clienteResult.rows[0].apellidos;
                            clienteCelular = clienteResult.rows[0].celphone;
                        }
                    } catch {}
                } else if (venta.email) {
                    // Si no hay id pero hay email, busca por email
                    try {
                        const clienteQuery = `SELECT nombres, apellidos, cellphone FROM clientes WHERE email = $1 LIMIT 1`;
                        const clienteResult = await pgPool.query(clienteQuery, [venta.email]);
                        if (clienteResult.rows.length > 0) {
                            clienteNombres = clienteResult.rows[0].nombres;
                            clienteApellidos = clienteResult.rows[0].apellidos;
                            clienteCelular = clienteResult.rows[0].celphone;
                        }
                    } catch {}
                }
                return {
                    ...venta._doc,
                    items: itemsConNombre,
                    cliente: clienteNombres,
                    apellidos: clienteApellidos,
                    celular: clienteCelular
                };
            })
        );
        res.status(200).json(ventasConDetalles);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Obtener la suma total de ventas pagadas
exports.getTotalGanancias = async (req, res) => {
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
        // Sumar solo ventas de ese proyecto y estado pagado
        const resultado = await Ventas.aggregate([
            { $match: { estado: 'pagado', proyecto_id: proyectoId } },
            { $group: { _id: null, total: { $sum: "$totalVenta" } } }
        ]);
        const total = resultado.length > 0 ? resultado[0].total : 0;
        res.json({ total });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Obtener los 4 productos más vendidos de los últimos 30 días para el proyecto del usuario autenticado
exports.getProductosMasVendidos = async (req, res) => {
    try {
        // Obtener el usuario autenticado
        const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: 'No autorizado: token no proporcionado.' });
        }
        let decoded;
        try {
            decoded = jwt.verify(token, jwtSecret);
        } catch (error) {
            return res.status(401).json({ message: 'Token inválido o expirado.' });
        }
        // Permitir userId o devId en el token
        let mongoUser = null;
        if (decoded.userId) {
            mongoUser = await User.findById(decoded.userId);
        }
        if (!mongoUser) {
            return res.status(404).json({ message: 'Usuario no encontrado en MongoDB.' });
        }
        const username = mongoUser.username;
        // Consultar el proyecto_id en PostgreSQL
        const projectQuery = `
            SELECT p.proyecto_id
            FROM proyectos_vh p
            INNER JOIN p_c pc ON p.proyecto_id = pc.proyecto_id
            INNER JOIN administradores c ON pc.cliente_id = c.cliente_id
            WHERE c.usuario = $1;
        `;
        const projectResult = await pgPool.query(projectQuery, [username]);
        if (projectResult.rows.length === 0) {
            return res.status(404).json({ message: 'No se encontró un proyecto asociado al usuario.' });
        }
        const proyectoId = String(projectResult.rows[0].proyecto_id);
        // Calcular fecha hace 30 días
        const fechaLimite = new Date();
        fechaLimite.setDate(fechaLimite.getDate() - 30);
        // Buscar ventas del proyecto en los últimos 30 días
        const ventas = await Ventas.find({
            proyecto_id: proyectoId,
            createdAt: { $gte: fechaLimite }
        });
        // Contar productos vendidos
        const conteo = {};
        ventas.forEach(venta => {
            venta.items.forEach(item => {
                if (!conteo[item.producto]) conteo[item.producto] = 0;
                conteo[item.producto] += item.cantidad;
            });
        });
        // Ordenar y tomar los 4 más vendidos
        const topIds = Object.entries(conteo)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([id]) => id);
        // Obtener info de los productos
        const productos = await Product.find({ _id: { $in: topIds } });
        // Mapear resultado
        const resultado = topIds.map(id => {
            const prod = productos.find(p => String(p._id) === String(id));
            if (!prod) return null;
            return {
                _id: prod._id,
                name: prod.name,
                marca: prod.marca,
                image: prod.image,
                cantidadVendida: conteo[id]
            };
        }).filter(Boolean);
        res.json(resultado);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};