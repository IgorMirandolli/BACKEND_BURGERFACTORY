# 🍔 Burger Factory — Backend API

<p align="center">
  <img src="./public/logoburguerfactory.png" width="260" alt="Burger Factory Logo" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-22+-339933?logo=node.js" />
  <img src="https://img.shields.io/badge/Express-5.x-000000?logo=express" />
  <img src="https://img.shields.io/badge/MySQL-8+-4479A1?logo=mysql" />
  <img src="https://img.shields.io/badge/API-REST-orange" />
  <img src="https://img.shields.io/badge/Status-Em%20desenvolvimento-yellow" />
</p>

<p align="center">
  🇧🇷 Português
</p>

---

API REST da **Burger Factory**, responsável por autenticação de usuários, gerenciamento de cardápio e integração com banco de dados MySQL.

O projeto foi desenvolvido utilizando **Node.js + Express**, seguindo uma estrutura organizada e preparada para expansão futura.

---

# 🚀 Tecnologias utilizadas

- Node.js
- Express
- MySQL (`mysql2`)
- JWT (`jsonwebtoken`)
- Bcrypt (`bcryptjs`)
- Dotenv
- CORS

---

# 📋 Requisitos

Antes de iniciar, você precisa ter instalado:

- Node.js 18+
- MySQL 8+

---

# ⚙️ Instalação

Clone o repositório:

```bash
git clone https://github.com/SEU_USUARIO/burger-factory-backend.git
```

Acesse a pasta:

```bash
cd backend
```

Instale as dependências:

```bash
npm install
```

---

# 🔐 Variáveis de ambiente

O projeto utiliza um arquivo chamado:

```text
env
```

Crie esse arquivo na raiz do backend:

```env
PORT=3000

JWT_SECRET=troque_esta_chave
JWT_EXPIRES_IN=7d

DB_HOST=localhost
DB_PORT=3306
DB_NAME=burger_factory
DB_USER=root
DB_PASSWORD=sua_senha
```

---

# ▶️ Executando o projeto

## 🔹 Desenvolvimento

```bash
npm run dev
```

---

## 🔹 Produção/local

```bash
npm start
```

Servidor rodando em:

```text
http://localhost:3000
```

---

# ❤️ Healthcheck

```http
GET /health
```

Resposta esperada:

```json
{
  "status": "ok"
}
```

---

# 📁 Estrutura do projeto

```text
backend/
│
├── api/
│   ├── auth/
│   │   ├── auth.js
│   │   ├── verify.js
│   │   └── revalidate.js
│   │
│   └── menu/
│       └── menu.js
│
├── config/
│   ├── db.js
│   ├── middlewares.js
│   ├── passport.js
│   └── routes.js
│
├── index.js
└── env
```

---

# 🗄️ Banco de dados

## 👤 Tabela `users`

A tabela `users` é criada automaticamente ao iniciar o backend.

---

# 🍔 Estrutura do cardápio

O endpoint:

```http
GET /api/menu
```

utiliza as tabelas:

- `categories`
- `products`

---

# 📦 Tabela `categories`

```sql
CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(120) NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

# 🍟 Tabela `products`

```sql
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  name VARCHAR(160) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  image_url VARCHAR(255),
  is_available TINYINT(1) NOT NULL DEFAULT 1,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_products_category
    FOREIGN KEY (category_id)
    REFERENCES categories(id)
);
```

---

# 🔗 Endpoints

## 🌐 Base URL local

```text
http://localhost:3000
```

---

# 🔐 Autenticação

## ✅ Registrar usuário

### `POST /api/auth/register`

Cria um usuário com role padrão:

```text
customer
```

---

### Body

```json
{
  "name": "Igor",
  "email": "igor@email.com",
  "password": "123456"
}
```

---

### Resposta

```json
{
  "user": {
    "id": 1,
    "name": "Igor",
    "email": "igor@email.com",
    "role": "customer"
  },
  "token": "<jwt>"
}
```

---

# 🔑 Login

## `POST /api/auth/login`

### Body

```json
{
  "email": "igor@email.com",
  "password": "123456"
}
```

Retorna um token JWT válido.

---

# 🔍 Verificar token

## `GET /api/auth/verify`

### Header

```http
Authorization: Bearer <jwt>
```

---

# ♻️ Revalidar token

## `GET /api/auth/revalidate`

Gera um novo token baseado no token atual.

### Header

```http
Authorization: Bearer <jwt>
```

---

# 👑 Rota protegida para admin

## `GET /api/auth/admin-only`

### Header

```http
Authorization: Bearer <jwt>
```

---

# 🍔 Cardápio

## 📋 Buscar menu

### `GET /api/menu`

Retorna produtos agrupados pelas categorias.

Ordenação utilizada:

1. `categories.sort_order`
2. `products.id`

---

## ✅ Exemplo de resposta

```json
{
  "items": [
    {
      "id": 1,
      "category": "combos",
      "name": "Combo Smash + Fritas + Refri",
      "description": "Factory Smash, fritas médias e refrigerante lata.",
      "price": "44.90",
      "imageUrl": "/menu/combo-smash-fritas-refri.webp"
    }
  ]
}
```

---

# 🖼️ Imagens do cardápio

No banco:

```text
menu/factory-smash.webp
```

O backend normaliza automaticamente para:

```text
/menu/factory-smash.webp
```

No frontend, os arquivos devem existir em:

```text
public/menu/
```

---

# 🔐 Fluxo de autenticação

1. Fazer login:

```http
POST /api/auth/login
```

2. Salvar o token JWT

3. Enviar o token nas rotas protegidas:

```http
Authorization: Bearer <token>
```

---

# ⚠️ Erros comuns

| Erro | Motivo |
|---|---|
| `Token nao informado.` | Header Authorization ausente |
| `Token invalido ou expirado.` | JWT inválido ou expirado |
| `Credenciais invalidas.` | Email ou senha incorretos |
| `Erro ao carregar cardapio.` | Problema nas tabelas ou dados |

---

# 📜 Scripts disponíveis

| Script | Descrição |
|---|---|
| `npm start` | Inicia o servidor |
| `npm run dev` | Inicia em modo desenvolvimento |

---

# 🚀 Próximos passos

- CRUD administrativo
- Upload de imagens
- Carrinho de compras
- Sistema de pedidos
- Integração com pagamentos
- Dashboard admin
- Logs e monitoramento
- Testes automatizados
- Deploy em produção

---

# 📄 Licença

Este projeto está sob a licença MIT.

---

# 👨‍💻 Desenvolvedor

Desenvolvido por **Igor Mirandolli**

[![GitHub](https://img.shields.io/badge/IgorMirandolli-181717?style=flat&logo=github)](https://github.com/IgorMirandolli)

---

# 🍔 Burger Factory

> Feito para satisfazer.
