const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../../config/auth.config');
const { pgPool } = require('../../config/db');
const Dev = require('../../models/DevModel/DevModel');

exports.getProyectos = async (req, res) => {
    try {
        const devId = req.devId;
        if (!devId) {
            return res.status(401).json({ message: 'No autorizado: token no proporcionado o inválido.' });
        }

        // Obtener el username de MongoDB usando el devId del middleware
        const dev = await Dev.findById(devId).select('username');
        if (!dev) {
            return res.status(404).json({ message: 'Desarrollador no encontrado en MongoDB.' });
        }

        // Verificar si el desarrollador existe en la base de datos PostgreSQL
        const devQuery = `
            SELECT rol_id 
            FROM desarrolladores 
            WHERE username = $1
        `;
        const devResult = await pgPool.query(devQuery, [dev.username]);

        if (devResult.rows.length === 0 || devResult.rows[0].rol_id !== 2) {
            return res.status(403).json({ message: 'No autorizado: solo los desarrolladores pueden acceder a los proyectos.' });
        }

        // Obtener los proyectos desde PostgreSQL con sus imágenes
        const proyectosQuery = `
            SELECT p.*, 
                   i.id as imagen_id,
                   i.tipo_mime as imagen_tipo_mime,
                   i.nombre_archivo as imagen_nombre
            FROM proyectos_vh p
            LEFT JOIN imagenes_proyectos i ON p.proyecto_id = i.id
            ORDER BY p.fecha_creacion DESC
        `;
        const proyectosResult = await pgPool.query(proyectosQuery);

        // Procesar los resultados para agrupar las imágenes por proyecto
        const proyectosMap = new Map();
        proyectosResult.rows.forEach(row => {
            if (!proyectosMap.has(row.proyecto_id)) {
                proyectosMap.set(row.proyecto_id, {
                    proyecto_id: row.proyecto_id,
                    categoria_id: row.categoria_id,
                    nombre: row.nombre,
                    descripcion: row.descripcion,
                    distrito: row.distrito,
                    provincia: row.provincia,
                    departamento: row.departamento,
                    fecha_creacion: row.fecha_creacion,
                    updated_at: row.updated_at,
                    imagenes: []
                });
            }
            if (row.imagen_id) {
                proyectosMap.get(row.proyecto_id).imagenes.push({
                    id: row.imagen_id,
                    tipo_mime: row.imagen_tipo_mime,
                    nombre: row.imagen_nombre,
                    url: `/api/proyectos/imagen/${row.imagen_id}`
                });
            }
        });

        res.status(200).json(Array.from(proyectosMap.values()));
    } catch (error) {
        console.error('Error al obtener proyectos:', error);
        res.status(500).json({ message: error.message });
    }
};

exports.createProyecto = async (req, res) => {
    try {
        const { nombre, descripcion, imagen_p, distrito, provincia, departamento } = req.body;

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

        // Insertar el proyecto en la tabla proyectos_vh
        const insertQuery = `
            INSERT INTO proyectos_vh (categoria_id, nombre, descripcion, imagen_p, distrito, provincia, departamento)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *;
        `;
        const values = [1, nombre, descripcion, imagen_p, distrito, provincia, departamento];
        const insertResult = await pgPool.query(insertQuery, values);

        res.status(201).json({
            message: 'Proyecto creado exitosamente.',
            proyecto: insertResult.rows[0],
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

        // Obtener el proyecto específico
        const proyectoQuery = `
            SELECT * FROM proyectos_vh WHERE proyecto_id = $1
        `;
        const proyectoResult = await pgPool.query(proyectoQuery, [id]);

        if (proyectoResult.rows.length === 0) {
            return res.status(404).json({ message: 'Proyecto no encontrado.' });
        }

        res.status(200).json(proyectoResult.rows[0]);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getImagenProyecto = async (req, res) => {
    try {
        const { id } = req.params;

        // Obtener la imagen de la base de datos
        const query = `
            SELECT datos_binarios, tipo_mime, nombre_archivo
            FROM imagenes_proyectos
            WHERE id = $1
        `;
        const result = await pgPool.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Imagen no encontrada' });
        }

        const { datos_binarios, tipo_mime } = result.rows[0];

        // Enviar la imagen como respuesta
        res.setHeader('Content-Type', tipo_mime);
        res.send(datos_binarios);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.addProyecto = async (req, res) => {
    try {
        const { nombre, descripcion, distrito, provincia, departamento } = req.body;
        const devId = req.devId;

        // Obtener el username del desarrollador desde MongoDB
        const dev = await Dev.findById(devId).select('username');
        if (!dev) {
            return res.status(404).json({ message: 'Desarrollador no encontrado en MongoDB.' });
        }

        // Verificar si el desarrollador existe en PostgreSQL y tiene el rol correcto
        const devQuery = `
            SELECT rol_id 
            FROM desarrolladores 
            WHERE username = $1
        `;
        const devResult = await pgPool.query(devQuery, [dev.username]);

        if (devResult.rows.length === 0 || devResult.rows[0].rol_id !== 2) {
            return res.status(403).json({ message: 'No autorizado: solo los desarrolladores pueden agregar proyectos.' });
        }

        // Insertar el proyecto en la base de datos
        const proyectoQuery = `
            INSERT INTO proyectos_vh (nombre, descripcion, distrito, provincia, departamento)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING proyecto_id
        `;
        const proyectoResult = await pgPool.query(proyectoQuery, [
            nombre,
            descripcion,
            distrito,
            provincia,
            departamento
        ]);

        const proyectoId = proyectoResult.rows[0].proyecto_id;

        // Si hay una imagen, guardarla
        if (req.file) {
            const imagenQuery = `
                INSERT INTO imagenes_proyectos (proyecto_id, datos_binarios, tipo_mime, nombre_archivo)
                VALUES ($1, $2, $3, $4)
            `;
            await pgPool.query(imagenQuery, [
                proyectoId,
                req.file.buffer,
                req.file.mimetype,
                req.file.originalname
            ]);
        }

        res.status(201).json({ 
            message: 'Proyecto creado exitosamente',
            proyecto_id: proyectoId
        });
    } catch (error) {
        console.error('Error al crear proyecto:', error);
        res.status(500).json({ message: error.message });
    }
};

exports.updateProyecto = async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, descripcion, distrito, provincia, departamento } = req.body;
        const devId = req.devId;

        // Obtener el username del desarrollador desde MongoDB
        const dev = await Dev.findById(devId).select('username');
        if (!dev) {
            return res.status(404).json({ message: 'Desarrollador no encontrado en MongoDB.' });
        }

        // Verificar si el desarrollador existe en PostgreSQL y tiene el rol correcto
        const devQuery = `
            SELECT rol_id 
            FROM desarrolladores 
            WHERE username = $1
        `;
        const devResult = await pgPool.query(devQuery, [dev.username]);

        if (devResult.rows.length === 0 || devResult.rows[0].rol_id !== 2) {
            return res.status(403).json({ message: 'No autorizado: solo los desarrolladores pueden actualizar proyectos.' });
        }

        // Actualizar el proyecto
        const proyectoQuery = `
            UPDATE proyectos_vh 
            SET nombre = $1, descripcion = $2, distrito = $3, provincia = $4, departamento = $5
            WHERE proyecto_id = $6
            RETURNING *
        `;
        const proyectoResult = await pgPool.query(proyectoQuery, [
            nombre,
            descripcion,
            distrito,
            provincia,
            departamento,
            id
        ]);

        if (proyectoResult.rows.length === 0) {
            return res.status(404).json({ message: 'Proyecto no encontrado.' });
        }

        // Si hay una nueva imagen, actualizarla
        if (req.file) {
            // Primero eliminar la imagen anterior si existe
            await pgPool.query('DELETE FROM imagenes_proyectos WHERE proyecto_id = $1', [id]);

            // Insertar la nueva imagen
            const imagenQuery = `
                INSERT INTO imagenes_proyectos (proyecto_id, datos_binarios, tipo_mime, nombre_archivo)
                VALUES ($1, $2, $3, $4)
            `;
            await pgPool.query(imagenQuery, [
                id,
                req.file.buffer,
                req.file.mimetype,
                req.file.originalname
            ]);
        }

        res.status(200).json({ 
            message: 'Proyecto actualizado exitosamente',
            proyecto: proyectoResult.rows[0]
        });
    } catch (error) {
        console.error('Error al actualizar proyecto:', error);
        res.status(500).json({ message: error.message });
    }
};