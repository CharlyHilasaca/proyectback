const mongoose = require('mongoose');

// Subdocumento para almacenar información específica por proyecto
const projectSpecificSchema = new mongoose.Schema({
    proyectoId: {
        type: String,
    },
    purchasePrice: { // Precio de compra
        type: Number,
        min: 0
    },
    salePrice: { // Precio de venta
        type: Number,
        min: 0
    },
    unidad: { // Unidad específica para el proyecto
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Unidad',
    },
    stock: { // Stock específico para el proyecto
        type: Number,
        min: 0
    },
    stockmayor: { // Stock mayorista específico para el proyecto
        type: Number,
        min: 0
    }
}, { _id: false }); // No se necesita un ID para cada subdocumento

// Modelo para los productos del proyecto
const productSchema = new mongoose.Schema({
    name: { 
        type: String,
        required: true,
        trim: true
    },
    marca: {
        type: String,
        trim: true
    },
    description: { 
        type: String,
        trim: true
    },
    image: { 
        type: String
    },
    categoryIds: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Categoria',
        required: true
    }],
    projectDetails: [projectSpecificSchema]
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);