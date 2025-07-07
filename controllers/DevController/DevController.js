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

//cambiar la contraseña administrador como desarrollador
exports.changePasswordByDeveloper = async (req, res) => {
    try {
        const { username, newPassword } = req.body;

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

        // Verificar si el usuario autenticado es un desarrollador
        const devQuery = `
            SELECT rol_id 
            FROM desarrolladores 
            WHERE id = $1
        `;
        const devResult = await pgPool.query(devQuery, [decoded.devId]);

        if (devResult.rows.length === 0 || devResult.rows[0].rol_id !== 2) {
            return res.status(403).json({ message: 'No autorizado: solo los desarrolladores pueden realizar esta acción.' });
        }

        // Buscar el usuario de la tienda en MongoDB
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        // Actualizar la contraseña
        user.password = newPassword;
        await user.save();

        res.status(200).json({ message: 'Contraseña actualizada exitosamente por el desarrollador.' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Registrar un nuevo administrador (solo desarrollador)
exports.registerAdmin = async (req, res) => {
    try {
        const {
            nombres,
            apellidos,
            email,
            password,
            ubicacion,
            username
        } = req.body;

        // Validar token de desarrollador
        const devToken = req.cookies.token || req.headers.authorization?.split(' ')[1];
        if (!devToken) {
            return res.status(401).json({ message: 'No autorizado: token de sesión faltante' });
        }

        let decoded;
        try {
            decoded = jwt.verify(devToken, jwtSecret);
        } catch (error) {
            return res.status(401).json({ message: 'No autorizado: token inválido' });
        }

        // Verificar si el usuario ya existe en PostgreSQL
        const checkQuery = `SELECT * FROM administradores WHERE usuario = $1 OR email = $2`;
        const checkValues = [username, email];
        const checkResult = await pgPool.query(checkQuery, checkValues);
        if (checkResult.rows.length > 0) {
            return res.status(400).json({ message: 'El usuario ya existe en PostgreSQL' });
        }

        // Guardar el username y password en MongoDB
        const User = require('../../models/ClientModel/ClientModel');
        const newUser = new User({ username, password });
        await newUser.save();

        // Insertar el administrador en PostgreSQL
        const insertQuery = `
            INSERT INTO administradores (nombres, apellidos, usuario, email, ubicacion)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *;
        `;
        const insertValues = [nombres, apellidos, username, email, ubicacion];
        const insertResult = await pgPool.query(insertQuery, insertValues);

        res.status(201).json({
            message: 'Administrador registrado exitosamente',
            postgres: insertResult.rows[0]
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Eliminar un administrador (solo desarrollador)
exports.deleteAdmin = async (req, res) => {
    try {
        // Validar token de desarrollador
        const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: 'No autorizado: token no proporcionado.' });
        }
        let decoded;
        try {
            decoded = require('jsonwebtoken').verify(token, require('../../config/auth.config').jwtSecret);
        } catch (error) {
            return res.status(401).json({ message: 'Token inválido o expirado.' });
        }
        if (!decoded.devId) {
            return res.status(403).json({ message: 'No autorizado: solo desarrolladores pueden eliminar administradores.' });
        }

        const { clienteId } = req.params;
        if (!clienteId) {
            return res.status(400).json({ message: 'clienteId es requerido.' });
        }

        // Eliminar en PostgreSQL
        const { pgPool } = require('../../config/db');
        const deleteQuery = 'DELETE FROM administradores WHERE cliente_id = $1 RETURNING *';
        const result = await pgPool.query(deleteQuery, [clienteId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Administrador no encontrado.' });
        }

        // Opcional: eliminar en MongoDB si tienes el username
        const User = require('../../models/ClientModel/ClientModel');
        await User.deleteOne({ username: result.rows[0].usuario });

        res.json({ message: 'Administrador eliminado correctamente.', admin: result.rows[0] });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

