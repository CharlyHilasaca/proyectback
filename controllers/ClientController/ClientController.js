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
            confirmPassword
        } = req.body;

        if (!email || !password || !confirmPassword) {
            return res.status(400).json({ message: 'Todos los campos son requeridos' });
        }
        if (password !== confirmPassword) {
            return res.status(400).json({ message: 'Las contraseñas no coinciden' });
        }

        const checkQuery = `SELECT * FROM clientes WHERE email = $1`;
        const checkValues = [email];
        const checkResult = await pgPool.query(checkQuery, checkValues);
        if (checkResult.rows.length > 0) {
            return res.status(400).json({ message: 'User already exists in PostgreSQL' });
        }

        const insertQuery = `
            INSERT INTO clientes (email)
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

//obtener datos de la tabla clientes por el email obtenido de la sesion
exports.getCustomerData = async (req, res) => {
    try {
        // Obtener el userId del token (middleware debe ponerlo en req.userId)
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ message: 'No autenticado' });
        }

        // Buscar el usuario en MongoDB por _id
        const mongoUser = await Email.findById(userId);
        if (!mongoUser) {
            return res.status(404).json({ message: 'Usuario no encontrado en MongoDB' });
        }
        const emailToSearch = mongoUser.email;

        if (!emailToSearch) {
            return res.status(404).json({ message: 'No se pudo determinar el email del usuario' });
        }

        // Buscar en PostgreSQL por email
        const query = 'SELECT * FROM clientes WHERE email = $1';
        const values = [emailToSearch];
        const result = await pgPool.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Cliente no encontrado en PostgreSQL' });
        }

        const customer = result.rows[0];

        // Si el cliente tiene proyecto_f, obtener los datos del proyecto
        let proyecto = null;
        if (customer.proyecto_f) {
            const proyectoQuery = 'SELECT * FROM proyectos_vh WHERE proyecto_id = $1';
            const proyectoResult = await pgPool.query(proyectoQuery, [customer.proyecto_f]);
            if (proyectoResult.rows.length > 0) {
                proyecto = proyectoResult.rows[0];
            }
        }

        res.json({ customer, email: emailToSearch, proyecto });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Actualizar datos del cliente autenticado (solo campos permitidos)
exports.updateCustomerData = async (req, res) => {
    try {
        // Obtener el userId del token (middleware debe ponerlo en req.userId)
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ message: 'No autenticado' });
        }

        // Buscar el usuario en MongoDB por _id para obtener el email
        const mongoUser = await Email.findById(userId);
        if (!mongoUser) {
            return res.status(404).json({ message: 'Usuario no encontrado en MongoDB' });
        }
        const emailToSearch = mongoUser.email;
        if (!emailToSearch) {
            return res.status(404).json({ message: 'No se pudo determinar el email del usuario' });
        }

        // Campos permitidos para actualizar
        const allowedFields = [
            "cellphone",
            "distrito",
            "provincia",
            "departamento",
            "ubicacion",
            "proyecto_f",
            "tipo",
            "username"
        ];

        // Construir dinámicamente el query y los valores
        const updates = [];
        const values = [];
        let idx = 1;
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates.push(`${field} = $${idx}`);
                values.push(req.body[field]);
                idx++;
            }
        }

        if (updates.length === 0) {
            return res.status(400).json({ message: "No hay campos válidos para actualizar" });
        }

        // Agregar el email como último parámetro para el WHERE
        values.push(emailToSearch);

        const updateQuery = `
            UPDATE clientes
            SET ${updates.join(", ")}
            WHERE email = $${values.length}
            RETURNING *;
        `;
        const result = await pgPool.query(updateQuery, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Cliente no encontrado o no actualizado" });
        }

        res.json({ message: "Datos actualizados correctamente", customer: result.rows[0] });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// cerrar sesion
exports.logout = (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Sesión cerrada exitosamente' });
};

