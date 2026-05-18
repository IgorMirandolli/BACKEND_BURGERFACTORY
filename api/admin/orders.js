const { pool } = require('../../config/db');
const { authMiddleware, roleMiddleware } = require('../../config/middlewares');

const NEXT_STATUS_BY_CURRENT = {
  pending: 'preparing',
  preparing: 'on_the_way',
  on_the_way: 'delivered',
};

const ADMIN_ALLOWED_STATUSES = new Set(['pending', 'preparing', 'on_the_way', 'delivered', 'cancelled']);

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

function normalizeStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/\s+/g, '_');
}

function canTransitionStatus(currentStatus, nextStatus) {
  if (currentStatus === nextStatus) return false;
  if (currentStatus === 'cancelled' || currentStatus === 'delivered') return false;

  if (nextStatus === 'cancelled') {
    return ['pending', 'preparing', 'on_the_way'].includes(currentStatus);
  }

  const expectedNext = NEXT_STATUS_BY_CURRENT[currentStatus];
  return expectedNext === nextStatus;
}

function parseLimit(value, fallback = 80) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 200);
}

function adminOrdersApi(app) {
  app.get('/api/admin/orders', authMiddleware, roleMiddleware('admin'), async (req, res) => {
    try {
      const limit = parseLimit(req.query.limit, 80);
      const requestedStatus = req.query.status ? normalizeStatus(req.query.status) : null;

      if (requestedStatus && !ADMIN_ALLOWED_STATUSES.has(requestedStatus)) {
        return res.status(400).json({ message: 'status invalido para filtro.' });
      }

      const whereClauses = [];
      const params = [];

      if (requestedStatus) {
        whereClauses.push('o.status = ?');
        params.push(requestedStatus);
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      const [rows] = await pool.query(
        `
          SELECT
            o.id,
            o.user_id,
            o.session_id,
            o.status,
            o.total_amount,
            o.customer_name,
            o.customer_phone,
            o.delivery_address,
            o.payment_method,
            o.notes,
            o.created_at,
            o.updated_at,
            u.name AS user_name,
            u.email AS user_email,
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
          LEFT JOIN users u ON u.id = o.user_id
          ${whereSql}
          ORDER BY o.id DESC
          LIMIT ?
        `,
        [...params, limit]
      );

      const items = rows.map(normalizeOrder);
      return res.status(200).json({ items });
    } catch (_error) {
      return res.status(500).json({ message: 'Erro ao carregar pedidos do admin.' });
    }
  });

  app.get('/api/admin/orders/:orderId', authMiddleware, roleMiddleware('admin'), async (req, res) => {
    try {
      const orderId = Number(req.params.orderId);
      if (!Number.isInteger(orderId) || orderId <= 0) {
        return res.status(400).json({ message: 'orderId invalido.' });
      }

      const [orderRows] = await pool.query(
        `
          SELECT
            o.id,
            o.user_id,
            o.session_id,
            o.status,
            o.total_amount,
            o.customer_name,
            o.customer_phone,
            o.delivery_address,
            o.payment_method,
            o.notes,
            o.created_at,
            o.updated_at,
            u.name AS user_name,
            u.email AS user_email
          FROM orders o
          LEFT JOIN users u ON u.id = o.user_id
          WHERE o.id = ?
          LIMIT 1
        `,
        [orderId]
      );

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
            COALESCE(NULLIF(oi.product_name, ''), p.name, 'Produto indisponivel') AS name,
            COALESCE(NULLIF(oi.product_image_url, ''), p.image_url) AS image_url
          FROM order_items oi
          LEFT JOIN products p ON p.id = oi.product_id
          WHERE oi.order_id = ?
          ORDER BY oi.id DESC
        `,
        [orderId]
      );

      const items = orderItems.map((item) => ({
        ...item,
        image_url:
          item.image_url && !String(item.image_url).startsWith('/') ? `/${item.image_url}` : item.image_url,
      }));

      return res.status(200).json({
        order: normalizeOrder(order),
        items,
      });
    } catch (_error) {
      return res.status(500).json({ message: 'Erro ao carregar detalhes do pedido.' });
    }
  });

  app.patch('/api/admin/orders/:orderId/status', authMiddleware, roleMiddleware('admin'), async (req, res) => {
    let connection = null;
    let transactionStarted = false;

    try {
      const orderId = Number(req.params.orderId);
      const nextStatus = normalizeStatus(req.body?.status);

      if (!Number.isInteger(orderId) || orderId <= 0) {
        return res.status(400).json({ message: 'orderId invalido.' });
      }

      if (!ADMIN_ALLOWED_STATUSES.has(nextStatus)) {
        return res.status(400).json({ message: 'status invalido.' });
      }

      connection = await pool.getConnection();
      await connection.beginTransaction();
      transactionStarted = true;

      const [rows] = await connection.query(
        `
          SELECT
            id,
            status,
            created_at
          FROM orders
          WHERE id = ?
          LIMIT 1
          FOR UPDATE
        `,
        [orderId]
      );

      const currentOrder = rows[0];
      if (!currentOrder) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(404).json({ message: 'Pedido nao encontrado.' });
      }

      const effectiveCurrentStatus = getComputedStatus(currentOrder);
      if (!canTransitionStatus(effectiveCurrentStatus, nextStatus)) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(409).json({
          message: `Transicao de status nao permitida (${effectiveCurrentStatus} -> ${nextStatus}).`,
        });
      }

      await connection.query(
        `
          UPDATE orders
          SET status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [nextStatus, orderId]
      );

      const [updatedRows] = await connection.query(
        `
          SELECT
            o.id,
            o.user_id,
            o.session_id,
            o.status,
            o.total_amount,
            o.customer_name,
            o.customer_phone,
            o.delivery_address,
            o.payment_method,
            o.notes,
            o.created_at,
            o.updated_at,
            u.name AS user_name,
            u.email AS user_email,
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
          LEFT JOIN users u ON u.id = o.user_id
          WHERE o.id = ?
          LIMIT 1
        `,
        [orderId]
      );

      await connection.commit();
      transactionStarted = false;

      return res.status(200).json({
        message: 'Status do pedido atualizado.',
        order: normalizeOrder(updatedRows[0]),
      });
    } catch (_error) {
      if (transactionStarted && connection) {
        try {
          await connection.rollback();
        } catch {
          // keep original error path
        }
      }
      return res.status(500).json({ message: 'Erro ao atualizar status do pedido.' });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  });
}

module.exports = adminOrdersApi;
