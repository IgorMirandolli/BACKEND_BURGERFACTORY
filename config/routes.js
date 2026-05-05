const authApi = require('../api/auth/auth');
const verifyApi = require('../api/auth/verify');
const revalidateApi = require('../api/auth/revalidate');

function registerRoutes(app) {
  authApi(app);
  verifyApi(app);
  revalidateApi(app);

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });
}

module.exports = registerRoutes;
