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

//agregar una nueva categoria solo si hay una sesión iniciada
exports.addCategory = async (req, res) => {
    if (!req.userId) {
        return res.status(401).json({ message: 'No autorizado. Inicie sesión.' });
    }
    try {
        const { name, description } = req.body;
        const newCategory = new Category({ name, description });
        await newCategory.save();
        res.status(201).json(newCategory);
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