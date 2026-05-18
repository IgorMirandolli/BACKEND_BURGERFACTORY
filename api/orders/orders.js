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

function getComputedStatus(order) {
  const normalizedStatus = normalizeStatus(order?.status);
  return normalizedStatus || 'pending';
}

function getTrackingProgress(order) {
  const status = getComputedStatus(order);
  const progressMap = {
    pending: 20,
    preparing: 45,
    on_the_way: 80,
    delivered: 100,
    cancelled: 0,
  };

  return progressMap[status] ?? 0;
}

function normalizeStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/\s+/g, '_');
}

function normalizeOrder(order) {
  const computedStatus = getComputedStatus(order);
  const statusLabelMap = {
    pending: 'Pendente',
    preparing: 'Sendo preparado',
    on_the_way: 'Saiu para entrega',
    delivered: 'Entregue',
    cancelled: 'Cancelado',
  };

  return {
    ...order,
    preview_image:
      order.preview_image && !String(order.preview_image).startsWith('/')
        ? `/${order.preview_image}`
        : order.preview_image,
    computed_status: computedStatus,
    computed_status_label: statusLabelMap[computedStatus] || 'Em andamento',
    tracking_progress: getTrackingProgress(order),
  };
}

function ordersApi(app) {
  app.get('/api/orders', async (req, res) => {
    try {
      const userId = getUserIdFromAuthHeader(req);
      const sessionId = req.query.session_id;

      if (!userId && !sessionId) {
        return res.status(400).json({ message: 'session_id e obrigatorio para visitante.' });
      }

      let rows;
      if (userId) {
        [rows] = await pool.query(
          `
            SELECT
              o.id,
              o.user_id,
              o.session_id,
              o.status,
              o.total_amount,
              o.customer_name,
              o.delivery_address,
              o.payment_method,
              o.created_at,
              (
                SELECT COALESCE(SUM(oi.quantity), 0)
                FROM order_items oi
                WHERE oi.order_id = o.id
              ) AS items_count,
              (
                SELECT COALESCE(NULLIF(oi.product_image_url, ''), p.image_url)
                FROM order_items oi
                LEFT JOIN products p ON p.id = oi.product_id
                WHERE oi.order_id = o.id
                ORDER BY oi.id ASC
                LIMIT 1
              ) AS preview_image
            FROM orders o
            WHERE o.user_id = ?
            ORDER BY o.id DESC
          `,
          [userId]
        );
      } else {
        [rows] = await pool.query(
          `
            SELECT
              o.id,
              o.user_id,
              o.session_id,
              o.status,
              o.total_amount,
              o.customer_name,
              o.delivery_address,
              o.payment_method,
              o.created_at,
              (
                SELECT COALESCE(SUM(oi.quantity), 0)
                FROM order_items oi
                WHERE oi.order_id = o.id
              ) AS items_count,
              (
                SELECT COALESCE(NULLIF(oi.product_image_url, ''), p.image_url)
                FROM order_items oi
                LEFT JOIN products p ON p.id = oi.product_id
                WHERE oi.order_id = o.id
                ORDER BY oi.id ASC
                LIMIT 1
              ) AS preview_image
            FROM orders o
            WHERE o.session_id = ?
            ORDER BY o.id DESC
          `,
          [sessionId]
        );
      }

      const items = rows.map(normalizeOrder);
      return res.status(200).json({ items });
    } catch (_error) {
      return res.status(500).json({ message: 'Erro ao buscar pedidos.' });
    }
  });

  app.get('/api/orders/:orderId', async (req, res) => {
    try {
      const userId = getUserIdFromAuthHeader(req);
      const sessionId = req.query.session_id;
      const orderId = Number(req.params.orderId);

      if (!Number.isInteger(orderId) || orderId <= 0) {
        return res.status(400).json({ message: 'orderId invalido.' });
      }

      if (!userId && !sessionId) {
        return res.status(400).json({ message: 'session_id e obrigatorio para visitante.' });
      }

      let orderRows;
      if (userId) {
        [orderRows] = await pool.query(
          `
            SELECT
              id,
              user_id,
              session_id,
              status,
              total_amount,
              customer_name,
              customer_phone,
              delivery_address,
              payment_method,
              notes,
              created_at
            FROM orders
            WHERE id = ? AND user_id = ?
            LIMIT 1
          `,
          [orderId, userId]
        );
      } else {
        [orderRows] = await pool.query(
          `
            SELECT
              id,
              user_id,
              session_id,
              status,
              total_amount,
              customer_name,
              customer_phone,
              delivery_address,
              payment_method,
              notes,
              created_at
            FROM orders
            WHERE id = ? AND session_id = ?
            LIMIT 1
          `,
          [orderId, sessionId]
        );
      }

      const order = orderRows[0];
      if (!order) {
        return res.status(404).json({ message: 'Pedido nao encontrado.' });
      }

      const [orderItems] = await pool.query(
        `
          SELECT
            oi.id,
            oi.product_id,
            oi.quantity,
            oi.unit_price,
            oi.notes,
            COALESCE(p.name, oi.product_name, 'Produto indisponivel') AS name,
            COALESCE(NULLIF(oi.product_image_url, ''), p.image_url) AS imageUrl
          FROM order_items oi
          LEFT JOIN products p ON p.id = oi.product_id
          WHERE oi.order_id = ?
          ORDER BY oi.id DESC
        `,
        [order.id]
      );

      const normalizedOrder = normalizeOrder(order);
      const normalizedItems = orderItems.map((item) => ({
        ...item,
        imageUrl: item.imageUrl && !item.imageUrl.startsWith('/') ? `/${item.imageUrl}` : item.imageUrl,
      }));

      return res.status(200).json({ order: normalizedOrder, items: normalizedItems });
    } catch (_error) {
      return res.status(500).json({ message: 'Erro ao buscar detalhes do pedido.' });
    }
  });
}

module.exports = ordersApi;
