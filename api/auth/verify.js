const { authMiddleware, roleMiddleware } = require('../../config/middlewares');

function verifyApi(app) {
  app.get('/api/auth/verify', authMiddleware, (req, res) => {
    return res.status(200).json({ authenticated: true, user: req.user });
  });

  app.get('/api/auth/admin-only', authMiddleware, roleMiddleware('admin'), (_req, res) => {
    return res.status(200).json({ message: 'Acesso admin autorizado.' });
  });
}

module.exports = verifyApi;
