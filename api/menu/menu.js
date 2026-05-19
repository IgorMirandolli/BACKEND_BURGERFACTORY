const { pool } = require('../../config/db');

function menuApi(app) {
  app.get('/api/menu', async (_req, res) => {
    try {
      const [rows] = await pool.query(
        `
          SELECT
            p.id,
            c.id AS categoryId,
            c.slug AS category,
            p.name,
            p.description,
            p.price,
            p.display_order AS displayOrder,
            p.image_url AS imageUrl
          FROM products p
          INNER JOIN categories c ON c.id = p.category_id
          WHERE c.is_active = 1
            AND p.is_available = 1
          ORDER BY
            c.sort_order ASC,
            p.display_order ASC,
            p.id ASC
        `
      );

      const items = rows.map((item) => {
        const imagePath = item.imageUrl || '';
        const normalizedImageUrl = imagePath
          ? imagePath.startsWith('/')
            ? imagePath
            : `/${imagePath}`
          : '';

        return {
          ...item,
          displayOrder: Number(item.displayOrder || 0),
          imageUrl: normalizedImageUrl,
        };
      });

      return res.status(200).json({ items });
    } catch (_error) {
      return res.status(500).json({ message: 'Erro ao carregar cardapio.' });
    }
  });
}

module.exports = menuApi;
