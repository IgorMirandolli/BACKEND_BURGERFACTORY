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
    role,
  };
}

function authApi(app) {
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { name, email, password, fone, phone } = req.body;
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
      const token = generateToken(user);

      return res.status(201).json({ user, token });
    } catch (_error) {
      return res.status(500).json({ message: 'Erro interno ao registrar usuario.' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;

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

      const publicUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        fone: user.fone || null,
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
