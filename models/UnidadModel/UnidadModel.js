const mongoose = require('mongoose');

//modelo para las unidades del proyecto
const unidadSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    abbreviation: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    description: {
        type: String,
        required: false,
        trim: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Unidad', unidadSchema);