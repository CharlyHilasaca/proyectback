const Product = require('../../models/ProductModel/ProductModel');
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../../config/auth.config');
const Dev = require('../../models/DevModel/DevModel');
const { pgPool } = require('../../config/db');
const User = require('../../models/ClientModel/ClientModel');
const Categoria = require('../../models/CategoryModel/CategoryModel');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');

//obtener todos los productos
exports.getProducts = async (req, res) => {
    try {
        const products = await Product.find();
        res.json(products);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

exports.getProductById = async (req, res) => {
    try {
        const { id } = req.params;
        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ message: 'Producto no encontrado.' });
        }
        res.json(product);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Obtener todos los productos, o solo los del proyecto si se recibe proyecto_id como query param
exports.getProductsByProyecto = async (req, res) => {
    try {
        const { proyectoId, categoryId } = req.query;
        let filter = {};
        if (proyectoId && categoryId) {
            filter = {
                "projectDetails": { $elemMatch: { proyectoId } },
                categoryIds: categoryId
            };
        } else if (proyectoId) {
            filter = { "projectDetails": { $elemMatch: { proyectoId } } };
        } else if (categoryId) {
            filter = { categoryIds: categoryId };
        }
        const products = await Product.find(filter);
        res.json(products);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Agregar un nuevo producto, obteniendo categoryIds como arreglo
exports.addProduct = async (req, res) => {
    try {
        // Obtener el token de las cookies o del encabezado Authorization
        const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
        if (!token) {
            console.error('Token no proporcionado');
            return res.status(401).json({ message: 'No autorizado. Token no proporcionado.' });
        }

        // Verificar y decodificar el token
        let decoded;
        try {
            decoded = jwt.verify(token, jwtSecret);
        } catch (error) {
            console.error('Token inválido o expirado:', error);
            return res.status(401).json({ message: 'Token inválido o expirado.' });
        }

        // Obtener el desarrollador autenticado
        const dev = await Dev.findById(decoded.devId);
        if (!dev) {
            console.error('Desarrollador no encontrado:', decoded.devId);
            return res.status(404).json({ message: 'Desarrollador no encontrado.' });
        }

        // Extraer los datos del cuerpo de la solicitud
        let { name, marca, categoryName, image } = req.body; // description eliminado

        // Si la imagen viene de un upload (ejemplo: multer-s3), usa req.file.location
        if (req.file && req.file.location) {
            image = req.file.location;
        }

        // Validar campos requeridos (description y marca pueden ser nulos o vacíos)
        if (!name || !categoryName || !image) {
            console.error('Faltan campos requeridos:', { name, categoryName, image });
            return res.status(400).json({ message: 'Faltan campos requeridos.' });
        }

        // Buscar la categoría por nombre
        let category = null;
        if (categoryName) {
            category = await Categoria.findOne({ name: categoryName.trim() });
            if (!category) {
                console.error('Categoría no encontrada:', categoryName);
                return res.status(400).json({ message: 'Categoría no encontrada.' });
            }
        } else {
            console.error('El nombre de la categoría es obligatorio');
            return res.status(400).json({ message: 'El nombre de la categoría es obligatorio.' });
        }

        // Guardar el producto con el nombre de la imagen recibido en el body o la url de S3
        const newProduct = new Product({
            name,
            marca: marca || null,
            image,
            categoryIds: [category._id]
        });

        // Guardar el producto en la base de datos
        await newProduct.save();

        res.status(201).json({ message: 'Producto agregado exitosamente.', product: newProduct });
    } catch (error) {
        // Log del error para depuración
        console.error('Error en addProduct:', error, error.stack);
        res.status(500).json({ message: error.message, stack: error.stack });
    }
};

exports.updateProduct = async (req, res) => {
    try {
        const { id } = req.params; // ID del producto a actualizar
        const { name, marca, description, categoryIds } = req.body;

        // Obtener el token de las cookies o del encabezado Authorization
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

        // Obtener el desarrollador autenticado
        const dev = await Dev.findById(decoded.devId);
        if (!dev) {
            return res.status(404).json({ message: 'Desarrollador no encontrado.' });
        }

        // Verificar si el producto existe
        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ message: 'Producto no encontrado.' });
        }

        // Verificar si el desarrollador tiene permisos (puedes personalizar esta lógica)
        // Por ejemplo, si el producto tiene un campo `createdBy` que almacena el ID del desarrollador
        if (product.createdBy && product.createdBy.toString() !== dev._id.toString()) {
            return res.status(403).json({ message: 'No autorizado: no tienes permisos para editar este producto.' });
        }

        // categoryIds puede venir como string JSON
        let parsedCategoryIds = categoryIds;
        if (typeof categoryIds === "string") {
            try {
                parsedCategoryIds = JSON.parse(categoryIds);
            } catch {
                parsedCategoryIds = [];
            }
        }

        // Manejar la imagen si se sube un archivo
        let image = req.file ? req.file.filename : undefined;

        // Actualizar el producto
        const updatedProduct = await Product.findByIdAndUpdate(
            id,
            {
                name,
                marca,
                description,
                image,
                categoryIds: parsedCategoryIds,
            },
            { new: true } // Retorna el documento actualizado
        );

        res.status(200).json({ message: 'Producto actualizado exitosamente.', product: updatedProduct });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}; //cambios mas adelante

//agregar producto a tienda o actualizar detalles por proyecto
exports.addProjectDetailsForProduct = async (req, res) => {
    try {
        const { productId } = req.params;
        let { purchasePrice, salePrice, unidad, stock, descripcion } = req.body; // <-- agrega descripcion

        // Validar campos requeridos
        if (
            purchasePrice === undefined || salePrice === undefined ||
            !unidad || stock === undefined
        ) {
            console.error('Faltan campos requeridos:', { purchasePrice, salePrice, unidad, stock });
            return res.status(400).json({ message: 'Todos los campos son obligatorios.' });
        }

        // Convertir a número si es necesario
        purchasePrice = Number(purchasePrice);
        salePrice = Number(salePrice);
        stock = Number(stock);

        if (isNaN(purchasePrice) || isNaN(salePrice) || isNaN(stock)) {
            console.error('Precio o stock no son números:', { purchasePrice, salePrice, stock });
            return res.status(400).json({ message: 'Precio y stock deben ser números.' });
        }

        // Validar ObjectId de unidad
        const mongoose = require('mongoose');
        if (!mongoose.Types.ObjectId.isValid(unidad)) {
            console.error('Unidad no es un ObjectId válido:', unidad);
            return res.status(400).json({ message: 'Unidad no válida.' });
        }

        // Obtener el token de las cookies o del encabezado Authorization
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

        // Obtener el usuario autenticado desde MongoDB
        const mongoUser = await User.findById(decoded.userId);
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

        const proyectoId = projectResult.rows[0].proyecto_id;

        // Verificar si el producto existe en MongoDB
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ message: 'Producto no encontrado.' });
        }

        // Buscar si ya existe un subdocumento con el proyectoId
        const existingProjectDetail = product.projectDetails.find(
            (detail) => detail.proyectoId === proyectoId
        );

        if (existingProjectDetail) {
            // Actualizar los campos del subdocumento existente
            existingProjectDetail.purchasePrice = purchasePrice;
            existingProjectDetail.salePrice = salePrice;
            existingProjectDetail.unidad = unidad;
            existingProjectDetail.stock = stock;
            existingProjectDetail.stockmayor = stock; // Actualizar stockmayor igual que stock
            if (descripcion !== undefined) {
                existingProjectDetail.descripcion = descripcion; // <-- agrega descripción por proyecto
            }
        } else {
            // Agregar un nuevo subdocumento
            product.projectDetails.push({
                proyectoId,
                purchasePrice,
                salePrice,
                unidad,
                stock,
                stockmayor: stock, // Asignar stockmayor igual que stock
                descripcion // <-- agrega descripción por proyecto
            });
        }

        // Guardar los cambios en la base de datos
        await product.save();

        res.status(200).json({ message: 'Información del proyecto actualizada exitosamente.', product });
    } catch (error) {
        console.error('Error en addProjectDetailsForProduct:', error, error.stack);
        res.status(500).json({ message: error.message, stack: error.stack });
    }
};

// Obtener productos resumen con estado "Producto en tienda" según el proyecto del usuario autenticado
exports.getProductsResumen = async (req, res) => {
    try {
        // Obtener el token de las cookies o del encabezado Authorization
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

        // Obtener el usuario autenticado desde MongoDB
        const mongoUser = await User.findById(decoded.userId);
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

        const proyectoId = projectResult.rows[0].proyecto_id;

        // Obtener todos los productos
        const products = await Product.find();

        // Mapear productos con la información requerida y el estado
        const productosResumen = products.map(prod => {
            const enTienda = prod.projectDetails?.some(
                (pd) => String(pd.proyectoId) === String(proyectoId)
            );
            return {
                _id: prod._id,
                name: prod.name,
                marca: prod.marca,
                image: prod.image,
                estado: enTienda ? "Producto en tienda" : "Agregar a Tienda"
            };
        });

        res.json(productosResumen);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Obtener todos los productos que pertenecen al proyecto del usuario autenticado
exports.getProductsByUserProject = async (req, res) => {
    try {
        // Obtener el token de las cookies o del encabezado Authorization
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

        // Obtener el usuario autenticado desde MongoDB
        const mongoUser = await User.findById(decoded.userId);
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

        const proyectoId = projectResult.rows[0].proyecto_id;

        // Buscar productos que tengan projectDetails con ese proyectoId
        const products = await Product.find({
            projectDetails: { $elemMatch: { proyectoId: String(proyectoId) } }
        });

        res.json(products);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Actualizar el stock de un producto para el proyecto del usuario autenticado
exports.updateStockForProduct = async (req, res) => {
    try {
        const { productId } = req.params;
        let { stockToAdd } = req.body;
        stockToAdd = Number(stockToAdd);
        if (isNaN(stockToAdd)) {
            return res.status(400).json({ message: 'La cantidad de stock a agregar debe ser un número.' });
        }

        // Obtener el token de las cookies o del encabezado Authorization
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

        // Obtener el usuario autenticado desde MongoDB
        const mongoUser = await User.findById(decoded.userId);
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

        const proyectoId = projectResult.rows[0].proyecto_id;

        // Buscar el producto
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ message: 'Producto no encontrado.' });
        }

        // Buscar el subdocumento del proyecto
        const projectDetail = product.projectDetails.find(
            (detail) => String(detail.proyectoId).trim() === String(proyectoId).trim()
        );
        if (!projectDetail) {
            return res.status(404).json({ message: 'No existe información de stock para este proyecto en el producto.' });
        }

        // Sumar el stock recibido solo al campo stock y actualizar ambos campos con el total
        const nuevoStock = Number(projectDetail.stock || 0) + stockToAdd;
        projectDetail.stock = nuevoStock;
        projectDetail.stockmayor = nuevoStock;

        await product.save();

        res.status(200).json({ message: 'Stock actualizado correctamente.', product });
    } catch (error) {
        console.error('Error en updateStockForProduct:', error, error.stack);
        res.status(500).json({ message: error.message, stack: error.stack });
    }
};

// Obtener productos de bajo stock para el proyecto del usuario autenticado
exports.getProductosBajoStock = async (req, res) => {
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
        const mongoUser = await User.findById(decoded.userId);
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
        const proyectoId = projectResult.rows[0].proyecto_id;
        // Buscar productos que tengan projectDetails con ese proyectoId
        const productos = await Product.find({
            projectDetails: { $elemMatch: { proyectoId: String(proyectoId) } }
        });
        // Filtrar y mapear solo los detalles del proyecto correspondiente con bajo stock
        const productosBajoStock = productos.map(prod => {
            const detalle = prod.projectDetails.find(
                pd => String(pd.proyectoId) === String(proyectoId) &&
                    typeof pd.stock === 'number' && typeof pd.stockmayor === 'number' &&
                    pd.stockmayor > 0 && pd.stock < pd.stockmayor * 0.15
            );
            if (!detalle) return null;
            return {
                _id: prod._id,
                name: prod.name,
                marca: prod.marca,
                image: prod.image,
                stock: detalle.stock,
                stockmayor: detalle.stockmayor,
            };
        }).filter(Boolean);
        res.json(productosBajoStock);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Eliminar un producto solo si no tiene ningún proyectoId asignado (solo desarrollador)
exports.deleteProductIfNoProyecto = async (req, res) => {
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
            return res.status(403).json({ message: 'No autorizado: solo desarrolladores pueden eliminar productos.' });
        }

        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ message: 'ID de producto requerido.' });
        }

        // Buscar el producto
        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ message: 'Producto no encontrado.' });
        }

        // Verificar que no tenga ningún proyectoId asignado
        if (Array.isArray(product.projectDetails) && product.projectDetails.length > 0) {
            return res.status(400).json({ message: 'No se puede eliminar: el producto tiene proyectos asignados.' });
        }

        // Eliminar imagen de AWS S3 si existe
        if (product.image) {
            try {
                const BUCKET_NAME = process.env.AWS_BUCKET_NAME;
                // Extrae solo el nombre del archivo si es una ruta local o S3
                let key = product.image;
                // Si la imagen es una URL completa, extrae el nombre del archivo
                if (key.startsWith("http")) {
                    const url = new URL(key);
                    key = url.pathname.startsWith("/uploads/")
                        ? url.pathname.replace("/uploads/", "")
                        : url.pathname.replace(/^\//, "");
                } else if (key.startsWith("/uploads/")) {
                    key = key.replace("/uploads/", "");
                }
                const s3 = new S3Client({ region: process.env.AWS_REGION });
                await s3.send(new DeleteObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: key
                }));
            } catch (err) {
                // Solo loguea, no detiene el flujo
                console.warn('No se pudo eliminar la imagen de S3:', err.message);
            }
        }

        await Product.findByIdAndDelete(id);

        res.json({ message: 'Producto eliminado correctamente.' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

