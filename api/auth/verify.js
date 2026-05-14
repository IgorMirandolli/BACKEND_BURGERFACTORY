const { authMiddleware, roleMiddleware } = require('../../config/middlewares');
const { pool } = require('../../config/db');

function verifyApi(app) {
  app.get('/api/auth/verify', authMiddleware, async (req, res) => {
    try {
      const [rows] = await pool.query(
        'SELECT id, name, email, fone, avatar_url, role FROM users WHERE id = ? LIMIT 1',
        [req.user.id]
      );

      const dbUser = rows[0];
      if (!dbUser) {
        return res.status(404).json({ authenticated: false, message: 'Usuario nao encontrado.' });
      }

      return res.status(200).json({ authenticated: true, user: dbUser });
    } catch (_error) {
      return res.status(500).json({ authenticated: false, message: 'Erro ao validar usuario.' });
    }
  });

  app.get('/api/auth/admin-only', authMiddleware, roleMiddleware('admin'), (_req, res) => {
    return res.status(200).json({ message: 'Acesso admin autorizado.' });
  });
}

module.exports = verifyApi;
