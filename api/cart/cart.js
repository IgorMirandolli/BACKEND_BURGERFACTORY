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

function getCheckoutIdempotencyKey(req) {
  const fromHeader = req.headers['x-idempotency-key'];
  const fromBody = req.body?.idempotency_key;
  const rawValue = String(fromHeader || fromBody || '').trim();

  if (!rawValue) return null;
  return rawValue.slice(0, 80);
}

function isOrderOwnedByRequester(order, userId, sessionId) {
  if (userId) {
    return Number(order.user_id) === Number(userId);
  }

  return String(order.session_id || '') === String(sessionId || '');
}

async function resolveCartCheckoutStatus(connection) {
  const [rows] = await connection.query(
    `
      SELECT COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'carts'
        AND COLUMN_NAME = 'status'
      LIMIT 1
    `
  );

  const columnType = String(rows[0]?.COLUMN_TYPE || '').toLowerCase();

  if (columnType.startsWith('enum(')) {
    if (columnType.includes("'completed'")) return 'completed';
    if (columnType.includes("'checked_out'")) return 'checked_out';
    if (columnType.includes("'abandoned'")) return 'abandoned';
    return 'active';
  }

  return 'completed';
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
      await pool.query(
        `
          INSERT INTO cart_items (cart_id, product_id, quantity, unit_price, notes)
          VALUES (?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            quantity = quantity + VALUES(quantity),
            unit_price = VALUES(unit_price),
            notes = VALUES(notes)
        `,
        [cart.id, productId, qty, product.price, notes]
      );

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
    let connection = null;
    let transactionStarted = false;
    const idempotencyKey = getCheckoutIdempotencyKey(req);
    const userId = getUserIdFromAuthHeader(req);
    const sessionId = req.query.session_id || req.body.session_id || null;

    try {
      if (!userId && !sessionId) {
        return res.status(400).json({ message: 'session_id e obrigatorio para visitante.' });
      }

      const {
        customer_name: customerName,
        customer_phone: customerPhone,
        delivery_address: deliveryAddress,
        payment_method: paymentMethod,
        notes = null,
      } = req.body;

      if (!customerName || !deliveryAddress || !paymentMethod) {
        return res.status(400).json({
          message: 'customer_name, delivery_address e payment_method sao obrigatorios.',
        });
      }

      connection = await pool.getConnection();
      await connection.beginTransaction();
      transactionStarted = true;

      if (idempotencyKey) {
        const [existingOrders] = await connection.query(
          `
            SELECT id, user_id, session_id, total_amount
            FROM orders
            WHERE idempotency_key = ?
            LIMIT 1
            FOR UPDATE
          `,
          [idempotencyKey]
        );

        const existingOrder = existingOrders[0];
        if (existingOrder) {
          const sameOwner = isOrderOwnedByRequester(existingOrder, userId, sessionId);
          await connection.commit();
          transactionStarted = false;

          if (!sameOwner) {
            return res.status(409).json({ message: 'Chave de idempotencia ja utilizada.' });
          }

          return res.status(200).json({
            message: 'Pedido ja processado anteriormente.',
            order_id: existingOrder.id,
            total: Number(existingOrder.total_amount || 0),
            reused: true,
          });
        }
      }

      let cartRows = [];
      if (userId) {
        [cartRows] = await connection.query(
          `
            SELECT id, user_id, session_id
            FROM carts
            WHERE user_id = ? AND status = 'active'
            ORDER BY id DESC
            LIMIT 1
            FOR UPDATE
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
            FOR UPDATE
          `,
          [sessionId]
        );
      }

      const cart = cartRows[0];
      if (!cart) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(404).json({ message: 'Carrinho ativo nao encontrado.' });
      }

      const [items] = await connection.query(
        `
          SELECT
            ci.id,
            ci.product_id,
            ci.quantity,
            ci.unit_price,
            ci.notes,
            COALESCE(NULLIF(TRIM(p.name), ''), 'Produto indisponivel') AS product_name,
            p.image_url AS product_image_url
          FROM cart_items ci
          LEFT JOIN products p ON p.id = ci.product_id
          WHERE ci.cart_id = ?
          ORDER BY ci.id DESC
          FOR UPDATE
        `,
        [cart.id]
      );

      if (items.length === 0) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(400).json({ message: 'Carrinho vazio. Adicione itens para finalizar o pedido.' });
      }

      const total = items.reduce((acc, item) => acc + Number(item.unit_price) * Number(item.quantity), 0);

      const [insertOrderResult] = await connection.query(
        `
          INSERT INTO orders (
            user_id,
            session_id,
            cart_id,
            idempotency_key,
            status,
            total_amount,
            customer_name,
            customer_phone,
            delivery_address,
            payment_method,
            notes
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          userId || null,
          sessionId || null,
          cart.id,
          idempotencyKey,
          'pending',
          total,
          customerName,
          customerPhone || null,
          deliveryAddress,
          paymentMethod,
          notes,
        ]
      );
      const orderId = insertOrderResult.insertId;

      const orderItemsValues = items.map((item) => [
        orderId,
        item.product_id,
        item.product_name || 'Produto indisponivel',
        item.product_image_url || null,
        item.quantity,
        item.unit_price,
        item.notes || null,
      ]);

      await connection.query(
        `
          INSERT INTO order_items (
            order_id,
            product_id,
            product_name,
            product_image_url,
            quantity,
            unit_price,
            notes
          )
          VALUES ?
        `,
        [orderItemsValues]
      );

      const checkoutStatus = await resolveCartCheckoutStatus(connection);
      const [updateCartResult] = await connection.query(
        `
          UPDATE carts
          SET status = ?, checkout_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'active'
        `,
        [checkoutStatus, cart.id]
      );

      if (updateCartResult.affectedRows !== 1) {
        throw new Error('Nao foi possivel concluir o carrinho.');
      }

      await connection.commit();
      transactionStarted = false;

      return res.status(201).json({
        message: 'Pedido finalizado com sucesso.',
        order_id: insertOrderResult.insertId,
        total,
      });
    } catch (error) {
      if (transactionStarted) {
        try {
          await connection.rollback();
        } catch {
          // Ignore rollback failures to preserve original error handling.
        }
      }

      if (idempotencyKey && error?.code === 'ER_DUP_ENTRY') {
        const [rows] = await pool.query(
          `
            SELECT id, user_id, session_id, total_amount
            FROM orders
            WHERE idempotency_key = ?
            LIMIT 1
          `,
          [idempotencyKey]
        );

        const existingOrder = rows[0];
        if (existingOrder) {
          const sameOwner = isOrderOwnedByRequester(existingOrder, userId, sessionId);
          if (!sameOwner) {
            return res.status(409).json({ message: 'Chave de idempotencia ja utilizada.' });
          }

          return res.status(200).json({
            message: 'Pedido ja processado anteriormente.',
            order_id: existingOrder.id,
            total: Number(existingOrder.total_amount || 0),
            reused: true,
          });
        }
      }

      console.error('Erro detalhado no checkout:', error);
      return res.status(500).json({ message: 'Erro ao finalizar pedido.' });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  });
}

module.exports = cartApi;
