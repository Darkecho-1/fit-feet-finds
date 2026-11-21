const entries = [
  ['shox-blue', 'Nike', 'Shox TL', 'Celestine Blue', 13990, 1045, '41 42 43 44 45', 'Глубокий синий и характерные пружины Shox по всей длине подошвы.', 3],
  ['air-force', 'Nike', 'Air Force 1 Low', 'Houseflies', 11990, 1051, '41 42 43 44 45', 'Светлая пара с вышитыми деталями. Низкий силуэт Air Force 1.', 3],
  ['air-max', 'Nike', 'Air Max Plus TN', 'Rebellious Air', 13990, 1034, '41 42 43 44 45', 'Контрастный градиент и волнообразные линии верха.', 3],
  ['jordan', 'Jordan', 'Air Jordan 1 Low', 'Midnight Navy', 12990, 1020, '41 42 43 44 45 46', 'Низкие Jordan в тёмно-синей, серой и белой расцветке.', 3],
  ['timberland-wheat', 'Timberland', '6-Inch Premium', 'Wheat Nubuck', 14990, 1061, '41 42 43 44 45 46', 'Классические водонепроницаемые ботинки 6-Inch в пшеничной расцветке.', 2],
  ['shox-sail', 'Nike', 'Shox TL', 'Sail Cream', 13990, 1045, '41 42 43 44 45', 'Молочный верх, серебристые вставки и полноразмерная подошва Shox.', 3],
  ['cloudtilt', 'On', 'Cloudtilt', 'Black Ivory', 19990, 1007, '41 42 43 44 45 46', 'Лёгкий силуэт на массивной амортизирующей подошве.', 3],
  ['timberland-black', 'Timberland', '6-Inch Premium', 'Black Nubuck', 14990, 1061, '41 42 43 44 45 46', 'Водонепроницаемая модель 6-Inch в чёрном нубуке.', 2],
  ['dunk-navy', 'Nike', 'Dunk Low', 'Vintage Navy', 10900, 1060, '41 42 43 44 45 46', 'Тёмно-синяя пара из подборки Last Sizes.', 1, 13900],
  ['af-central', 'Nike', 'Air Force 1 Low × Central Cee', 'Grey', 11990, 1051, '41 42 43 44 45', 'Контрастная расцветка и совместный выпуск с Central Cee.', 3],
  ['af-pegasus', 'Nike', 'Air Force 1 Low PRM', 'Pegasus', 11990, 1051, '41 42 43 44 45', 'Молочная пара с вышитым пегасом.', 3],
  ['tn-psg', 'Nike', 'Air Max Plus TN × PSG', 'Grey', 13990, 1034, '41 42 43 44 45', 'Air Max Plus в графитовой расцветке из коллаборации с PSG.', 3],
  ['tn-lime', 'Nike', 'Air Max Plus TN', 'Liquid Lime', 13990, 1034, '41 42 43 44 45', 'Чёрный верх с яркими лаймовыми вставками.', 3],
  ['on-ultra', 'On', 'Cloudtilt', 'Ultramarine Eclipse', 19990, 1007, '41 42 43 44 45 46', 'Светлый верх с ультрамариновыми акцентами и тёмной подошвой.', 3],
  ['asics-blue', 'ASICS', 'GEL-NYC', 'Arctic Sky', 11990, 962, '37.5 38 39 40 41 42 43 44 45', 'Светло-синяя сетка, серебристые вставки и многослойная подошва.', 3],
  ['asics-grey', 'ASICS', 'GEL-NYC', 'Ivy / Smoke Grey', 11990, 962, '37.5 38 39 40 41 42 43 44 45', 'Серые и приглушённо-зелёные панели на светлой подошве.', 3],
  ['nb-black', 'New Balance', '1906A', 'Future Black', 11990, 971, '41 42 43 44 45', 'Монохромная расцветка с рельефной подошвой 1906A.', 3],
  ['nb-blue', 'New Balance', '1906A', 'Future Blue', 11990, 974, '41 42 43 44 45', 'Многослойный верх и металлические детали в холодных оттенках.', 3],
  ['af-black', 'Nike', 'Air Force 1 Mid', 'Triple Black', 11990, 1025, '41 42 43 44 45', 'Чёрные Air Force с высокой посадкой и ремешком.', 3],
  ['am90-white', 'Nike', 'Air Max 90', 'Full White', 11990, 1028, '41 42 43 44 45', 'Белые Air Max 90 с видимой вставкой Air в пятке.', 3],
  ['dunk-raspberry', 'Nike SB', 'Dunk Low', 'Blue Raspberry', 11900, 1060, '43 44', 'Ярко-синие Dunk из подборки Last Sizes.', 1, 14900],
  ['dunk-green', 'Nike', 'Dunk Low', 'Green Glow', 9990, 1060, '37.5 38 40', 'Белые Dunk с мятными панелями из подборки Last Sizes.', 1, 12900],
  ['af-wheat', 'Nike', 'Air Force 1 Low', 'Wheat', 8900, 1060, '41', 'Пшеничная расцветка Air Force из подборки Last Sizes.', 1, 11900],
  ['af-time', 'Nike', 'Air Force 1 Low', 'Test of Time', 10900, 1060, '41', 'Светлая пара с контрастными деталями из подборки Last Sizes.', 1, 15900],
  ['af-team', 'Nike', 'Air Force 1 Low', 'Team Red', 7900, 1060, '41', 'Белые Air Force с красным Swoosh из подборки Last Sizes.', 1, 11900],
  ['p6000', 'Nike', 'P-6000', 'Silver / White', 9990, 999, '41 42 43 44 45', 'Беговой силуэт Nike с многослойным верхом.', 1],
];

export function seedAssortment(store, drafts = false) {
  if (store.get('SELECT id FROM products LIMIT 1')) return;
  for (const entry of [...entries].reverse()) {
    const [id, brand, name, color, price, post, sizes, description, count, oldPrice = 0] = entry;
    store.saveProduct(id, {
      brand, name, color, price, oldPrice, description,
      post: `https://t.me/fit_feet_finds/${post}`,
      category: brand === 'Timberland' ? 'Ботинки' : 'Кроссовки',
      condition: 'Новые, оригинал',
      measurements: 'Напишите менеджеру, чтобы уточнить длину стельки для вашего размера.',
      images: ['', '-side', '-back'].slice(0, count).map(suffix => `/assets/${id}${suffix}.jpg`),
      status: drafts || id === 'p6000' ? 'draft' : 'published',
      variants: sizes.split(' ').map((size, index) => ({
        size, stock: drafts ? 0 : oldPrice ? 1 : [1, 2, 3, 2, 1, 1][index % 6],
      })),
    }, true);
  }
  const now = Date.now();
  for (const [index, [id]] of entries.entries()) store.run('UPDATE products SET updated=?,sort_at=? WHERE id=?', now - index, now - index, id);
}

export function seedDemo(store) {
  seedAssortment(store);
  store.saveDrop({ mode: 'manual', productId: 'timberland-wheat' });
  store.register({ id: 100001, first_name: 'Алекс', visit: true });
  store.register({ id: 100002, first_name: 'Даниил', last_name: 'К.', username: 'fitfeet_demo' }, { visit: true });
  const customers = [['Мария В.', 'fff_demo_maria'], ['Антон С.', ''], ['Кирилл М.', 'fff_demo_kirill']];
  for (const [index, [name, username]] of customers.entries()) {
    const user = store.register({ id: 200001 + index, first_name: name, username });
    const product = store.products().find(p => p.id === ['shox-blue', 'air-force', 'jordan'][index]);
    const order = store.createOrder(user.id, {
      request: `demo-fixture-order-${index}`, items: [{ variant: product.variants[index + 1].id, quantity: 1 }],
      delivery: 'cdek', total: product.price + 490, address: 'Москва',
    });
    if (index < 2) store.updateOrder(order.id, { status: 'confirmed' });
    if (index === 0) {
      store.updateOrder(order.id, { status: 'packed' });
      store.updateOrder(order.id, { status: 'delivered' });
    }
  }
}
