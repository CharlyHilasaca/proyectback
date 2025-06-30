const mongoose = require('mongoose');

// modelo para generar ventas con varios productos
const ventaSchema = new mongoose.Schema({
    nro: {
        type: Number,
        required: true
    },
    nfac: {
        type: String,
        trim: true,
        required: true
    },
    cliente: {
        type: Number,
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
    proyecto_id: {
        type: String,
        required: true,
        trim: true
    },
    estado: {
        type: String,
        enum: ['pendiente', 'pagado', 'para entrega', 'entregado', 'cancelado'],
        default: 'pendiente'
    },
    tipoPago: {
        type: String,
        required: false
    },
    origen: {
        type: String,
        enum: ['web', 'tienda'],
        default: 'tienda'
    }
}, { timestamps: true });

module.exports = mongoose.model('ventas', ventaSchema);