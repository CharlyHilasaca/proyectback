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
