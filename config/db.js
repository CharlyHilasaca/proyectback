require('dotenv').config();
const mongoose = require('mongoose');
const { Pool } = require('pg');

// Conexión a MongoDB
const connectMongoDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Conexión exitosa a MongoDB');
  } catch (error) {
    console.error('❌ Error al conectar a MongoDB:', error.message);
    process.exit(1);
  }
};

// Conexión a PostgreSQL
const pgPool = new Pool({
  connectionString: process.env.PG_URL,
  max: parseInt(process.env.PG_POOL_MAX) || 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: { rejectUnauthorized: false }
});

// Función para probar conexión PostgreSQL
const testPgConnection = async () => {
  try {
    const client = await pgPool.connect();
    console.log('✅ PostgreSQL conectado correctamente');
    client.release();
  } catch (error) {
    console.error('❌ Error al conectar a PostgreSQL:', error.message);
    process.exit(1);
  }
};

module.exports = {
  connectMongoDB,
  pgPool,
  testPgConnection,
  mongoose
};