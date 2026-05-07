function menuApi(app) {
  app.get('/api/menu', (_req, res) => {
    return res.status(200).json({
      items: [
        {
          id: 1,
          category: 'combos',
          name: 'Combo Smash + Fritas + Refri',
          description: 'Factory Smash, fritas medias e refrigerante lata.',
          price: 44.9,
          imageUrl: 'https://images.unsplash.com/photo-1561758033-d89a9ad46330?auto=format&fit=crop&w=900&q=80',
        },
        {
          id: 2,
          category: 'combos',
          name: 'Combo Bacon + Fritas + Refri',
          description: 'Bacon Machine, fritas medias e refrigerante lata.',
          price: 49.9,
          imageUrl: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?auto=format&fit=crop&w=900&q=80',
        },
        {
          id: 3,
          category: 'hamburgueres',
          name: 'Factory Smash',
          description: 'Pao brioche, smash burger, cheddar, picles e molho da casa.',
          price: 29.9,
          imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80',
        },
        {
          id: 4,
          category: 'hamburgueres',
          name: 'Bacon Machine',
          description: 'Blend 180g, queijo prato, bacon crocante e cebola caramelizada.',
          price: 34.9,
          imageUrl: 'https://images.unsplash.com/photo-1550317138-10000687a72b?auto=format&fit=crop&w=900&q=80',
        },
        {
          id: 5,
          category: 'hamburgueres',
          name: 'Cheese Volcano',
          description: 'Burger 160g, cheddar duplo, cebola crispy e molho especial.',
          price: 36.9,
          imageUrl: 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?auto=format&fit=crop&w=900&q=80',
        },
        {
          id: 6,
          category: 'hamburgueres',
          name: 'Veggie Press',
          description: 'Burger vegetal, alface, tomate, queijo e maionese de ervas.',
          price: 32.9,
          imageUrl: 'https://images.unsplash.com/photo-1525059696034-4967a8e1dca2?auto=format&fit=crop&w=900&q=80',
        },
        {
          id: 7,
          category: 'fritas',
          name: 'Fritas Tradicional',
          description: 'Porcao media de fritas crocantes com sal especial.',
          price: 14.9,
          imageUrl: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=900&q=80',
        },
        {
          id: 8,
          category: 'fritas',
          name: 'Fritas Cheddar e Bacon',
          description: 'Fritas com cheddar cremoso e bacon em cubos.',
          price: 22.9,
          imageUrl: 'https://images.unsplash.com/photo-1518013431117-eb1465fa5752?auto=format&fit=crop&w=900&q=80',
        },
        {
          id: 9,
          category: 'bebidas',
          name: 'Refrigerante Lata',
          description: 'Coca-Cola, Guarana ou Sprite (350ml).',
          price: 7.9,
          imageUrl: 'https://images.unsplash.com/photo-1581636625402-29b2a704ef13?auto=format&fit=crop&w=900&q=80',
        },
        {
          id: 10,
          category: 'bebidas',
          name: 'Suco Natural',
          description: 'Laranja ou limonada (400ml).',
          price: 11.9,
          imageUrl: 'https://images.unsplash.com/photo-1621263764928-df1444c5e859?auto=format&fit=crop&w=900&q=80',
        },
        {
          id: 11,
          category: 'bebidas',
          name: 'Agua Mineral',
          description: 'Agua sem gas (500ml).',
          price: 4.9,
          imageUrl: 'https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=900&q=80',
        },
      ],
    });
  });
}

module.exports = menuApi;
