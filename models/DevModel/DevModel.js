const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// modelo para desarrolladores
const devSchema = new mongoose.Schema({
    username: { 
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
devSchema.pre('save', async function(next) {
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
devSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Dev', devSchema);