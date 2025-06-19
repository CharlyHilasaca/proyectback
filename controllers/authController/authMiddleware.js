const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../../config/auth.config');

exports.authenticateToken = (req, res, next) => {
    const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }
    jwt.verify(token, jwtSecret, (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: 'Invalid token' });
        }
        // Asignar devId para rutas de desarrollador
        if (decoded.devId) {
            req.devId = decoded.devId;
        }
        // Mantener compatibilidad con rutas de usuario/cliente
        if (decoded.userId) {
            req.userId = decoded.userId;
        }
        if (decoded.email) {
            req.email = decoded.email;
        }
        next();
    });
};