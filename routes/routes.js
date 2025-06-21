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

const uploadDir = path.join(__dirname, '../../frontend/public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../../frontend/public/uploads'));
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname); // O usa un nombre único
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
router.get('/dev/proyectos', authenticateToken, ProyectoController.getProyectos);
router.get('/proyectos/:id', authenticateToken, ProyectoController.getProyectoById);
router.get('/proyectos/imagen/:id', ProyectoController.getImagenProyecto);
router.post('/proyectos', authenticateToken, upload.single('imagen_p'), ProyectoController.addProyecto);
router.put('/proyectos/:id', authenticateToken, upload.single('imagen_p'), ProyectoController.updateProyecto);


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
router.get('/categories', authenticateToken, categoryController.getAllCategories);

//UNIDADES
router.get('/unidades', unidadController.getAllUnidades);

//PRODUCTOS
router.get('/products', productController.getProducts);
router.get('/productsp', productController.getProductsByProyecto);
router.post('/products', authenticateToken, productController.addProduct);
router.get('/productsc/:categoryId', categoryController.getProductsByCategory);
router.put('/products/:id', authenticateToken, upload.single('image'), productController.updateProduct);
router.put('/products/:productId/project-details',authenticateToken, productController.addProjectDetailsForProduct);
router.put('/clientes/change-password', authenticateToken, userController.changePassword);
router.put('/clientes/change-password-by-developer', authenticateToken, DevController.changePasswordByDeveloper);
router.get('/productsresumen', authenticateToken, productController.getProductsResumen);
router.get('/productsproyecto', authenticateToken, productController.getProductsByUserProject);

//CLIENTES
router.post('/clientes/register', ClientController.register);
router.post('/clientes/login', ClientController.login);
router.get('/clientes/customerData', authenticateToken, ClientController.getCustomerData);
router.post('/clientes/logout', authenticateToken, ClientController.logout);
router.get('/clientes/dni/:dni', authenticateToken, userController.getClienteByDni);

// GOOGLE AUTH
router.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);
router.get('/auth/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: '/login' }),
    (req, res) => {
        const email = req.user.customer.email;
        const userId = req.user.customer.id || req.user.customer._id;
        const nombres = req.user.customer.nombres;
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

module.exports = router