require('dotenv').config({ path: 'env' });
const express = require('express');
const cors = require('cors');
const path = require('path');

const { initDb } = require('./config/db');
const registerRoutes = require('./config/routes');

const app = express();

app.use(cors());
app.use(express.json({ limit: '8mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));
app.use('/menu', express.static(path.join(__dirname, 'public', 'menu')));

registerRoutes(app);

app.use((_req, res) => {
  res.status(404).json({ message: 'Rota nao encontrada.' });
});

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await initDb();
    app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
    });
  } catch (error) {
    console.error('Erro ao conectar no banco:', error.message);
    process.exit(1);
  }
}

start();
