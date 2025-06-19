const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { pgPool } = require('./db');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
    scope: ['profile', 'email']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const email = profile.emails[0].value;
        const name = profile.displayName;

        const checkQuery = `SELECT * FROM customer WHERE email = $1`;
        const checkResult = await pgPool.query(checkQuery, [email]);
        let customer;
        if (checkResult.rows.length === 0) {
            const insertQuery = `INSERT INTO customer (email, username) VALUES ($1, $2) RETURNING *;`;
            const insertResult = await pgPool.query(insertQuery, [email, name]);
            customer = insertResult.rows[0];
        } else {
            customer = checkResult.rows[0];
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