const { pool } = require('../../config/db');

function menuApi(app) {
  app.get('/api/menu', async (_req, res) => {
    try {
      const [rows] = await pool.query(
        `
          SELECT
            p.id,
            c.slug AS category,
            p.name,
            p.description,
            p.price,
            p.image_url AS imageUrl
          FROM products p
          INNER JOIN categories c ON c.id = p.category_id
          WHERE c.is_active = 1
          ORDER BY
            c.sort_order ASC,
            p.id ASC
        `
      );

      return res.status(200).json({ items: rows });
    } catch (_error) {
      return res.status(500).json({ message: 'Erro ao carregar cardapio.' });
    }
  });
}

module.exports = menuApi;
