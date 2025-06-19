const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// modelo para los clientes
const clientSchema = new mongoose.Schema({
    email: { 
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    password: { 
        type: String,
        required: true,
        minlength: 6
    },
}, { timestamps: true });

// Hash password antes de guardar
clientSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Método para comparar contraseñas
clientSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Email', clientSchema);