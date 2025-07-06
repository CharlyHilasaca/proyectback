const { pgPool } = require('../../config/db');
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../../config/auth.config');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { uploadFileToS3 } = require('../../utils/s3Upload');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');

// Crear un nuevo proyecto (solo desarrollador, optimiza imagen y sube a S3)
exports.createProyecto = async (req, res) => {
  try {
    // Validar token de desarrollador
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
    if (!decoded.devId) {
      return res.status(403).json({ message: 'No autorizado: solo desarrolladores pueden agregar proyectos.' });
    }

    const { nombre, descripcion, distrito, provincia, departamento } = req.body;
    let imagenes = null;

    // Procesar imagen si se envía
    if (req.file) {
      const file = req.file;
      const webpFileName = path.basename(file.originalname, path.extname(file.originalname)) + '.webp';
      const webpFullPath = path.join(path.dirname(file.path), webpFileName);

      await sharp(file.path)
        .webp({ quality: 80 })
        .toFile(webpFullPath);

      // Sube el archivo webp optimizado a S3
      const BUCKET_NAME = process.env.AWS_BUCKET_NAME;
      const result = await uploadFileToS3(webpFullPath, webpFileName, BUCKET_NAME);

      // Borra los archivos temporales
      fs.unlinkSync(file.path);
      fs.unlinkSync(webpFullPath);

      imagenes = webpFileName; // Guarda solo el nombre del archivo .webp
    } else if (req.body.imagenes) {
      imagenes = req.body.imagenes;
    }

    if (!nombre) {
      return res.status(400).json({ message: 'El nombre es obligatorio.' });
    }

    const insertQuery = `
      INSERT INTO proyectos_vh (nombre, descripcion, distrito, provincia, departamento, imagenes, fecha_creacion)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *;
    `;
    const values = [nombre, descripcion, distrito, provincia, departamento, imagenes];
    const result = await pgPool.query(insertQuery, values);

    res.status(201).json({ message: 'Proyecto creado exitosamente', proyecto: result.rows[0] });
  } catch (err) {
    console.error('Error al crear proyecto:', err);
    res.status(500).json({ message: 'Error al crear el proyecto', detalle: err.message });
  }
};

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

// Editar un proyecto en PostgreSQL (actualiza updated_at en cada POST/PUT)
exports.editarProyecto = async (req, res) => {
  try {
    // Verifica que el token sea de desarrollador (devId en el token)
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
    if (!decoded.devId) {
      return res.status(403).json({ message: 'No autorizado: solo desarrolladores pueden editar proyectos.' });
    }

    const proyecto_id = req.params.id;
    const { nombre, descripcion, distrito, provincia, departamento } = req.body;

    // Buscar el proyecto en PostgreSQL
    const selectQuery = 'SELECT * FROM proyectos_vh WHERE proyecto_id = $1';
    const selectResult = await pgPool.query(selectQuery, [proyecto_id]);
    if (selectResult.rows.length === 0) {
      return res.status(404).json({ message: 'Proyecto no encontrado.' });
    }

    // Procesar imagen si se envía
    let imagenes = selectResult.rows[0].imagenes;
    if (req.file) {
      const file = req.file;
      const webpFileName = path.basename(file.originalname, path.extname(file.originalname)) + '.webp';
      const webpFullPath = path.join(path.dirname(file.path), webpFileName);

      await sharp(file.path)
        .webp({ quality: 80 })
        .toFile(webpFullPath);

      // Sube el archivo webp optimizado a S3
      const BUCKET_NAME = process.env.AWS_BUCKET_NAME;
      const result = await uploadFileToS3(webpFullPath, webpFileName, BUCKET_NAME);

      // Borra los archivos temporales
      fs.unlinkSync(file.path);
      fs.unlinkSync(webpFullPath);

      imagenes = webpFileName;
    }

    // Construir el query de actualización dinámicamente, siempre actualiza updated_at
    const fields = [];
    const values = [];
    let idx = 1;
    if (nombre !== undefined) { fields.push(`nombre = $${idx++}`); values.push(nombre); }
    if (descripcion !== undefined) { fields.push(`descripcion = $${idx++}`); values.push(descripcion); }
    if (distrito !== undefined) { fields.push(`distrito = $${idx++}`); values.push(distrito); }
    if (provincia !== undefined) { fields.push(`provincia = $${idx++}`); values.push(provincia); }
    if (departamento !== undefined) { fields.push(`departamento = $${idx++}`); values.push(departamento); }
    if (imagenes !== undefined) { fields.push(`imagenes = $${idx++}`); values.push(imagenes); }
    // Siempre actualiza updated_at
    fields.push(`updated_at = NOW()`);

    values.push(proyecto_id);

    const updateQuery = `
      UPDATE proyectos_vh
      SET ${fields.join(', ')}
      WHERE proyecto_id = $${values.length}
      RETURNING *;
    `;
    const updateResult = await pgPool.query(updateQuery, values);

    res.json({ message: 'Proyecto actualizado correctamente', proyecto: updateResult.rows[0] });
  } catch (err) {
    console.error('Error al editar proyecto:', err);
    res.status(500).json({ message: 'Error al editar el proyecto', detalle: err.message });
  }
};

// Eliminar un proyecto (solo desarrollador)
exports.eliminarProyecto = async (req, res) => {
  try {
    // Validar token de desarrollador
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
    if (!decoded.devId) {
      return res.status(403).json({ message: 'No autorizado: solo desarrolladores pueden eliminar proyectos.' });
    }

    const proyecto_id = req.params.id;

    // Buscar el proyecto en PostgreSQL
    const selectQuery = 'SELECT * FROM proyectos_vh WHERE proyecto_id = $1';
    const selectResult = await pgPool.query(selectQuery, [proyecto_id]);
    if (selectResult.rows.length === 0) {
      return res.status(404).json({ message: 'Proyecto no encontrado.' });
    }
    const proyecto = selectResult.rows[0];

    // Eliminar imagen de S3 si existe
    if (proyecto.imagenes) {
      const BUCKET_NAME = process.env.AWS_BUCKET_NAME;
      const s3 = new S3Client({ region: process.env.AWS_REGION });
      try {
        await s3.send(new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: proyecto.imagenes
        }));
      } catch (err) {
        // Solo loguea, no detiene el flujo
        console.warn('No se pudo eliminar la imagen de S3:', err.message);
      }
    }

    // Eliminar el proyecto de la base de datos
    const deleteQuery = 'DELETE FROM proyectos_vh WHERE proyecto_id = $1';
    await pgPool.query(deleteQuery, [proyecto_id]);

    res.json({ message: 'Proyecto eliminado correctamente.' });
  } catch (err) {
    console.error('Error al eliminar proyecto:', err);
    res.status(500).json({ message: 'Error al eliminar el proyecto', detalle: err.message });
  }
};

// Obtener administradores de un proyecto (solo desarrollador)
exports.getAdministradoresByProyecto = async (req, res) => {
  try {
    // Validar token de desarrollador
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
    if (!decoded.devId) {
      return res.status(403).json({ message: 'No autorizado: solo desarrolladores pueden consultar administradores.' });
    }

    const { proyectoId } = req.params;
    if (!proyectoId) {
      return res.status(400).json({ message: 'proyectoId es requerido.' });
    }

    const query = `
      SELECT a.nombres, a.apellidos, a.usuario, a.email, a.ubicacion
      FROM administradores a
      INNER JOIN p_c p ON p.cliente_id = a.cliente_id
      INNER JOIN proyectos_vh pv ON pv.proyecto_id = p.proyecto_id
      WHERE pv.proyecto_id = $1
    `;
    const result = await pgPool.query(query, [proyectoId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener todos los administradores (solo desarrollador)
exports.getAllAdministradoresWithProyecto = async (req, res) => {
  try {
    // Validar token de desarrollador
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
    if (!decoded.devId) {
      return res.status(403).json({ message: 'No autorizado: solo desarrolladores pueden consultar administradores.' });
    }

    // Solo los campos solicitados
    const query = `
      SELECT nombres, apellidos, usuario, email, ubicacion
      FROM administradores
    `;
    const result = await pgPool.query(query);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

