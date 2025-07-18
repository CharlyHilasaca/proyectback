//MongoDB Controller
const User = require('../../models/ClientModel/ClientModel');
const jwt = require('jsonwebtoken');
const { jwtSecret, jwtExpiration } = require('../../config/auth.config');
//PostgresSQL Controller
const { pgPool } = require('../../config/db');
const axios = require('axios');
require('dotenv').config();

//iniciar sesion
exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;

        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({ message: 'Credenciales invalidas' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Credenciales invalidas' });
        }

        const token = jwt.sign({ userId: user._id }, jwtSecret, {
            expiresIn: jwtExpiration
        });

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000
        });

        res.json({
            message: 'Inicio de sesion exitoso',
            token
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// cerrar sesion
exports.logout = (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Sesión cerrada exitosamente' });
};

//obtener usuario por id
exports.getUserById = async (req, res) => {
    try {
        const userId = req.params.id;
        const mongoUser = await User.findById(userId);
        if (!mongoUser) {
            return res.status(404).json({ message: 'Usuario no encontrado en MongoDB' });
        }
        const username = mongoUser.username;

        const query = `
            SELECT c.*, p.nombre
            FROM administradores c
            INNER JOIN p_c pc ON c.cliente_id = pc.cliente_id
            INNER JOIN proyectos_vh p ON pc.proyecto_id = p.proyecto_id
            WHERE c.usuario = $1;
        `;
        const values = [username];
        const result = await pgPool.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado en PostgreSQL' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

//obtener el usuario autenticado (carpeta login admin)
exports.getUser = async (req, res) => {
    try {
        const mongoUser = await User.findById(req.userId);
        if (!mongoUser) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }
        res.json({ username: mongoUser.username });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

//obtener el proyecto del usuario autenticado
exports.getUserProject = async (req, res) => {
    try {
        const mongoUser = await User.findById(req.userId);
        if (!mongoUser) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }
        const username = mongoUser.username;

        // Consulta SQL actualizada para obtener el campo imagenes
        const query = `
            SELECT 
                p.proyecto_id, 
                p.nombre, 
                p.imagenes
            FROM proyectos_vh p
            INNER JOIN p_c pc ON p.proyecto_id = pc.proyecto_id
            INNER JOIN administradores c ON pc.cliente_id = c.cliente_id
            WHERE c.usuario = $1
            ORDER BY p.fecha_creacion DESC
            LIMIT 1;
        `;
        const values = [username];
        const result = await pgPool.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Proyecto no encontrado para el usuario' });
        }

        // Devuelve la info del proyecto y la url de la imagen si existe
        const row = result.rows[0];
        res.json({
            proyecto_id: row.proyecto_id,
            nombre: row.nombre,
            imagenes: row.imagenes,
            imagen_url: row.imagenes ? `/uploads/${row.imagenes}` : null
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Obtener todos los clientes de la tabla customer solo si el usuario tiene un proyecto_id válido
exports.getAllCustomers = async (req, res) => {
    try {
        // 1. Obtener username desde MongoDB usando el userId del token
        const mongoUser = await User.findById(req.userId);
        if (!mongoUser) {
            return res.status(404).json({ message: 'Usuario no encontrado en MongoDB' });
        }
        const username = mongoUser.username;

        // 2. Consultar el proyecto_id en PostgreSQL
        const projectQuery = `
            SELECT p.proyecto_id
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

        // 4. Obtener todos los clientes sin importar si los campos son nulos o vacíos
        const customersQuery = `
            SELECT 
            dni, nombres, email, celphone, direccion, ubicacion, fnacimiento, username, apellidos
            FROM customer
        `;
        const customersResult = await pgPool.query(customersQuery);

        res.json(customersResult.rows);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Obtener todos los proyectos (proyecto_id y nombre) de la tabla proyectos_vh sin autenticación
exports.getAllProyectos = async (req, res) => {
    try {
        const query = 'SELECT proyecto_id, nombre FROM proyectos_vh';
        const result = await pgPool.query(query);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Obtener todos los clientes de la tabla clientes (solo para administradores autenticados)
exports.getAllClientesPG = async (req, res) => {
    try {
        // Validar que el token esté presente
        const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: 'No autorizado: token no proporcionado.' });
        }

        // Verificar y decodificar el token
        let decoded;
        try {
            decoded = jwt.verify(token, jwtSecret);
        } catch (error) {
            return res.status(401).json({ message: 'Token inválido o expirado.' });
        }

        // Consultar los clientes en PostgreSQL, incluyendo dni, nombres, apellidos, email
        const query = `SELECT id, dni, nombres, apellidos, email FROM clientes`;
        const result = await pgPool.query(query);

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Buscar cliente por DNI, insertar si no existe usando la API de RENIEC
exports.getClienteByDni = async (req, res) => {
    try {
        const { dni } = req.params;
        if (!dni) {
            return res.status(400).json({ message: "DNI es requerido" });
        }

        // 1. Buscar en la tabla clientes de Postgres
        const query = `SELECT nombres, apellidos, email FROM clientes WHERE dni = $1 LIMIT 1`;
        const result = await pgPool.query(query, [dni]);

        if (result.rows.length > 0) {
            // Cliente encontrado en Postgres
            return res.json(result.rows[0]);
        }

        // 2. Si no existe, consultar la API de RENIEC
        const apiToken = process.env.DNI_TOKEN;
        if (!apiToken) {
            return res.status(500).json({ message: "Token de acceso para la API no configurado" });
        }

        const apiUrl = `https://api.apis.net.pe/v2/reniec/dni?numero=${dni}`;
        const apiRes = await axios.get(apiUrl, {
            headers: {
                Authorization: `Bearer ${apiToken}`
            }
        });

        const data = apiRes.data;
        if (!data || !data.nombres || !data.apellidoPaterno || !data.apellidoMaterno) {
            return res.status(404).json({ message: "No se encontraron datos en la API para el DNI proporcionado" });
        }

        const nombres = data.nombres;
        const apellidos = `${data.apellidoPaterno} ${data.apellidoMaterno}`;
        const email = ""; // Puedes dejarlo vacío o generar uno si lo deseas

        // Username: concatenación de nombres y apellido paterno (sin espacios extra)
        const username = `${nombres} ${data.apellidoPaterno}`.replace(/\s+/g, ' ').trim();

        // 3. Insertar en la tabla clientes de Postgres
        const insertQuery = `
            INSERT INTO clientes (dni, nombres, apellidos, email, username)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING nombres, apellidos, email
        `;
        const insertResult = await pgPool.query(insertQuery, [dni, nombres, apellidos, email, username]);

        res.json(insertResult.rows[0]);
    } catch (error) {
        if (error.response && error.response.data) {
            return res.status(500).json({ message: error.response.data.message || "Error consultando la API externa" });
        }
        res.status(500).json({ message: error.message });
    }
};

// Obtener historial de compras (web y tienda) y detalles para un cliente por su id
exports.getHistorialComprasClientePG = async (req, res) => {
    try {
        const { clienteId } = req.query;
        if (!clienteId) {
            return res.status(400).json({ message: "clienteId es requerido" });
        }

        // Buscar ventas en MongoDB por cliente (web y tienda)
        const Ventas = require('../../models/VentaModel/ventamodel');
        const ventas = await Ventas.find({ cliente: Number(clienteId) }).sort({ createdAt: -1 });

        // Para cada venta, obtener detalles de productos
        const Product = require('../../models/ProductModel/ProductModel');
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
                return {
                    ...venta._doc,
                    items: itemsConNombre
                };
            })
        );

        res.json(ventasConDetalles);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};