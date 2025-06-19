const mongoose = require('mongoose');

//modelo para las categorias de un producto
const categoriaSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Categoria', categoriaSchema);