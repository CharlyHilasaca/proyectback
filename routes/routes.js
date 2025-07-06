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
const path = require('path');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/auth.config');
const fs = require('fs');
const comprasController = require('../controllers/comprasController/comprasController');
const PagosController = require('../controllers/PagosController');
const { uploadFileToS3 } = require('../utils/s3Upload');
const AWS = require('aws-sdk');
const multerS3 = require('multer-s3');
const { execFile } = require('child_process');
const os = require('os');
const tmp = require('tmp');
const imgController = require('../controllers/imgController/imgController');

// Configuración de AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});
const BUCKET_NAME = process.env.AWS_BUCKET_NAME;

// Configuración de multer-s3 para subir directamente a S3
const uploadS3 = multer({
  storage: multerS3({
    s3,
    bucket: BUCKET_NAME,
    acl: 'public-read',
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: function (req, file, cb) {
      const ext = path.extname(file.originalname);
      const base = path.basename(file.originalname, ext);
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, `uploads/${base}-${uniqueSuffix}${ext}`);
    }
  })
});

// Endpoint para subir imágenes a S3
router.post('/upload', uploadS3.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se subió ningún archivo' });
  }
  res.json({ imageUrl: req.file.location });
});

// Cambia el endpoint de subida para usar multer localmente, luego squoosh, luego S3
// Usa la instancia de multer ya declarada arriba
const upload = multer({ dest: os.tmpdir() });

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No se subió ningún archivo' });

    // Genera un archivo temporal para la imagen webp optimizada
    const webpPath = tmp.tmpNameSync({ postfix: '.webp' });

    // Ejecuta squoosh-cli para convertir y optimizar a webp
    await new Promise((resolve, reject) => {
      execFile(
        'squoosh-cli',
        [
          file.path,
          '--webp',
          '{"quality":80}',
          '-d',
          path.dirname(webpPath)
        ],
        (error, stdout, stderr) => {
          if (error) return reject(error);
          resolve();
        }
      );
    });

    // El archivo convertido tendrá el mismo nombre base pero con .webp
    const webpFileName = path.basename(file.path, path.extname(file.path)) + '.webp';
    const webpFullPath = path.join(path.dirname(webpPath), webpFileName);

    // Sube el archivo webp optimizado a S3
    const result = await uploadFileToS3(webpFullPath, webpFileName, BUCKET_NAME);

    // Borra los archivos temporales
    fs.unlinkSync(file.path);
    fs.unlinkSync(webpFullPath);

    res.json({ imageUrl: result.Location });
  } catch (err) {
    res.status(500).json({ error: 'Error al procesar o subir la imagen a S3' });
  }
});

// Endpoint para subir imágenes a S3 usando Squoosh (optimización a webp)
router.post('/upload', imgController.uploadImageOptimizedS3);

//DESARROLLADORES
router.post('/dev/register', DevController.registerDev);
router.post('/dev/login', DevController.loginDev);
router.post('/dev/logout', DevController.logoutDev);
router.get('/dev', authenticateToken, DevController.getDevToken);

//proyectos
router.get('/proyectos', ProyectoController.getProyectos);
router.get('/proyectos/search', ProyectoController.searchProyectos);
router.get('/proyectos/:id', authenticateToken, ProyectoController.getProyectoById);
router.post('/proyectos', authenticateToken, ProyectoController.createProyecto);


//ADMINISTRADORES
//rutas publicas
router.post('/login', userController.login);
router.post('/logout', userController.logout);
router.get('/proyectos', userController.getAllProyectos);
//rutas protegidas
router.post('/register', authenticateToken, userController.register);
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
router.post('/products', authenticateToken, productController.addProduct);
router.get('/productsc/:categoryId', categoryController.getProductsByCategory);
router.put('/products/:id', authenticateToken, upload.single('image'), productController.updateProduct);
router.put('/products/:productId/project-details', authenticateToken, productController.addProjectDetailsForProduct);
router.put('/clientes/change-password-by-developer', authenticateToken, DevController.changePasswordByDeveloper);
router.get('/productsresumen', authenticateToken, productController.getProductsResumen);
router.get('/productsproyecto', authenticateToken, productController.getProductsByUserProject);
router.put('/products/:productId/updatestock', authenticateToken, productController.updateStockForProduct);
router.get('/productos/bajostock', authenticateToken, productController.getProductosBajoStock);

// PAGOS
router.post('/pagos/checkoutpro', PagosController.pagarConCheckoutPro);

// WEBHOOK Mercado Pago (debe aceptar POST)
// Si usas body-parser, asegúrate de aceptar JSON y raw para Mercado Pago
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
// Recibe la imagen como un archivo en el campo 'file' del formulario multipart/form-data
// Ejemplo de uso desde Flutter:

/*
final request = http.MultipartRequest('POST', Uri.parse('https://TU_BACKEND_URL/api/upload'));
request.files.add(await http.MultipartFile.fromPath('file', imagen.path));
final response = await request.send();
*/

// En el backend, la API la recibe así:
router.post('/upload', upload.single('file'), async (req, res) => {
  // req.file contiene la imagen enviada desde Flutter
  // ...optimización y subida a S3...
  // Devuelve { imageUrl: "https://...s3.amazonaws.com/..." }
});

module.exports = router