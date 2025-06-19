//MongoDB Controller
const Email = require('../../models/UserModel/UserModel');
const jwt = require('jsonwebtoken');
const {jwtSecret} = require('../../config/auth.config');
//PostgresSQL Controller
const { pgPool } = require('../../config/db');

//registrar un cliente general (para todas las tiendas)
exports.register = async (req, res) => {
    try {
        const {
            email,
            password,
        } = req.body;

        const checkQuery = `SELECT * FROM customer WHERE email = $1`;
        const checkValues = [email];
        const checkResult = await pgPool.query(checkQuery, checkValues);
        if (checkResult.rows.length > 0) {
            return res.status(400).json({ message: 'User already exists in PostgreSQL' });
        }

        const insertQuery = `
            INSERT INTO customer (email)
            VALUES ($1)
            RETURNING *;
        `;
        const insertValues = [email];
        const insertResult = await pgPool.query(insertQuery, insertValues);

        const existingUser = await Email.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists in MongoDB' });
        }
        const user = new Email({ email, password }); // <-- NO hashees aquí
        await user.save();

        const token = jwt.sign({ userId: user._id }, jwtSecret);

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? "none" : "lax"
        });

        res.status(201).json({
            message: 'User registered successfully',
            token,
            email,
            postgres: insertResult.rows[0]
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

//iniciar sesion
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validación básica
        if (!email || !password) {
            return res.status(400).json({ message: 'Email y contraseña son requeridos' });
        }

        const user = await Email.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: 'Credenciales invalidas' });
        }

        // Verifica la contraseña
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Credenciales invalidas' });
        }

        const token = jwt.sign({ userId: user._id }, jwtSecret);
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production'
        });

        res.json({
            message: 'Inicio de sesion exitoso',
            token,
            email
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

//obtener datos de la tabla customer por el email obtenido de la sesion
exports.getCustomerData = async (req, res) => {
    try {
        // Usa directamente el email del token
        const emailToSearch = req.email;

        if (!emailToSearch) {
            return res.status(404).json({ message: 'No se pudo determinar el email del usuario' });
        }

        const query = 'SELECT * FROM customer WHERE email = $1';
        const values = [emailToSearch];
        const result = await pgPool.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Cliente no encontrado en PostgreSQL' });
        }

        res.json({ customer: result.rows[0] });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// cerrar sesion
exports.logout = (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Sesión cerrada exitosamente' });
};

