const express = require('express');
const router = express.Router();
const userController = require('../controllers/UserController/UserController');
const {authenticateToken} = require('../controllers/authController/authMiddleware');
const categoryController = require('../controllers/CategoryController/CategoryController');
const unidadController = require('../controllers/UnidadController/UnidadController');
const productController = require('../controllers/ProductController/ProductController');
const ClientController = require('../controllers/ClientController/ClientController');
const ventaController = require('../controllers/VentasController/VentasController');
const DevController = require('../controllers/DevController/DevController');
const ProyectoController = require('../controllers/ProyectoController/ProyectoController');
const multer = require('multer');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const fs = require('fs');
const { uploadFileToS3 } = require('../utils/s3Upload');
const PagosController = require('../controllers/PagosController');
const passport = require('passport');
const comprasController = require('../controllers/comprasController/comprasController');
const sharp = require('sharp');

// Configuración de multer para almacenamiento temporal local
const upload = multer({ dest: os.tmpdir() });

// Endpoint único para subir imágenes a S3 (optimización a webp)
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    console.log('Llega petición de upload');
    console.log('Archivo recibido:', req.file);

    const file = req.file;
    if (!file) {
      console.error('No se subió ningún archivo');
      return res.status(400).json({ error: 'No se subió ningún archivo' });
    }

    // Convierte la imagen a webp usando sharp
    const webpFileName = path.basename(file.originalname, path.extname(file.originalname)) + '.webp';
    const webpFullPath = path.join(path.dirname(file.path), webpFileName);

    await sharp(file.path)
      .webp({ quality: 80 })
      .toFile(webpFullPath);

    console.log('Archivo optimizado generado:', webpFullPath);

    // Sube el archivo webp optimizado a S3
    const BUCKET_NAME = process.env.AWS_BUCKET_NAME;
    try {
      const result = await uploadFileToS3(webpFullPath, webpFileName, BUCKET_NAME);
      console.log('Resultado de subida a S3:', result);

      // Borra los archivos temporales
      fs.unlinkSync(file.path);
      fs.unlinkSync(webpFullPath);

      res.json({ imageUrl: result.Location });
    } catch (s3Error) {
      console.error('Error subiendo a S3:', s3Error);
      res.status(500).json({ error: 'Error al subir la imagen a S3', detalle: s3Error.message });
    }
  } catch (err) {
    console.error('Error en upload:', err);
    res.status(500).json({ error: 'Error al procesar o subir la imagen a S3', detalle: err.message });
  }
});

//DESARROLLADORES
router.post('/dev/register', DevController.registerDev);
router.post('/dev/login', DevController.loginDev);
router.post('/dev/logout', DevController.logoutDev);
router.get('/dev', authenticateToken, DevController.getDevToken);
router.get('/admin/:clienteId/proyecto', authenticateToken, ProyectoController.getProyectoByAdmin);
router.delete('/admin/:clienteId', authenticateToken, DevController.deleteAdmin);

//proyectos
router.get('/proyectos', ProyectoController.getProyectos);
router.get('/proyectos/search', ProyectoController.searchProyectos);
router.get('/proyectos/:id', authenticateToken, ProyectoController.getProyectoById);
router.post('/proyectos', authenticateToken, upload.single('imagen'), ProyectoController.createProyecto);
router.put('/proyectos/:id', authenticateToken, upload.single('imagen'), ProyectoController.editarProyecto);
router.delete('/proyectos/:id', authenticateToken, ProyectoController.eliminarProyecto);
router.get('/proyectos/:proyectoId/administradores', authenticateToken, ProyectoController.getAdministradoresByProyecto);
router.get('/proyectos-administradores', authenticateToken, ProyectoController.getAllAdministradoresWithProyecto);
// Nuevo endpoint: agregar cliente a proyecto (solo desarrollador)
router.post('/proyectos/agregar-cliente', authenticateToken, ProyectoController.agregarClienteAProyecto);
// Nuevo endpoint: eliminar cliente de proyecto (solo desarrollador)
router.delete('/proyectosr/eliminar-cliente', authenticateToken, ProyectoController.eliminarClienteDeProyecto);

//ADMINISTRADORES
//rutas publicas
router.post('/login', userController.login);
router.post('/logout', userController.logout);
router.get('/proyectos', userController.getAllProyectos);
//rutas protegidas
// Cambia aquí: solo un desarrollador puede registrar un administrador
router.post('/register', authenticateToken, DevController.registerAdmin);
router.get('/user/:id', authenticateToken, userController.getUserById);
router.get('/user', authenticateToken, userController.getUser);
router.get('/userp', authenticateToken, userController.getUserProject);
router.get('/users', authenticateToken, userController.getAllCustomers);
router.get('/clientespg', authenticateToken, userController.getAllClientesPG);

//CATEGORIAS
//rutas protegidas
router.get('/categories', categoryController.getAllCategories);
router.get('/categories/proyecto/:proyectoId', categoryController.getCategoriesByProyecto);
router.post('/categories', categoryController.createCategory);

//UNIDADES
router.get('/unidades', unidadController.getAllUnidades);

//PRODUCTOS
router.get('/products', productController.getProducts);
router.get('/products/:id', productController.getProductById);
router.get('/productsp', productController.getProductsByProyecto);
router.post('/products', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    // Procesa la imagen si se envía
    let imageUrl = null;
    if (req.file) {
      // Convierte la imagen a webp usando sharp
      const sharp = require('sharp');
      const file = req.file;
      const webpFileName = path.basename(file.originalname, path.extname(file.originalname)) + '.webp';
      const webpFullPath = path.join(path.dirname(file.path), webpFileName);

      await sharp(file.path)
        .webp({ quality: 80 })
        .toFile(webpFullPath);

      // Sube el archivo webp optimizado a S3
      const BUCKET_NAME = process.env.AWS_BUCKET_NAME;
      const { uploadFileToS3 } = require('../utils/s3Upload');
      const result = await uploadFileToS3(webpFullPath, webpFileName, BUCKET_NAME);

      // Borra los archivos temporales
      fs.unlinkSync(file.path);
      fs.unlinkSync(webpFullPath);

      imageUrl = result.Location;
    }

    // Agrega la URL de la imagen al body antes de llamar al controlador
    req.body.image = imageUrl;

    // Llama al controlador original
    await productController.addProduct(req, res);
  } catch (err) {
    console.error('Error en subida de imagen y creación de producto:', err);
    res.status(500).json({ error: 'Error al subir la imagen y crear el producto', detalle: err.message });
  }
});
router.get('/productsc/:categoryId', categoryController.getProductsByCategory);
router.put('/products/:id', authenticateToken, upload.single('image'), productController.updateProduct);
router.put('/products/:productId/project-details', authenticateToken, productController.addProjectDetailsForProduct);
router.put('/clientes/change-password-by-developer', authenticateToken, DevController.changePasswordByDeveloper);
router.get('/productsresumen', authenticateToken, productController.getProductsResumen);
router.get('/productsproyecto', authenticateToken, productController.getProductsByUserProject);
router.put('/products/:productId/updatestock', authenticateToken, productController.updateStockForProduct);
router.get('/productos/bajostock', authenticateToken, productController.getProductosBajoStock);
router.delete('/products/:id', authenticateToken, productController.deleteProductIfNoProyecto);

// PAGOS
router.post('/pagos/checkoutpro', PagosController.pagarConCheckoutPro);

// WEBHOOK Mercado Pago (debe aceptar POST)
router.post('/webhook', express.json({ type: '*/*' }), (req, res) => {
  console.log("[Webhook Mercado Pago] Notificación recibida:", req.body);
  // Aquí puedes agregar lógica para procesar el pago, actualizar base de datos, etc.
  res.status(200).send("OK");
});

//CLIENTES
router.post('/clientes/register', ClientController.register);
router.post('/clientes/login', ClientController.login);
router.get('/clientes/customerData', authenticateToken, ClientController.getCustomerData);
router.post('/clientes/logout', authenticateToken, ClientController.logout);
router.get('/clientes/dni/:dni', userController.getClienteByDni);
router.put('/clientes/update', authenticateToken, ClientController.updateCustomerData);
router.get('/clientespg/historialcompras', authenticateToken, ClientController.getHistorialComprasClienteAdmin);

// GOOGLE AUTH
router.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);
router.get('/auth/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: '/login' }),
    async (req, res) => {
        // Buscar el usuario en MongoDB por email para obtener el _id de Mongo
        const email = req.user.customer.email;
        const nombres = req.user.customer.nombres;
        const Email = require('../models/UserModel/UserModel');
        const mongoUser = await Email.findOne({ email });
        const userId = mongoUser ? mongoUser._id : undefined;

        const jwt = require('jsonwebtoken');
        const { jwtSecret } = require('../config/auth.config');
        const token = jwt.sign({ userId, email, nombres }, jwtSecret);

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? "none" : "lax"
        });
        res.redirect('/');
    }
);

//VENTAS
router.post('/ventas', authenticateToken, ventaController.generarVenta);
router.post('/ventas/web', authenticateToken, ventaController.generarVentaWeb);
router.get('/ventas', authenticateToken, ventaController.getAllVentas);
router.get('/ganancias/total', authenticateToken, ventaController.getTotalGanancias);
router.get('/productos/masvendidos', authenticateToken, ventaController.getProductosMasVendidos);
router.put('/ventas/:ventaId/estado', authenticateToken, ventaController.actualizarEstadoVenta);

// CARRITO DE COMPRAS (protegidas)
router.post('/carrito', authenticateToken, comprasController.createCarrito);
router.put('/carrito', authenticateToken, comprasController.updateCarrito);
router.get('/carrito', authenticateToken, comprasController.getCarrito);
router.get('/compras/historial', authenticateToken, comprasController.getHistorialComprasCliente);

// El endpoint para subir imágenes es /api/upload (POST)

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    console.log('Llega petición de upload');
    console.log('Archivo recibido:', req.file);

    const file = req.file;
    if (!file) {
      console.error('No se subió ningún archivo');
      return res.status(400).json({ error: 'No se subió ningún archivo' });
    }

    // Convierte la imagen a webp usando sharp
    const webpFileName = path.basename(file.originalname, path.extname(file.originalname)) + '.webp';
    const webpFullPath = path.join(path.dirname(file.path), webpFileName);

    await sharp(file.path)
      .webp({ quality: 80 })
      .toFile(webpFullPath);

    console.log('Archivo optimizado generado:', webpFullPath);

    // Sube el archivo webp optimizado a S3
    const BUCKET_NAME = process.env.AWS_BUCKET_NAME;
    try {
      const result = await uploadFileToS3(webpFullPath, webpFileName, BUCKET_NAME);
      console.log('Resultado de subida a S3:', result);

      // Borra los archivos temporales
      fs.unlinkSync(file.path);
      fs.unlinkSync(webpFullPath);

      res.json({ imageUrl: result.Location });
    } catch (s3Error) {
      console.error('Error subiendo a S3:', s3Error);
      res.status(500).json({ error: 'Error al subir la imagen a S3', detalle: s3Error.message });
    }
  } catch (err) {
    console.error('Error en upload:', err);
    res.status(500).json({ error: 'Error al procesar o subir la imagen a S3', detalle: err.message });
  }
});

module.exports = router