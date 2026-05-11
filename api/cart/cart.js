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

async function findActiveCart({ userId, sessionId }) {
  let rows;

  if (userId) {
    [rows] = await pool.query(
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
    [rows] = await pool.query(
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

  return rows[0] || null;
}

async function tableExists(connection, tableName) {
  const [rows] = await connection.query('SHOW TABLES LIKE ?', [tableName]);
  return rows.length > 0;
}

async function getTableColumns(connection, tableName) {
  const [rows] = await connection.query(`SHOW COLUMNS FROM ${tableName}`);
  return new Set(rows.map((row) => row.Field));
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

  app.delete('/api/cart/items/:itemId', async (req, res) => {
    try {
      const userId = getUserIdFromAuthHeader(req);
      const sessionId = req.query.session_id;
      const itemId = Number(req.params.itemId);

      if (!Number.isInteger(itemId) || itemId <= 0) {
        return res.status(400).json({ message: 'itemId invalido.' });
      }

      if (!userId && !sessionId) {
        return res.status(400).json({ message: 'session_id e obrigatorio para visitante.' });
      }

      const cart = await findActiveCart({ userId, sessionId });
      if (!cart) {
        return res.status(404).json({ message: 'Carrinho ativo nao encontrado.' });
      }

      const [result] = await pool.query('DELETE FROM cart_items WHERE id = ? AND cart_id = ?', [itemId, cart.id]);

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Item do carrinho nao encontrado.' });
      }

      return res.status(200).json({ message: 'Item removido do carrinho.' });
    } catch (_error) {
      return res.status(500).json({ message: 'Erro ao remover item do carrinho.' });
    }
  });

  app.patch('/api/cart/items/:itemId', async (req, res) => {
    try {
      const userId = getUserIdFromAuthHeader(req);
      const sessionId = req.query.session_id;
      const itemId = Number(req.params.itemId);
      const quantity = Number(req.body.quantity);

      if (!Number.isInteger(itemId) || itemId <= 0) {
        return res.status(400).json({ message: 'itemId invalido.' });
      }

      if (!Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({ message: 'quantity deve ser inteiro maior que zero.' });
      }

      if (!userId && !sessionId) {
        return res.status(400).json({ message: 'session_id e obrigatorio para visitante.' });
      }

      const cart = await findActiveCart({ userId, sessionId });
      if (!cart) {
        return res.status(404).json({ message: 'Carrinho ativo nao encontrado.' });
      }

      const [result] = await pool.query(
        'UPDATE cart_items SET quantity = ? WHERE id = ? AND cart_id = ?',
        [quantity, itemId, cart.id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Item do carrinho nao encontrado.' });
      }

      return res.status(200).json({ message: 'Quantidade atualizada.' });
    } catch (_error) {
      return res.status(500).json({ message: 'Erro ao atualizar quantidade do item.' });
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

  app.post('/api/cart/checkout', async (req, res) => {
    const connection = await pool.getConnection();
    let transactionStarted = false;

    try {
      const userId = getUserIdFromAuthHeader(req);
      const sessionId = req.query.session_id || req.body.session_id || null;

      if (!userId && !sessionId) {
        return res.status(400).json({ message: 'session_id e obrigatorio para visitante.' });
      }

      const { customer_name: customerName, customer_phone: customerPhone, delivery_address: deliveryAddress, payment_method: paymentMethod, notes = null } = req.body;

      if (!customerName || !deliveryAddress || !paymentMethod) {
        return res.status(400).json({
          message: 'customer_name, delivery_address e payment_method sao obrigatorios.',
        });
      }

      let cartRows;
      if (userId) {
        [cartRows] = await connection.query(
          `
            SELECT id, user_id, session_id
            FROM carts
            WHERE user_id = ? AND status = 'active'
            ORDER BY id DESC
            LIMIT 1
          `,
          [userId]
        );
      } else {
        [cartRows] = await connection.query(
          `
            SELECT id, user_id, session_id
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
        return res.status(404).json({ message: 'Carrinho ativo nao encontrado.' });
      }

      const [items] = await connection.query(
        `
          SELECT
            ci.id,
            ci.product_id,
            ci.quantity,
            ci.unit_price,
            ci.notes
          FROM cart_items ci
          WHERE ci.cart_id = ?
          ORDER BY ci.id DESC
        `,
        [cart.id]
      );

      if (items.length === 0) {
        return res.status(400).json({ message: 'Carrinho vazio. Adicione itens para finalizar o pedido.' });
      }

      const total = items.reduce((acc, item) => acc + Number(item.unit_price) * Number(item.quantity), 0);

      await connection.beginTransaction();
      transactionStarted = true;

      let orderId = null;
      try {
        const hasOrdersTable = await tableExists(connection, 'orders');
        const hasOrderItemsTable = await tableExists(connection, 'order_items');

        if (hasOrdersTable) {
          const orderColumns = await getTableColumns(connection, 'orders');
          const orderData = {};

          if (orderColumns.has('user_id')) orderData.user_id = userId || null;
          if (orderColumns.has('session_id')) orderData.session_id = sessionId || null;
          if (orderColumns.has('status')) orderData.status = 'pending';
          if (orderColumns.has('total_amount')) orderData.total_amount = total;
          if (orderColumns.has('customer_name')) orderData.customer_name = customerName;
          if (orderColumns.has('customer_phone')) orderData.customer_phone = customerPhone || null;
          if (orderColumns.has('delivery_address')) orderData.delivery_address = deliveryAddress;
          if (orderColumns.has('payment_method')) orderData.payment_method = paymentMethod;
          if (orderColumns.has('notes')) orderData.notes = notes;

          const fields = Object.keys(orderData);
          if (fields.length > 0) {
            const placeholders = fields.map(() => '?').join(', ');
            const [insertOrderResult] = await connection.query(
              `INSERT INTO orders (${fields.join(', ')}) VALUES (${placeholders})`,
              fields.map((field) => orderData[field])
            );

            orderId = insertOrderResult.insertId;
          }
        }

        if (hasOrderItemsTable && orderId) {
          const orderItemColumns = await getTableColumns(connection, 'order_items');

          for (const item of items) {
            const itemData = {};

            if (orderItemColumns.has('order_id')) itemData.order_id = orderId;
            if (orderItemColumns.has('product_id')) itemData.product_id = item.product_id;
            if (orderItemColumns.has('quantity')) itemData.quantity = item.quantity;
            if (orderItemColumns.has('unit_price')) itemData.unit_price = item.unit_price;
            if (orderItemColumns.has('notes')) itemData.notes = item.notes;

            const fields = Object.keys(itemData);
            if (fields.length > 0) {
              const placeholders = fields.map(() => '?').join(', ');
              await connection.query(
                `INSERT INTO order_items (${fields.join(', ')}) VALUES (${placeholders})`,
                fields.map((field) => itemData[field])
              );
            }
          }
        }
      } catch {
        orderId = null;
      }

      try {
        await connection.query('UPDATE carts SET status = ? WHERE id = ?', ['completed', cart.id]);
      } catch {
        await connection.query('DELETE FROM cart_items WHERE cart_id = ?', [cart.id]);
      }
      await connection.commit();

      return res.status(201).json({
        message: 'Pedido finalizado com sucesso.',
        order_id: orderId,
        total,
      });
    } catch (_error) {
      if (transactionStarted) {
        await connection.rollback();
      }
      console.error('Erro detalhado no checkout:', _error);
      return res.status(500).json({ message: 'Erro ao finalizar pedido.' });
    } finally {
      connection.release();
    }
  });
}

module.exports = cartApi;
