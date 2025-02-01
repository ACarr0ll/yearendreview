function setRoutes(app) {
    const { getIndex } = require('../controllers/index');

    app.get('/', getIndex);
}

module.exports = setRoutes;