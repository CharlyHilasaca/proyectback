const Category = require('../../models/CategoryModel/CategoryModel')
const Product = require('../../models/ProductModel/ProductModel')

//obtener todas las categorias sin necesidad de tener la sesión iniciada
exports.getAllCategories = async (req, res) => {
    try {
        const categories = await Category.find();
        res.json(categories);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

//obtener una categoria por id
exports.getCategoryById = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) {
            return res.status(404).json({ message: 'Categoria no encontrada' });
        }
        res.json(category);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

//obtener producto por categoria
exports.getProductsByCategory = async (req, res) => {
    const { categoryId } = req.params;
    try {
        const products = await Product.find({ categoryIds: categoryId });
        res.json(products);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Obtener categorías asociadas a los productos de un proyecto específico
exports.getCategoriesByProyecto = async (req, res) => {
    const { proyectoId } = req.params;
    try {
        // Buscar todos los productos que tengan projectDetails con ese proyectoId
        const products = await Product.find({ "projectDetails.proyectoId": String(proyectoId) });
        // Obtener todos los categoryIds únicos de esos productos
        const categoryIdsSet = new Set();
        products.forEach(prod => {
            if (Array.isArray(prod.categoryIds)) {
                prod.categoryIds.forEach(cid => categoryIdsSet.add(cid.toString()));
            }
        });
        const categoryIds = Array.from(categoryIdsSet);
        // Buscar las categorías por esos IDs
        const categories = await Category.find({ _id: { $in: categoryIds } });
        res.json(categories);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Crear una nueva categoría
exports.createCategory = async (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name || !description) {
            return res.status(400).json({ message: "Nombre y descripción son requeridos" });
        }
        const category = new Category({ name, description });
        await category.save();
        res.status(201).json(category);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

