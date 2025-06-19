const Dev = require('../../models/DevModel/DevModel');
const jwt = require('jsonwebtoken');
const { jwtSecret, jwtExpiration } = require('../../config/auth.config');
//PostgresSQL Controller
const { pgPool } = require('../../config/db');

// Registrar un desarrollador
exports.registerDev = async (req, res) => {
    try {
        const { username, password, nombres, apellidos, imagen_u, dni, email } = req.body;

        // Verificar si el usuario ya existe en MongoDB
        const existingDev = await Dev.findOne({ username });
        if (existingDev) {
            return res.status(400).json({ message: 'El usuario ya existe' });
        }

        // Crear un nuevo desarrollador en MongoDB
        const dev = new Dev({ username, password });
        await dev.save();

        // Insertar el desarrollador en PostgreSQL
        const fecha_creacion = new Date();
        const updated_at = new Date();

        const insertQuery = `
            INSERT INTO desarrolladores(
                nombres, apellidos, username, imagen_u, dni, email, fecha_creacion, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;

        await pgPool.query(insertQuery, [
            nombres,
            apellidos,
            username,
            imagen_u,
            dni,
            email,
            fecha_creacion,
            updated_at
        ]);

        res.status(201).json({ message: 'Desarrollador registrado exitosamente' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Iniciar sesión
exports.loginDev = async (req, res) => {
    try {
        const { username, password } = req.body;

        // Buscar al desarrollador por nombre de usuario
        const dev = await Dev.findOne({ username });
        if (!dev) {
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }

        // Verificar la contraseña
        const isMatch = await dev.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }

        // Generar un token de autenticación
        const token = jwt.sign({ devId: dev._id }, jwtSecret, {
            expiresIn: jwtExpiration,
        });

        // Configurar la cookie con el token
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000, // 1 día
        });

        res.json({ message: 'Inicio de sesión exitoso', token });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Cerrar sesión
exports.logoutDev = (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Sesión cerrada exitosamente' });
};

//obtener el token de desarrollador
exports.getDevToken = (req, res) => {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'Token no proporcionado' });
    }

    try {
        const decoded = jwt.verify(token, jwtSecret);
        res.json({ devId: decoded.devId });
    } catch (error) {
        res.status(401).json({ message: 'Token inválido o expirado' });
    }
}
