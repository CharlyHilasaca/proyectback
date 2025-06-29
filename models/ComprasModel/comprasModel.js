const mongoose = require('mongoose');

const productoCarritoSchema = new mongoose.Schema({
  producto_id: {
    type: String,
    trim: true
  },
  name: String,
  marca: String,
  cantidad: {
    type: Number
  },
  precio: {
    type: Number
  },
  unidad: String
}, { _id: false });

const carritoSchema = new mongoose.Schema({
  cliente_id: {
    type: String,
    required: true,
    trim: true
  },
  proyecto_id: {
    type: String,
    required: true,
    trim: true
  },
  productos: [productoCarritoSchema],
  total: {
    type: Number
  },
  estado: {
    type: String,
    enum: ['pendiente', 'pagado', 'cancelado'],
    default: 'pendiente'
  }
}, { timestamps: true });

module.exports = mongoose.model('carritos', carritoSchema);
