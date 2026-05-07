function menuApi(app) {
  app.get('/api/menu', (_req, res) => {
    return res.status(200).json({
      items: [
        {
          id: 1,
          name: 'Factory Smash',
          description: 'Pao brioche, smash burger, cheddar, picles e molho da casa.',
          price: 29.9,
        },
        {
          id: 2,
          name: 'Bacon Machine',
          description: 'Blend 180g, queijo prato, bacon crocante e cebola caramelizada.',
          price: 34.9,
        },
        {
          id: 3,
          name: 'Veggie Press',
          description: 'Burger vegetal, alface, tomate, queijo e maionese de ervas.',
          price: 31.9,
        },
        {
          id: 4,
          name: 'Combo Fritas + Refri',
          description: 'Porcao media de fritas sequinhas e refrigerante lata.',
          price: 18.9,
        },
      ],
    });
  });
}

module.exports = menuApi;
