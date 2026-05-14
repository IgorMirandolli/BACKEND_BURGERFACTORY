const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const { authMiddleware } = require('../../config/middlewares');
const { pool } = require('../../config/db');

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

function normalizePhone(rawPhone) {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length < 10 || digits.length > 11) return null;
  return digits;
}

function normalizeBirthDate(rawBirthDate) {
  if (!rawBirthDate) return null;

  const value = String(rawBirthDate).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(timestamp)) return null;

  return value;
}

async function findUserById(userId) {
  const [rows] = await pool.query(
    `
      SELECT id, name, email, fone, birth_date, gender, role, created_at
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [userId]
  );

  return rows[0];
}

function profileApi(app) {
  app.get('/api/profile', authMiddleware, async (req, res) => {
    try {
      const user = await findUserById(req.user.id);
      if (!user) {
        return res.status(404).json({ message: 'Usuario nao encontrado.' });
      }

      return res.status(200).json({ user });
    } catch (_error) {
      return res.status(500).json({ message: 'Erro ao carregar perfil.' });
    }
  });

  app.put('/api/profile', authMiddleware, async (req, res) => {
    try {
      const { name, email, fone, phone, birth_date: birthDate, gender } = req.body;
      const rawPhone = fone || phone || '';

      if (!name || !email) {
        return res.status(400).json({ message: 'name e email sao obrigatorios.' });
      }

      const normalizedName = String(name).trim();
      if (normalizedName.length < 3) {
        return res.status(400).json({ message: 'name invalido. Informe ao menos 3 caracteres.' });
      }

      const normalizedEmail = String(email).toLowerCase().trim();
      if (!isValidEmail(normalizedEmail)) {
        return res.status(400).json({
          message:
            'Email invalido. Use um provedor permitido: gmail, outlook, hotmail, live, icloud ou yahoo.',
        });
      }

      const normalizedPhone = normalizePhone(rawPhone);
      if (rawPhone && !normalizedPhone) {
        return res.status(400).json({ message: 'fone invalido. Informe DDD + numero com 10 ou 11 digitos.' });
      }

      const normalizedBirthDate = normalizeBirthDate(birthDate);
      if (birthDate && !normalizedBirthDate) {
        return res.status(400).json({ message: 'Data de nascimento invalida. Use o formato YYYY-MM-DD.' });
      }

      const normalizedGender = gender ? String(gender).trim().slice(0, 30) : null;

      const [emailRows] = await pool.query(
        'SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1',
        [normalizedEmail, req.user.id]
      );
      if (emailRows[0]) {
        return res.status(409).json({ message: 'Email ja cadastrado.' });
      }

      await pool.query(
        `
          UPDATE users
          SET name = ?, email = ?, fone = ?, birth_date = ?, gender = ?
          WHERE id = ?
        `,
        [normalizedName, normalizedEmail, normalizedPhone, normalizedBirthDate, normalizedGender, req.user.id]
      );

      const user = await findUserById(req.user.id);
      return res.status(200).json({ message: 'Perfil atualizado com sucesso.', user });
    } catch (_error) {
      return res.status(500).json({ message: 'Erro ao atualizar perfil.' });
    }
  });

  app.put('/api/profile/password', authMiddleware, async (req, res) => {
    try {
      const {
        current_password: currentPassword,
        new_password: newPassword,
        confirm_new_password: confirmNewPassword,
      } = req.body;

      if (!currentPassword || !newPassword || !confirmNewPassword) {
        return res.status(400).json({
          message: 'current_password, new_password e confirm_new_password sao obrigatorios.',
        });
      }

      if (String(newPassword).length < 6) {
        return res.status(400).json({ message: 'A nova senha precisa ter no minimo 6 caracteres.' });
      }

      if (newPassword !== confirmNewPassword) {
        return res.status(400).json({ message: 'A confirmacao da senha nao confere.' });
      }

      const [rows] = await pool.query(
        'SELECT id, password_hash FROM users WHERE id = ? LIMIT 1',
        [req.user.id]
      );
      const dbUser = rows[0];

      if (!dbUser) {
        return res.status(404).json({ message: 'Usuario nao encontrado.' });
      }

      const validPassword = await bcrypt.compare(currentPassword, dbUser.password_hash);
      if (!validPassword) {
        return res.status(401).json({ message: 'Senha atual incorreta.' });
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, req.user.id]);

      return res.status(200).json({ message: 'Senha alterada com sucesso.' });
    } catch (_error) {
      return res.status(500).json({ message: 'Erro ao alterar senha.' });
    }
  });

  app.delete('/api/profile', authMiddleware, async (req, res) => {
    try {
      const [userRows] = await pool.query('SELECT id FROM users WHERE id = ? LIMIT 1', [req.user.id]);
      if (!userRows[0]) {
        return res.status(404).json({ message: 'Usuario nao encontrado.' });
      }

      const randomSecret = crypto.randomUUID();
      const anonymizedPasswordHash = await bcrypt.hash(randomSecret, 10);
      const anonymizedEmail = `deleted_${req.user.id}_${Date.now()}@deleted.local`;

      try {
        await pool.query('UPDATE carts SET user_id = NULL WHERE user_id = ?', [req.user.id]);
      } catch {
        // Ignore when the table does not exist or does not have user_id.
      }

      try {
        await pool.query('UPDATE orders SET user_id = NULL WHERE user_id = ?', [req.user.id]);
      } catch {
        // Ignore when the table does not exist or does not have user_id.
      }

      await pool.query(
        `
          UPDATE users
          SET
            name = ?,
            email = ?,
            fone = NULL,
            birth_date = NULL,
            gender = NULL,
            password_hash = ?
          WHERE id = ?
        `,
        ['Conta removida', anonymizedEmail, anonymizedPasswordHash, req.user.id]
      );

      return res.status(200).json({ message: 'Conta excluida com sucesso.' });
    } catch (_error) {
      return res.status(500).json({ message: 'Erro ao excluir conta.' });
    }
  });
}

module.exports = profileApi;
