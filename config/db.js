const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
});

async function columnExists(tableName, columnName) {
  const [rows] = await pool.query(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1
    `,
    [tableName, columnName]
  );

  return rows.length > 0;
}

async function addColumnIfMissing(tableName, columnName, columnDefinition) {
  if (await columnExists(tableName, columnName)) {
    return;
  }

  await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
}

async function indexExists(tableName, indexName) {
  const [rows] = await pool.query(
    `
      SELECT INDEX_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
      LIMIT 1
    `,
    [tableName, indexName]
  );

  return rows.length > 0;
}

async function addIndexIfMissing(tableName, indexName, indexDefinition) {
  if (await indexExists(tableName, indexName)) {
    return;
  }

  await pool.query(`ALTER TABLE ${tableName} ADD ${indexDefinition}`);
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(160) NOT NULL UNIQUE,
      fone VARCHAR(20) NULL,
      birth_date DATE NULL,
      gender VARCHAR(30) NULL,
      avatar_url VARCHAR(500) NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(30) NOT NULL DEFAULT 'customer',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await addColumnIfMissing('users', 'fone', 'VARCHAR(20) NULL AFTER email');
  await addColumnIfMissing('users', 'birth_date', 'DATE NULL AFTER fone');
  await addColumnIfMissing('users', 'gender', 'VARCHAR(30) NULL AFTER birth_date');
  await addColumnIfMissing('users', 'avatar_url', 'VARCHAR(500) NULL AFTER gender');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      slug VARCHAR(120) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      is_active TINYINT UNSIGNED NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_categories_slug (slug)
    )
  `);

  await addColumnIfMissing('categories', 'sort_order', 'INT NOT NULL DEFAULT 0 AFTER slug');
  await addColumnIfMissing('categories', 'is_active', 'TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER sort_order');
  await addIndexIfMissing('categories', 'uq_categories_slug', 'UNIQUE KEY uq_categories_slug (slug)');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      category_id INT NOT NULL,
      name VARCHAR(150) NOT NULL,
      description TEXT NULL,
      price DECIMAL(10,2) NOT NULL,
      image_url TEXT NULL,
      is_available TINYINT UNSIGNED NOT NULL DEFAULT 1,
      is_featured TINYINT UNSIGNED NOT NULL DEFAULT 0,
      display_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_products_category_id (category_id),
      INDEX idx_products_is_available (is_available),
      INDEX idx_products_is_featured (is_featured),
      CONSTRAINT fk_products_category
        FOREIGN KEY (category_id) REFERENCES categories(id)
        ON DELETE RESTRICT
    )
  `);

  await addColumnIfMissing('products', 'is_available', 'TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER image_url');
  await addColumnIfMissing('products', 'is_featured', 'TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER is_available');
  await addColumnIfMissing('products', 'display_order', 'INT NOT NULL DEFAULT 0 AFTER is_featured');
  await addIndexIfMissing('products', 'idx_products_category_id', 'INDEX idx_products_category_id (category_id)');
  await addIndexIfMissing('products', 'idx_products_is_available', 'INDEX idx_products_is_available (is_available)');
  await addIndexIfMissing('products', 'idx_products_is_featured', 'INDEX idx_products_is_featured (is_featured)');

  await pool.query(`
    INSERT INTO categories (name, slug, sort_order, is_active)
    VALUES
      ('Combos', 'combos', 1, 1),
      ('Hamburgueres', 'hamburgueres', 2, 1),
      ('Fritas', 'fritas', 3, 1),
      ('Bebidas', 'bebidas', 4, 1),
      ('Sobremesas', 'sobremesas', 5, 1)
    ON DUPLICATE KEY UPDATE
      sort_order = VALUES(sort_order),
      is_active = is_active
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_addresses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      label VARCHAR(80) NULL,
      cep VARCHAR(20) NOT NULL,
      street VARCHAR(160) NOT NULL,
      address_number VARCHAR(30) NOT NULL,
      complement VARCHAR(120) NULL,
      district VARCHAR(120) NULL,
      city VARCHAR(120) NOT NULL,
      state VARCHAR(40) NOT NULL,
      is_default TINYINT UNSIGNED NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_user_addresses_user_id (user_id),
      CONSTRAINT fk_user_addresses_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS carts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      session_id VARCHAR(120) NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'active',
      checkout_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_carts_user_status (user_id, status),
      INDEX idx_carts_session_status (session_id, status),
      CONSTRAINT fk_carts_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE SET NULL
    )
  `);

  await addColumnIfMissing('carts', 'session_id', 'VARCHAR(120) NULL AFTER user_id');
  await addColumnIfMissing('carts', 'status', 'VARCHAR(30) NOT NULL DEFAULT \'active\' AFTER session_id');
  await addColumnIfMissing('carts', 'checkout_at', 'TIMESTAMP NULL DEFAULT NULL AFTER status');
  await addIndexIfMissing('carts', 'idx_carts_user_status', 'INDEX idx_carts_user_status (user_id, status)');
  await addIndexIfMissing(
    'carts',
    'idx_carts_session_status',
    'INDEX idx_carts_session_status (session_id, status)'
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cart_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cart_id INT NOT NULL,
      product_id INT NOT NULL,
      quantity INT UNSIGNED NOT NULL DEFAULT 1,
      unit_price DECIMAL(10,2) NOT NULL,
      notes VARCHAR(500) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_cart_items_cart_product (cart_id, product_id),
      INDEX idx_cart_items_cart_id (cart_id),
      CONSTRAINT fk_cart_items_cart
        FOREIGN KEY (cart_id) REFERENCES carts(id)
        ON DELETE CASCADE
    )
  `);

  await addColumnIfMissing('cart_items', 'notes', 'VARCHAR(500) NULL AFTER unit_price');
  await addIndexIfMissing(
    'cart_items',
    'uq_cart_items_cart_product',
    'UNIQUE KEY uq_cart_items_cart_product (cart_id, product_id)'
  );
  await addIndexIfMissing('cart_items', 'idx_cart_items_cart_id', 'INDEX idx_cart_items_cart_id (cart_id)');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      session_id VARCHAR(120) NULL,
      cart_id INT NULL,
      idempotency_key VARCHAR(80) NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'pending',
      total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      customer_name VARCHAR(160) NOT NULL,
      customer_phone VARCHAR(30) NULL,
      delivery_address TEXT NOT NULL,
      payment_method VARCHAR(60) NOT NULL,
      notes TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_orders_idempotency_key (idempotency_key),
      INDEX idx_orders_user_created (user_id, created_at),
      INDEX idx_orders_session_created (session_id, created_at),
      INDEX idx_orders_cart_id (cart_id),
      CONSTRAINT fk_orders_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE SET NULL
    )
  `);

  await addColumnIfMissing('orders', 'cart_id', 'INT NULL AFTER session_id');
  await addColumnIfMissing('orders', 'idempotency_key', 'VARCHAR(80) NULL AFTER cart_id');
  await addColumnIfMissing('orders', 'customer_phone', 'VARCHAR(30) NULL AFTER customer_name');
  await addColumnIfMissing('orders', 'notes', 'TEXT NULL AFTER payment_method');
  await addIndexIfMissing(
    'orders',
    'uq_orders_idempotency_key',
    'UNIQUE KEY uq_orders_idempotency_key (idempotency_key)'
  );
  await addIndexIfMissing('orders', 'idx_orders_user_created', 'INDEX idx_orders_user_created (user_id, created_at)');
  await addIndexIfMissing(
    'orders',
    'idx_orders_session_created',
    'INDEX idx_orders_session_created (session_id, created_at)'
  );
  await addIndexIfMissing('orders', 'idx_orders_cart_id', 'INDEX idx_orders_cart_id (cart_id)');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      product_id INT NOT NULL,
      product_name VARCHAR(160) NULL,
      product_image_url VARCHAR(255) NULL,
      quantity INT UNSIGNED NOT NULL,
      unit_price DECIMAL(10,2) NOT NULL,
      notes VARCHAR(500) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_order_items_order_id (order_id),
      CONSTRAINT fk_order_items_order
        FOREIGN KEY (order_id) REFERENCES orders(id)
        ON DELETE CASCADE
    )
  `);

  await addColumnIfMissing('order_items', 'product_name', 'VARCHAR(160) NULL AFTER product_id');
  await addColumnIfMissing('order_items', 'product_image_url', 'VARCHAR(255) NULL AFTER product_name');
  await addColumnIfMissing('order_items', 'notes', 'VARCHAR(500) NULL AFTER unit_price');
  await addIndexIfMissing(
    'order_items',
    'idx_order_items_order_id',
    'INDEX idx_order_items_order_id (order_id)'
  );
}

module.exports = {
  pool,
  initDb,
};
