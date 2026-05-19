const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { pool } = require('../../config/db');
const { authMiddleware, roleMiddleware } = require('../../config/middlewares');

const PRODUCT_IMAGE_UPLOAD_DIR = path.join(__dirname, '../../public/menu');
const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_PRODUCT_IMAGE_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

function normalizeStatusFilter(value) {
  const normalized = String(value || 'all')
    .trim()
    .toLowerCase();

  if (normalized === 'active' || normalized === 'inactive' || normalized === 'all') {
    return normalized;
  }

  return 'all';
}

function normalizeFeaturedFilter(value) {
  const normalized = String(value || 'all')
    .trim()
    .toLowerCase();

  if (normalized === 'featured' || normalized === 'not_featured' || normalized === 'all') {
    return normalized;
  }

  return 'all';
}

function normalizeImageUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  if (value.startsWith('/')) return value;
  return `/${value}`;
}

function normalizeText(rawValue, maxLength = 255) {
  return String(rawValue || '')
    .trim()
    .slice(0, maxLength);
}

function parsePositiveInt(value, fallback = null) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parsePage(value) {
  return parsePositiveInt(value, 1);
}

function parsePageSize(value) {
  const size = parsePositiveInt(value, 10);
  return Math.min(50, Math.max(5, size));
}

function parsePrice(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return null;
  return Number(numericValue.toFixed(2));
}

function parseBooleanInput(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'sim', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'nao', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

function ensureProductImageUploadDir() {
  fs.mkdirSync(PRODUCT_IMAGE_UPLOAD_DIR, { recursive: true });
}

function toSlug(value) {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

  return normalized || 'produto';
}

function parseProductImageDataUrl(dataUrl) {
  const rawValue = String(dataUrl || '').trim();
  if (!rawValue) return null;

  const match = rawValue.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([a-z0-9+/=\r\n]+)$/i);
  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  if (!ALLOWED_PRODUCT_IMAGE_MIME.has(mimeType)) return null;

  const base64Content = match[2].replace(/\s/g, '');
  const buffer = Buffer.from(base64Content, 'base64');
  if (!buffer.length || buffer.length > MAX_PRODUCT_IMAGE_BYTES) return null;

  const extensionByMime = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };

  return {
    mimeType,
    extension: extensionByMime[mimeType],
    buffer,
  };
}

function buildProductImageFileName(productName, extension) {
  const slug = toSlug(productName);
  return `${slug}-${Date.now()}-${crypto.randomUUID()}.${extension}`;
}

function saveProductImageFile(parsedImage, productName) {
  ensureProductImageUploadDir();

  const fileName = buildProductImageFileName(productName, parsedImage.extension);
  const filePath = path.join(PRODUCT_IMAGE_UPLOAD_DIR, fileName);
  fs.writeFileSync(filePath, parsedImage.buffer);

  return `/menu/${fileName}`;
}

function getManagedMenuPath(imageUrl) {
  const rawValue = String(imageUrl || '').trim();
  if (!rawValue) return '';
  if (rawValue.startsWith('/menu/')) return rawValue;

  try {
    const parsed = new URL(rawValue);
    if (parsed.pathname.startsWith('/menu/')) {
      return parsed.pathname;
    }
  } catch {
    return '';
  }

  return '';
}

function deleteLocalManagedProductImage(imageUrl) {
  const managedPath = getManagedMenuPath(imageUrl);
  if (!managedPath) return;

  try {
    const fileName = path.basename(managedPath);
    const filePath = path.join(PRODUCT_IMAGE_UPLOAD_DIR, fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Ignore delete failure to avoid breaking product update flow.
  }
}

function normalizeProductRow(row) {
  return {
    id: row.id,
    category_id: row.category_id,
    category_name: row.category_name || '',
    category_slug: row.category_slug || '',
    category_is_active: Boolean(row.category_is_active),
    name: row.name || '',
    description: row.description || '',
    price: Number(row.price || 0),
    image_url: row.image_url || '',
    imageUrl: normalizeImageUrl(row.image_url),
    is_available: Boolean(row.is_available),
    is_featured: Boolean(row.is_featured),
    display_order: Number(row.display_order || 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function fetchCategoryById(categoryId) {
  const [rows] = await pool.query(
    `
      SELECT id, name, slug, is_active
      FROM categories
      WHERE id = ?
      LIMIT 1
    `,
    [categoryId]
  );

  return rows[0] || null;
}

async function fetchProductById(productId) {
  const [rows] = await pool.query(
    `
      SELECT
        p.id,
        p.category_id,
        p.name,
        p.description,
        p.price,
        p.image_url,
        p.is_available,
        p.is_featured,
        p.display_order,
        p.created_at,
        p.updated_at,
        c.name AS category_name,
        c.slug AS category_slug,
        c.is_active AS category_is_active
      FROM products p
      INNER JOIN categories c ON c.id = p.category_id
      WHERE p.id = ?
      LIMIT 1
    `,
    [productId]
  );

  return rows[0] || null;
}

function adminProductsApi(app) {
  app.get('/api/admin/categories', authMiddleware, roleMiddleware('admin'), async (_req, res) => {
    try {
      const [rows] = await pool.query(
        `
          SELECT
            c.id,
            c.name,
            c.slug,
            c.sort_order,
            c.is_active,
            COUNT(p.id) AS products_count,
            SUM(CASE WHEN p.is_available = 1 THEN 1 ELSE 0 END) AS active_products_count
          FROM categories c
          LEFT JOIN products p ON p.category_id = c.id
          GROUP BY c.id, c.name, c.slug, c.sort_order, c.is_active
          ORDER BY c.sort_order ASC, c.name ASC
        `
      );

      const items = rows.map((item) => ({
        id: item.id,
        name: item.name,
        slug: item.slug,
        sort_order: Number(item.sort_order || 0),
        is_active: Boolean(item.is_active),
        products_count: Number(item.products_count || 0),
        active_products_count: Number(item.active_products_count || 0),
      }));

      return res.status(200).json({ items });
    } catch (_error) {
      return res.status(500).json({ message: 'Erro ao carregar categorias.' });
    }
  });

  app.get('/api/admin/products', authMiddleware, roleMiddleware('admin'), async (req, res) => {
    try {
      const page = parsePage(req.query.page);
      const pageSize = parsePageSize(req.query.page_size);
      const offset = (page - 1) * pageSize;

      const searchTerm = normalizeText(req.query.q || '', 120).toLowerCase();
      const categoryId = parsePositiveInt(req.query.category_id, null);
      const statusFilter = normalizeStatusFilter(req.query.status);
      const featuredFilter = normalizeFeaturedFilter(req.query.featured);

      const baseWhereClauses = [];
      const baseWhereParams = [];

      if (searchTerm) {
        const likeSearch = `%${searchTerm}%`;
        baseWhereClauses.push('(LOWER(p.name) LIKE ? OR LOWER(COALESCE(p.description, \'\')) LIKE ?)');
        baseWhereParams.push(likeSearch, likeSearch);
      }

      if (categoryId) {
        baseWhereClauses.push('p.category_id = ?');
        baseWhereParams.push(categoryId);
      }

      const whereClauses = [...baseWhereClauses];
      const whereParams = [...baseWhereParams];

      if (statusFilter === 'active') {
        whereClauses.push('p.is_available = 1');
      } else if (statusFilter === 'inactive') {
        whereClauses.push('p.is_available = 0');
      }

      if (featuredFilter === 'featured') {
        whereClauses.push('p.is_featured = 1');
      } else if (featuredFilter === 'not_featured') {
        whereClauses.push('p.is_featured = 0');
      }

      const baseWhereSql = baseWhereClauses.length > 0 ? `WHERE ${baseWhereClauses.join(' AND ')}` : '';
      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      const [summaryRows] = await pool.query(
        `
          SELECT
            COUNT(*) AS total_products,
            SUM(CASE WHEN p.is_available = 1 THEN 1 ELSE 0 END) AS active_products,
            SUM(CASE WHEN p.is_available = 0 THEN 1 ELSE 0 END) AS inactive_products,
            SUM(CASE WHEN p.is_featured = 1 THEN 1 ELSE 0 END) AS featured_products
          FROM products p
          INNER JOIN categories c ON c.id = p.category_id
          ${baseWhereSql}
        `,
        baseWhereParams
      );

      const [countRows] = await pool.query(
        `
          SELECT COUNT(*) AS total
          FROM products p
          INNER JOIN categories c ON c.id = p.category_id
          ${whereSql}
        `,
        whereParams
      );

      const total = Number(countRows[0]?.total || 0);
      const totalPages = Math.max(1, Math.ceil(total / pageSize));

      const [rows] = await pool.query(
        `
          SELECT
            p.id,
            p.category_id,
            p.name,
            p.description,
            p.price,
            p.image_url,
            p.is_available,
            p.is_featured,
            p.display_order,
            p.created_at,
            p.updated_at,
            c.name AS category_name,
            c.slug AS category_slug,
            c.is_active AS category_is_active
          FROM products p
          INNER JOIN categories c ON c.id = p.category_id
          ${whereSql}
          ORDER BY p.display_order ASC, p.id DESC
          LIMIT ?
          OFFSET ?
        `,
        [...whereParams, pageSize, offset]
      );

      return res.status(200).json({
        items: rows.map(normalizeProductRow),
        summary: {
          total_products: Number(summaryRows[0]?.total_products || 0),
          active_products: Number(summaryRows[0]?.active_products || 0),
          inactive_products: Number(summaryRows[0]?.inactive_products || 0),
          featured_products: Number(summaryRows[0]?.featured_products || 0),
        },
        pagination: {
          page,
          page_size: pageSize,
          total,
          total_pages: totalPages,
        },
      });
    } catch (_error) {
      return res.status(500).json({ message: 'Erro ao carregar produtos do admin.' });
    }
  });

  app.post('/api/admin/products', authMiddleware, roleMiddleware('admin'), async (req, res) => {
    try {
      const name = normalizeText(req.body?.name, 150);
      const description = normalizeText(req.body?.description, 1800);
      const imageUrl = normalizeText(req.body?.image_url, 1200);
      const imageDataRaw = String(req.body?.image_data || '').trim();
      const hasImageData = Boolean(imageDataRaw);
      const parsedImageData = parseProductImageDataUrl(imageDataRaw);
      const categoryId = parsePositiveInt(req.body?.category_id, null);
      const price = parsePrice(req.body?.price);
      const isAvailable = parseBooleanInput(req.body?.is_available, true);
      const isFeatured = parseBooleanInput(req.body?.is_featured, false);
      const displayOrder = Number.isInteger(Number(req.body?.display_order))
        ? Number(req.body.display_order)
        : 0;

      if (!name || name.length < 2) {
        return res.status(400).json({ message: 'Nome do produto invalido.' });
      }

      if (!categoryId) {
        return res.status(400).json({ message: 'Categoria invalida.' });
      }

      if (price === null) {
        return res.status(400).json({ message: 'Preco invalido.' });
      }

      if (hasImageData && !parsedImageData) {
        return res.status(400).json({ message: 'Imagem invalida. Envie JPG, PNG ou WEBP ate 5MB.' });
      }

      const category = await fetchCategoryById(categoryId);
      if (!category) {
        return res.status(400).json({ message: 'Categoria nao encontrada.' });
      }

      let finalImageUrl = imageUrl || null;
      if (parsedImageData) {
        const savedRelativePath = saveProductImageFile(parsedImageData, name);
        finalImageUrl = savedRelativePath;
      }

      const [insertResult] = await pool.query(
        `
          INSERT INTO products (
            category_id,
            name,
            description,
            price,
            image_url,
            is_available,
            is_featured,
            display_order
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          categoryId,
          name,
          description || null,
          price,
          finalImageUrl,
          isAvailable ? 1 : 0,
          isFeatured ? 1 : 0,
          displayOrder,
        ]
      );

      const dbProduct = await fetchProductById(insertResult.insertId);
      return res.status(201).json({
        message: 'Produto criado com sucesso.',
        product: dbProduct ? normalizeProductRow(dbProduct) : null,
      });
    } catch (_error) {
      return res.status(500).json({ message: 'Erro ao criar produto.' });
    }
  });

  app.put('/api/admin/products/:productId', authMiddleware, roleMiddleware('admin'), async (req, res) => {
    try {
      const productId = parsePositiveInt(req.params.productId, null);
      if (!productId) {
        return res.status(400).json({ message: 'productId invalido.' });
      }

      const name = normalizeText(req.body?.name, 150);
      const description = normalizeText(req.body?.description, 1800);
      const imageUrl = normalizeText(req.body?.image_url, 1200);
      const imageDataRaw = String(req.body?.image_data || '').trim();
      const hasImageData = Boolean(imageDataRaw);
      const parsedImageData = parseProductImageDataUrl(imageDataRaw);
      const categoryId = parsePositiveInt(req.body?.category_id, null);
      const price = parsePrice(req.body?.price);
      const isAvailable = parseBooleanInput(req.body?.is_available, true);
      const isFeatured = parseBooleanInput(req.body?.is_featured, false);
      const displayOrder = Number.isInteger(Number(req.body?.display_order))
        ? Number(req.body.display_order)
        : 0;

      if (!name || name.length < 2) {
        return res.status(400).json({ message: 'Nome do produto invalido.' });
      }

      if (!categoryId) {
        return res.status(400).json({ message: 'Categoria invalida.' });
      }

      if (price === null) {
        return res.status(400).json({ message: 'Preco invalido.' });
      }

      if (hasImageData && !parsedImageData) {
        return res.status(400).json({ message: 'Imagem invalida. Envie JPG, PNG ou WEBP ate 5MB.' });
      }

      const existingProduct = await fetchProductById(productId);
      if (!existingProduct) {
        return res.status(404).json({ message: 'Produto nao encontrado.' });
      }

      const category = await fetchCategoryById(categoryId);
      if (!category) {
        return res.status(400).json({ message: 'Categoria nao encontrada.' });
      }

      let finalImageUrl = imageUrl || null;
      if (parsedImageData) {
        const savedRelativePath = saveProductImageFile(parsedImageData, name);
        finalImageUrl = savedRelativePath;
      }

      await pool.query(
        `
          UPDATE products
          SET
            category_id = ?,
            name = ?,
            description = ?,
            price = ?,
            image_url = ?,
            is_available = ?,
            is_featured = ?,
            display_order = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [
          categoryId,
          name,
          description || null,
          price,
          finalImageUrl,
          isAvailable ? 1 : 0,
          isFeatured ? 1 : 0,
          displayOrder,
          productId,
        ]
      );

      const previousImageUrl = String(existingProduct.image_url || '').trim();
      const nextImageUrl = String(finalImageUrl || '').trim();
      if (previousImageUrl !== nextImageUrl && getManagedMenuPath(previousImageUrl)) {
        deleteLocalManagedProductImage(previousImageUrl);
      }

      const dbProduct = await fetchProductById(productId);
      return res.status(200).json({
        message: 'Produto atualizado com sucesso.',
        product: dbProduct ? normalizeProductRow(dbProduct) : null,
      });
    } catch (_error) {
      return res.status(500).json({ message: 'Erro ao atualizar produto.' });
    }
  });

  app.patch('/api/admin/products/:productId/status', authMiddleware, roleMiddleware('admin'), async (req, res) => {
    try {
      const productId = parsePositiveInt(req.params.productId, null);
      if (!productId) {
        return res.status(400).json({ message: 'productId invalido.' });
      }

      const isAvailable = parseBooleanInput(req.body?.is_available, null);
      if (typeof isAvailable !== 'boolean') {
        return res.status(400).json({ message: 'is_available invalido.' });
      }

      const dbProduct = await fetchProductById(productId);
      if (!dbProduct) {
        return res.status(404).json({ message: 'Produto nao encontrado.' });
      }

      await pool.query(
        `
          UPDATE products
          SET is_available = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [isAvailable ? 1 : 0, productId]
      );

      const updated = await fetchProductById(productId);
      return res.status(200).json({
        message: isAvailable ? 'Produto ativado.' : 'Produto inativado.',
        product: updated ? normalizeProductRow(updated) : null,
      });
    } catch (_error) {
      return res.status(500).json({ message: 'Erro ao atualizar status do produto.' });
    }
  });

  app.patch('/api/admin/products/:productId/featured', authMiddleware, roleMiddleware('admin'), async (req, res) => {
    try {
      const productId = parsePositiveInt(req.params.productId, null);
      if (!productId) {
        return res.status(400).json({ message: 'productId invalido.' });
      }

      const isFeatured = parseBooleanInput(req.body?.is_featured, null);
      if (typeof isFeatured !== 'boolean') {
        return res.status(400).json({ message: 'is_featured invalido.' });
      }

      const dbProduct = await fetchProductById(productId);
      if (!dbProduct) {
        return res.status(404).json({ message: 'Produto nao encontrado.' });
      }

      await pool.query(
        `
          UPDATE products
          SET is_featured = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [isFeatured ? 1 : 0, productId]
      );

      const updated = await fetchProductById(productId);
      return res.status(200).json({
        message: isFeatured ? 'Produto marcado como destaque.' : 'Destaque removido do produto.',
        product: updated ? normalizeProductRow(updated) : null,
      });
    } catch (_error) {
      return res.status(500).json({ message: 'Erro ao atualizar destaque do produto.' });
    }
  });
}

module.exports = adminProductsApi;
