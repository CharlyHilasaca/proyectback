const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../../config/auth.config');
const { pgPool } = require('../../config/db');
const Dev = require('../../models/DevModel/DevModel');

exports.getProyectos = async (req, res) => {
    try {
        const proyectosQuery = `
            SELECT * FROM proyectos_vh
            ORDER BY fecha_creacion DESC
        `;
        const proyectosResult = await pgPool.query(proyectosQuery);

        const proyectos = proyectosResult.rows.map(row => ({
            ...row,
            imagen: row.imagenes || null
        }));

        res.status(200).json(proyectos);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.createProyecto = async (req, res) => {
    try {
        const { nombre, descripcion, imagenes, distrito, provincia, departamento } = req.body;

        // Validar que el token esté presente
        const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: 'No autorizado: token no proporcionado.' });
        }

        let decoded;
        try {
            // Verificar y decodificar el token
            decoded = jwt.verify(token, jwtSecret);

            // Obtener el username de MongoDB usando el devId del token
            const dev = await Dev.findById(decoded.devId).select('username');
            if (!dev) {
                return res.status(404).json({ message: 'Desarrollador no encontrado en MongoDB.' });
            }
            decoded.username = dev.username;
        } catch (err) {
            return res.status(401).json({ message: 'Token inválido o expirado.' });
        }

        // Verificar si el desarrollador existe en la base de datos PostgreSQL
        const devQuery = `
            SELECT rol_id 
            FROM desarrolladores 
            WHERE username = $1
        `;
        const devResult = await pgPool.query(devQuery, [decoded.username]);

        if (devResult.rows.length === 0 || devResult.rows[0].rol_id !== 2) {
            return res.status(403).json({ message: 'No autorizado: solo los desarrolladores pueden crear proyectos.' });
        }

        // Insertar el proyecto en la tabla proyectos_vh (imagenes como string JSON)
        const insertQuery = `
            INSERT INTO proyectos_vh (categoria_id, nombre, descripcion, imagenes, distrito, provincia, departamento)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *;
        `;
        const values = [
            1,
            nombre,
            descripcion,
            imagenes || null, // solo el nombre de la imagen
            distrito,
            provincia,
            departamento
        ];
        const insertResult = await pgPool.query(insertQuery, values);

        const proyecto = insertResult.rows[0];
        proyecto.imagen = proyecto.imagenes || null;

        res.status(201).json({
            message: 'Proyecto creado exitosamente.',
            proyecto,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getProyectoById = async (req, res) => {
    try {
        const { id } = req.params;

        // Obtener el token de las cookies o del encabezado Authorization
        const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: 'No autorizado: token no proporcionado.' });
        }

        let decoded;
        try {
            // Verificar y decodificar el token
            decoded = jwt.verify(token, jwtSecret);

            // Obtener el username de MongoDB usando el devId del token
            const dev = await Dev.findById(decoded.devId).select('username');
            if (!dev) {
                return res.status(404).json({ message: 'Desarrollador no encontrado en MongoDB.' });
            }
            decoded.username = dev.username;
        } catch (err) {
            return res.status(401).json({ message: 'Token inválido o expirado.' });
        }

        // Verificar si el desarrollador existe en la base de datos PostgreSQL
        const devQuery = `
            SELECT rol_id 
            FROM desarrolladores 
            WHERE username = $1
        `;
        const devResult = await pgPool.query(devQuery, [decoded.username]);

        if (devResult.rows.length === 0 || devResult.rows[0].rol_id !== 2) {
            return res.status(403).json({ message: 'No autorizado: solo los desarrolladores pueden acceder a los proyectos.' });
        }

        // Obtener el proyecto específico (ahora con columna imagenes)
        const proyectoQuery = `
            SELECT * FROM proyectos_vh WHERE proyecto_id = $1
        `;
        const proyectoResult = await pgPool.query(proyectoQuery, [id]);

        if (proyectoResult.rows.length === 0) {
            return res.status(404).json({ message: 'Proyecto no encontrado.' });
        }

        const proyecto = proyectoResult.rows[0];
        proyecto.imagen = proyecto.imagenes || null;

        res.status(200).json(proyecto);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.searchProyectos = async (req, res) => {
    try {
        const search = req.query.search || "";
        const query = `
            SELECT * FROM proyectos_vh
            WHERE LOWER(nombre) LIKE $1
               OR LOWER(distrito) LIKE $1
               OR LOWER(provincia) LIKE $1
               OR LOWER(departamento) LIKE $1
            ORDER BY fecha_creacion DESC
            LIMIT 20
        `;
        const value = `%${search.toLowerCase()}%`;
        const result = await pgPool.query(query, [value]);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};