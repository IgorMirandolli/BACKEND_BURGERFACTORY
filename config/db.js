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

  const [phoneColumn] = await pool.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'fone'
  `);

  if (phoneColumn.length === 0) {
    await pool.query('ALTER TABLE users ADD COLUMN fone VARCHAR(20) NULL AFTER email');
  }

  const [birthDateColumn] = await pool.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'birth_date'
  `);

  if (birthDateColumn.length === 0) {
    await pool.query('ALTER TABLE users ADD COLUMN birth_date DATE NULL AFTER fone');
  }

  const [genderColumn] = await pool.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'gender'
  `);

  if (genderColumn.length === 0) {
    await pool.query('ALTER TABLE users ADD COLUMN gender VARCHAR(30) NULL AFTER birth_date');
  }

  const [avatarColumn] = await pool.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'avatar_url'
  `);

  if (avatarColumn.length === 0) {
    await pool.query('ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500) NULL AFTER gender');
  }

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
}

module.exports = {
  pool,
  initDb,
};
