require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { connectMongoDB, testPgConnection } = require('./config/db');
const rutas = require('./routes/routes')
require('./config/passport');
const session = require('express-session');
const passport = require('passport');

const app = express();

// Configuración de la sesión
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: true,
    saveUninitialized: true,
    cookie: { secure: true }
}));

// Inicializar passport
app.use(passport.initialize());
app.use(passport.session());

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Rutas
app.use('/api', rutas);

app.get('/profile', (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/login');
    }
    res.json(req.user);
});

app.get('/logout', (req, res) => {
    req.logout();
    res.redirect('/');
});


// Iniciar conexiones a bases de datos
const startDBConnections = async () => {
  await connectMongoDB();
  await testPgConnection();
};

module.exports = {
  app,
  startDBConnections
};

module.exports = {
  app,
  startDBConnections
};

