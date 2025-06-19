require('dotenv').config();
const { app, startDBConnections } = require('./app');
const PORT = process.env.PORT;

// Iniciar la aplicación
const startServer = async () => {
  try {
    await startDBConnections();
    
    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Error al iniciar la aplicación:', error);
    process.exit(1);
  }
};

startServer();