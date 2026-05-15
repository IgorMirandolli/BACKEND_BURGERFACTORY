const bcrypt = require('bcryptjs');

const { pool } = require('../../config/db');
const { generateToken } = require('../../config/passport');

const ALLOWED_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'icloud.com',
  'yahoo.com',
  'yahoo.com.br',
]);

function isValidEmail(rawEmail) {
  if (!rawEmail || rawEmail.includes(' ')) return false;

  const normalized = String(rawEmail).toLowerCase().trim();
  const formatOk = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized);
  if (!formatOk) return false;

  const domain = normalized.split('@')[1];
  return ALLOWED_EMAIL_DOMAINS.has(domain);
}

async function findUserByEmail(email) {
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  return rows[0];
}

function normalizePhone(rawPhone) {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 11) return null;
  return digits;
}

async function mergeGuestCartIntoUser(userId, rawGuestSessionId) {
  const guestSessionId = String(rawGuestSessionId || '').trim();
  if (!guestSessionId) return;

  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const [guestCartRows] = await connection.query(
      `
        SELECT id
        FROM carts
        WHERE session_id = ? AND status = 'active' AND user_id IS NULL
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE
      `,
      [guestSessionId]
    );
    const guestCart = guestCartRows[0];

    if (!guestCart) {
      await connection.commit();
      transactionStarted = false;
      return;
    }

    const [userCartRows] = await connection.query(
      `
        SELECT id
        FROM carts
        WHERE user_id = ? AND status = 'active'
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE
      `,
      [userId]
    );
    const userCart = userCartRows[0];

    if (!userCart) {
      await connection.query('UPDATE carts SET user_id = ?, session_id = NULL WHERE id = ?', [userId, guestCart.id]);
      await connection.commit();
      transactionStarted = false;
      return;
    }

    if (Number(userCart.id) === Number(guestCart.id)) {
      await connection.query('UPDATE carts SET session_id = NULL WHERE id = ?', [userCart.id]);
      await connection.commit();
      transactionStarted = false;
      return;
    }

    const [guestItems] = await connection.query(
      `
        SELECT product_id, quantity, unit_price, notes
        FROM cart_items
        WHERE cart_id = ?
        FOR UPDATE
      `,
      [guestCart.id]
    );

    for (const item of guestItems) {
      await connection.query(
        `
          INSERT INTO cart_items (cart_id, product_id, quantity, unit_price, notes)
          VALUES (?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            quantity = quantity + VALUES(quantity),
            unit_price = VALUES(unit_price),
            notes = COALESCE(VALUES(notes), notes)
        `,
        [userCart.id, item.product_id, item.quantity, item.unit_price, item.notes]
      );
    }

    await connection.query('DELETE FROM carts WHERE id = ?', [guestCart.id]);
    await connection.commit();
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // Preserve original merge error.
      }
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function createUser({ name, email, fone, passwordHash, role }) {
  const [result] = await pool.query(
    'INSERT INTO users (name, email, fone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    [name, email, fone, passwordHash, role]
  );

  return {
    id: result.insertId,
    name,
    email,
    fone,
    avatar_url: null,
    role,
  };
}

function authApi(app) {
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { name, email, password, fone, phone, session_id: guestSessionId } = req.body;
      const rawPhone = fone || phone;

      if (!name || !email || !password || !rawPhone) {
        return res.status(400).json({ message: 'name, email, password e fone sao obrigatorios.' });
      }

      const normalizedPhone = normalizePhone(rawPhone);
      if (!normalizedPhone) {
        return res.status(400).json({ message: 'fone invalido. Informe DDD + numero com 10 ou 11 digitos.' });
      }

      if (!isValidEmail(email)) {
        return res.status(400).json({
          message:
            'Email invalido. Use um provedor permitido: gmail, outlook, hotmail, live, icloud ou yahoo.',
        });
      }

      const exists = await findUserByEmail(email);
      if (exists) {
        return res.status(409).json({ message: 'Email ja cadastrado.' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await createUser({
        name,
        email,
        fone: normalizedPhone,
        passwordHash,
        role: 'customer',
      });

      if (guestSessionId) {
        try {
          await mergeGuestCartIntoUser(user.id, guestSessionId);
        } catch (error) {
          console.error('Erro ao mesclar carrinho de visitante no registro:', error.message);
        }
      }

      const token = generateToken(user);

      return res.status(201).json({ user, token });
    } catch (_error) {
      return res.status(500).json({ message: 'Erro interno ao registrar usuario.' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password, session_id: guestSessionId } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: 'email e password sao obrigatorios.' });
      }

      if (!isValidEmail(email)) {
        return res.status(400).json({
          message:
            'Email invalido. Use um provedor permitido: gmail, outlook, hotmail, live, icloud ou yahoo.',
        });
      }

      const user = await findUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: 'Credenciais invalidas.' });
      }

      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) {
        return res.status(401).json({ message: 'Credenciais invalidas.' });
      }

      if (guestSessionId) {
        try {
          await mergeGuestCartIntoUser(user.id, guestSessionId);
        } catch (error) {
          console.error('Erro ao mesclar carrinho de visitante no login:', error.message);
        }
      }

      const publicUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        fone: user.fone || null,
        avatar_url: user.avatar_url || null,
        role: user.role,
      };

      const token = generateToken(publicUser);
      return res.status(200).json({ user: publicUser, token });
    } catch (_error) {
      return res.status(500).json({ message: 'Erro interno ao fazer login.' });
    }
  });
}

module.exports = authApi;
