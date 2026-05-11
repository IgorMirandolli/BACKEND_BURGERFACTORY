const jwt = require('jsonwebtoken');
const { pool } = require('../../config/db');

function getUserIdFromAuthHeader(req) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.id || null;
  } catch {
    return null;
  }
}

async function findOrCreateActiveCart({ userId, sessionId }) {
  let rows;

  if (userId) {
    [rows] = await pool.query(
      `
        SELECT id, user_id, session_id, status
        FROM carts
        WHERE user_id = ? AND status = 'active'
        ORDER BY id DESC
        LIMIT 1
      `,
      [userId]
    );
  } else {
    [rows] = await pool.query(
      `
        SELECT id, user_id, session_id, status
        FROM carts
        WHERE session_id = ? AND status = 'active'
        ORDER BY id DESC
        LIMIT 1
      `,
      [sessionId]
    );
  }

  if (rows[0]) {
    return rows[0];
  }

  const [result] = await pool.query(
    'INSERT INTO carts (user_id, session_id, status) VALUES (?, ?, ?)',
    [userId || null, sessionId || null, 'active']
  );

  return {
    id: result.insertId,
    user_id: userId || null,
    session_id: sessionId || null,
    status: 'active',
  };
}

async function getProductById(productId) {
  const [rows] = await pool.query(
    `
      SELECT id, price
      FROM products
      WHERE id = ?
      LIMIT 1
    `,
    [productId]
  );

  return rows[0];
}

function cartApi(app) {
  app.post('/api/cart/items', async (req, res) => {
    try {
      const userId = getUserIdFromAuthHeader(req);
      const { product_id: productId, quantity = 1, notes = null, session_id: sessionId } = req.body;

      if (!productId) {
        return res.status(400).json({ message: 'product_id e obrigatorio.' });
      }

      if (!userId && !sessionId) {
        return res.status(400).json({ message: 'Para visitante, session_id e obrigatorio.' });
      }

      const qty = Number(quantity);
      if (!Number.isInteger(qty) || qty <= 0) {
        return res.status(400).json({ message: 'quantity deve ser um inteiro maior que zero.' });
      }

      const product = await getProductById(productId);
      if (!product) {
        return res.status(404).json({ message: 'Produto nao encontrado.' });
      }

      const cart = await findOrCreateActiveCart({ userId, sessionId });

      const [existingItems] = await pool.query(
        `
          SELECT id, quantity
          FROM cart_items
          WHERE cart_id = ? AND product_id = ?
          LIMIT 1
        `,
        [cart.id, productId]
      );

      if (existingItems[0]) {
        await pool.query(
          'UPDATE cart_items SET quantity = quantity + ?, notes = ? WHERE id = ?',
          [qty, notes, existingItems[0].id]
        );
      } else {
        await pool.query(
          `
            INSERT INTO cart_items (cart_id, product_id, quantity, unit_price, notes)
            VALUES (?, ?, ?, ?, ?)
          `,
          [cart.id, productId, qty, product.price, notes]
        );
      }

      return res.status(201).json({
        message: 'Item adicionado ao carrinho.',
        cart_id: cart.id,
      });
    } catch (_error) {
      return res.status(500).json({ message: 'Erro ao adicionar item no carrinho.' });
    }
  });

  app.get('/api/cart', async (req, res) => {
    try {
      const userId = getUserIdFromAuthHeader(req);
      const sessionId = req.query.session_id;

      if (!userId && !sessionId) {
        return res.status(400).json({ message: 'session_id e obrigatorio para visitante.' });
      }

      let cartRows;
      if (userId) {
        [cartRows] = await pool.query(
          `
            SELECT id
            FROM carts
            WHERE user_id = ? AND status = 'active'
            ORDER BY id DESC
            LIMIT 1
          `,
          [userId]
        );
      } else {
        [cartRows] = await pool.query(
          `
            SELECT id
            FROM carts
            WHERE session_id = ? AND status = 'active'
            ORDER BY id DESC
            LIMIT 1
          `,
          [sessionId]
        );
      }

      const cart = cartRows[0];
      if (!cart) {
        return res.status(200).json({ items: [], total: 0 });
      }

      const [items] = await pool.query(
        `
          SELECT
            ci.id,
            ci.product_id,
            ci.quantity,
            ci.unit_price,
            ci.notes,
            p.name,
            p.image_url AS imageUrl
          FROM cart_items ci
          INNER JOIN products p ON p.id = ci.product_id
          WHERE ci.cart_id = ?
          ORDER BY ci.id DESC
        `,
        [cart.id]
      );

      const normalizedItems = items.map((item) => ({
        ...item,
        imageUrl: item.imageUrl && !item.imageUrl.startsWith('/') ? `/${item.imageUrl}` : item.imageUrl,
      }));

      const total = normalizedItems.reduce((acc, item) => acc + Number(item.unit_price) * Number(item.quantity), 0);

      return res.status(200).json({ items: normalizedItems, total });
    } catch (_error) {
      return res.status(500).json({ message: 'Erro ao buscar carrinho.' });
    }
  });
}

module.exports = cartApi;
