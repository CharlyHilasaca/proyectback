const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { pgPool } = require('./db');
const Email = require('../models/UserModel/UserModel');
const crypto = require('crypto');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
    scope: ['profile', 'email']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const email = profile.emails[0].value;
        const name = profile.displayName;

        const checkQuery = `SELECT * FROM clientes WHERE email = $1`;
        const checkResult = await pgPool.query(checkQuery, [email]);
        let customer;
        if (checkResult.rows.length === 0) {
            const insertQuery = `INSERT INTO clientes (email, username, tipo) VALUES ($1, $2, $3) RETURNING *;`;
            const insertResult = await pgPool.query(insertQuery, [email, name, 'google']);
            customer = insertResult.rows[0];
        } else {
            customer = checkResult.rows[0];
            // Si el tipo no es exactamente 'google', lo actualizamos a 'google'
            if (customer.tipo !== 'google') {
                await pgPool.query('UPDATE clientes SET tipo = $1 WHERE email = $2', ['google', email]);
                customer.tipo = 'google';
            }
        }

        // Crear usuario en MongoDB si no existe
        let mongoUser = await Email.findOne({ email });
        if (!mongoUser) {
            // Generar contraseña aleatoria segura
            const randomPassword = crypto.randomBytes(16).toString('hex');
            mongoUser = new Email({ email, password: randomPassword });
            await mongoUser.save();
        }

        return done(null, { customer, profile });
    } catch (error) {
        return done(error, null);
    }
}));

// Serializar y deserializar usuario para la sesión
passport.serializeUser((customer, done) => {
    done(null, customer.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const customer = await Customer.findById(id);
        done(null, customer);
    } catch (error) {
        done(error, null);
    }
});