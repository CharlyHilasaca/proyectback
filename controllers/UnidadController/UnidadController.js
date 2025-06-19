const Unidad = require('../../models/UnidadModel/UnidadModel');

//obtener todas las unidades sin necesidad de tener la sesión iniciada
exports.getAllUnidades = async (req, res) => {
    try {
        const unidades = await Unidad.find();
        res.json(unidades);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

//agregar una nueva unidad solo si hay una sesión iniciada
exports.addUnidad = async (req, res) => {
    if (!req.userId) {
        return res.status(401).json({ message: 'No autorizado. Inicie sesión.' });
    }
    try {
        const { name, abbreviation, description } = req.body;
        const newUnidad = new Unidad({ name, abbreviation, description });
        await newUnidad.save();
        res.status(201).json(newUnidad);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};