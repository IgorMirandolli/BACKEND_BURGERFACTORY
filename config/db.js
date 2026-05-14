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
}

module.exports = {
  pool,
  initDb,
};
