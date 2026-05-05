const { authMiddleware } = require('../../config/middlewares');
const { generateToken } = require('../../config/passport');

function revalidateApi(app) {
  app.get('/api/auth/revalidate', authMiddleware, (req, res) => {
    const token = generateToken(req.user);
    return res.status(200).json({ token });
  });
}

module.exports = revalidateApi;
