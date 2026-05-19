const authApi = require('../api/auth/auth');
const verifyApi = require('../api/auth/verify');
const revalidateApi = require('../api/auth/revalidate');
const profileApi = require('../api/user/profile');
const menuApi = require('../api/menu/menu');
const cartApi = require('../api/cart/cart');
const ordersApi = require('../api/orders/orders');
const adminOrdersApi = require('../api/admin/orders');
const adminProductsApi = require('../api/admin/products');

function registerRoutes(app) {
  authApi(app);
  verifyApi(app);
  revalidateApi(app);
  profileApi(app);
  menuApi(app);
  cartApi(app);
  ordersApi(app);
  adminOrdersApi(app);
  adminProductsApi(app);

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });
}

module.exports = registerRoutes;
