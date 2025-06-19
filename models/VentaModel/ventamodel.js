const mongoose = require('mongoose');

// modelo para generar ventas con varios productos
const ventaSchema = new mongoose.Schema({
    nfac: {
        type: String,
        trim: true,
        required: true
    },
    cliente: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        trim: true
    },
    items: [{
        producto: {
            type: String,
            required: true,
            trim: true
        },
        precio: {
            type: Number,
            required: true
        },
        cantidad: {
            type: Number,
            required: true
        }
    }],
    totalVenta: {
        type: Number,
        required: true
    },
    fechaVenta: {
        type: Date,
        default: Date.now
    },
    proyecto_id: {
        type: String,
        required: true,
        trim: true
    }
}, { timestamps: true });

module.exports = mongoose.model('ventas', ventaSchema);