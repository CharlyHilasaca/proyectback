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

const uploadDir = path.join(__dirname, '../../frontend/public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../../frontend/public/uploads'));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, base + '-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage });

router.post('/upload', upload.single('file'), (req, res) => {
  res.json({ imageName: req.file.filename, imageUrl: `/uploads/${req.file.filename}` });
});

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
router.put('/products/:productId/project-details',authenticateToken, productController.addProjectDetailsForProduct);
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
router.get('/ventas', authenticateToken, ventaController.getAllVentas);
router.get('/ganancias/total', authenticateToken, ventaController.getTotalGanancias);
router.get('/productos/masvendidos', authenticateToken, ventaController.getProductosMasVendidos);

// CARRITO DE COMPRAS (protegidas)
router.post('/carrito', authenticateToken, comprasController.createCarrito);
router.put('/carrito', authenticateToken, comprasController.updateCarrito);
router.get('/carrito', authenticateToken, comprasController.getCarrito);

module.exports = router