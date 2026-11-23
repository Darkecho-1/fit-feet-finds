import { randomBytes, randomUUID } from 'node:crypto';
import { check, integer, photoUrl, telegramHandle, telegramId, text } from './security.mjs';

const defaultDrop = { mode: 'auto', productId: '', title: '', cover: '' };

export const initialSettings = {
  name: 'FIT FEET FINDS',
  manager: 'fit_feet_findss',
  channel: 'fit_feet_finds',
  about: 'Магазин оригинальной обуви из Европы. Работаем из Москвы и Могилёва, помогаем подобрать размер и привозим пары под заказ.',
  terms: 'После оформления менеджер подтвердит наличие и согласует оплату. Если нужна помощь с размером, напишите нам до заказа.',
  delivery: [
    { id: 'cdek', title: 'СДЭК Экспресс', detail: 'До пункта выдачи. Срок уточнит менеджер.', price: 490 },
    { id: 'pickup', title: 'Самовывоз', detail: 'Место и время согласует менеджер.', price: 0 },
  ],
};

const statusNames = {
  new: 'Новый', confirmed: 'Подтверждён', packed: 'Собран',
  shipped: 'В пути', delivered: 'Выдан', cancelled: 'Отменён',
};

const schema = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT NOT NULL DEFAULT '',
    photo TEXT NOT NULL DEFAULT '', reachable INTEGER NOT NULL DEFAULT 0,
    last_visit INTEGER, reminders INTEGER NOT NULL DEFAULT 1, last_reminder INTEGER
  );
  CREATE TABLE IF NOT EXISTS admins (id TEXT PRIMARY KEY);
  CREATE TABLE IF NOT EXISTS config (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY, value TEXT NOT NULL, status TEXT NOT NULL, updated INTEGER NOT NULL, sort_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS variants (
    id TEXT PRIMARY KEY, product TEXT NOT NULL REFERENCES products(id),
    size TEXT NOT NULL, stock INTEGER NOT NULL CHECK(stock>=0), enabled INTEGER NOT NULL DEFAULT 1,
    UNIQUE(product,size)
  );
  CREATE TABLE IF NOT EXISTS carts (
    user TEXT NOT NULL REFERENCES users(id), variant TEXT NOT NULL REFERENCES variants(id),
    quantity INTEGER NOT NULL CHECK(quantity>0), PRIMARY KEY(user,variant)
  );
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY, user TEXT NOT NULL REFERENCES users(id), request TEXT NOT NULL,
    value TEXT NOT NULL, status TEXT NOT NULL, created INTEGER NOT NULL, UNIQUE(user,request)
  );
  CREATE INDEX IF NOT EXISTS orders_created ON orders(created DESC);
  CREATE TABLE IF NOT EXISTS offline_sales (
    id TEXT PRIMARY KEY, user TEXT NOT NULL, product TEXT NOT NULL,
    variant TEXT NOT NULL, quantity INTEGER NOT NULL, price INTEGER NOT NULL,
    name TEXT NOT NULL, note TEXT NOT NULL, created INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT NOT NULL, message TEXT NOT NULL,
    app INTEGER NOT NULL, next INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, kind TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS manager_replies (
    manager TEXT NOT NULL, message INTEGER NOT NULL, buyer TEXT NOT NULL,
    PRIMARY KEY (manager, message)
  );
`;

const asProduct = (row) => ({ ...JSON.parse(row.value), id: row.id, status: row.status, updated: row.updated });
const asOrder = (row) => ({ ...JSON.parse(row.value), id: row.id, status: row.status, created: row.created });

function validateProduct(input) {
  check(input && Array.isArray(input.images) && input.images.length <= 8, 'Добавьте не более восьми фото');
  check(Array.isArray(input.variants) && input.variants.length > 0 && input.variants.length <= 40, 'Добавьте размеры и остатки');
  const variants = input.variants.map((v) => {
    const size = text(v?.size, 12, 'Размер', 1).replace(',', '.').toUpperCase();
    return { size, stock: integer(v?.stock, 0, 10000, 'Остаток') };
  });
  check(new Set(variants.map(v => v.size)).size === variants.length, 'У каждого размера должна быть одна строка');
  const status = input.status;
  check(['published', 'draft', 'archived'].includes(status), 'Укажите статус товара');
  const price = integer(input.price, 1, 10000000, 'Цена');
  const oldPrice = input.oldPrice ? integer(input.oldPrice, price + 1, 10000000, 'Старая цена') : 0;
  return {
    name: text(input.name, 100, 'Модель', 1),
    brand: text(input.brand, 40, 'Бренд', 1),
    color: text(input.color ?? '', 60, 'Расцветка'),
    category: text(input.category, 40, 'Категория', 1),
    description: text(input.description ?? '', 2000, 'Описание'),
    condition: text(input.condition ?? '', 80, 'Состояние'),
    measurements: text(input.measurements ?? '', 400, 'Замеры'),
    post: photoPost(input.post ?? ''),
    images: input.images.map(photoUrl),
    price, oldPrice, status, variants,
  };
}

function photoPost(value) {
  const clean = text(value, 150, 'Пост в Telegram');
  check(!clean || /^https:\/\/t\.me\/[a-zA-Z0-9_]+\/\d+$/.test(clean), 'Используйте ссылку на публикацию t.me');
  return clean;
}

function validateSettings(input) {
  check(Array.isArray(input?.delivery) && input.delivery.length > 0 && input.delivery.length <= 8, 'Добавьте от одного до восьми способов доставки');
  const delivery = input.delivery.map(d => {
    const id = text(d?.id, 36, 'Код доставки', 1);
    check(/^[a-z0-9-]+$/.test(id), 'Некорректный код доставки');
    return {
      id, title: text(d.title, 70, 'Название доставки', 1),
      detail: text(d.detail ?? '', 180, 'Условия доставки'),
      price: integer(d.price, 0, 100000, 'Стоимость доставки'),
    };
  });
  check(new Set(delivery.map(d => d.id)).size === delivery.length, 'Коды доставки должны быть уникальными');
  const manager = text(input.manager, 33, 'Менеджер в Telegram', 1);
  if (/^\d+$/.test(manager)) check(telegramId(manager), 'Укажите корректный Telegram ID менеджера');
  return {
    name: text(input.name, 50, 'Название', 1),
    manager: telegramId(manager) ? manager : telegramHandle(manager),
    channel: telegramHandle(input.channel),
    about: text(input.about, 1200, 'О магазине', 1),
    terms: text(input.terms, 1600, 'Условия заказа', 1),
    delivery,
  };
}

export class ShopStore {
  constructor(db, owner = '', notify = false) {
    this.db = db;
    this.owner = owner;
    this.notify = notify;
    this.db.exec(schema);
    this.run('INSERT OR IGNORE INTO config VALUES (1,?)', JSON.stringify(initialSettings));
  }

  run(sql, ...args) { return this.db.run(sql, ...args); }
  get(sql, ...args) { return this.db.get(sql, ...args); }
  all(sql, ...args) { return this.db.all(sql, ...args); }
  transaction(action) { return this.db.transaction(action); }

  role(id) {
    if (id && id === this.owner) return 'owner';
    return this.get('SELECT id FROM admins WHERE id=?', id) ? 'admin' : 'buyer';
  }

  actor(id) {
    const profile = this.get('SELECT id,name,username,photo,reachable,reminders FROM users WHERE id=?', id);
    check(profile, 'Откройте магазин заново', 401);
    return { ...profile, role: this.role(id) };
  }

  register(user, { visit = false, reachable = false } = {}) {
    const id = String(user.id);
    const name = [user.first_name, user.last_name].filter(v => typeof v === 'string').join(' ').trim().slice(0, 160) || 'Покупатель';
    const username = typeof user.username === 'string' && /^[a-zA-Z0-9_]{1,32}$/.test(user.username) ? user.username : '';
    const photo = typeof user.photo_url === 'string' && /^https:\/\/[^\s]+$/.test(user.photo_url) ? user.photo_url.slice(0, 1000) : '';
    this.run(`INSERT INTO users (id,name,username,photo,reachable,last_visit) VALUES (?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, username=excluded.username,
      photo=CASE WHEN ? THEN excluded.photo ELSE users.photo END,
      reachable=MAX(users.reachable,excluded.reachable), last_visit=COALESCE(excluded.last_visit,users.last_visit)`,
      id, name, username, photo, Number(reachable), visit ? Date.now() : null, Number(visit));
    if (visit) this.run("DELETE FROM outbox WHERE kind='reminder' AND user=?", id);
    if (reachable) this.run("UPDATE outbox SET next=? WHERE user=? AND kind!='reminder'", Date.now(), id);
    return this.actor(id);
  }

  settings() {
    const settings = { drop: { ...defaultDrop }, ...JSON.parse(this.get('SELECT value FROM config WHERE id=1').value) };
    if (!telegramId(settings.manager)) return settings;
    const managerUsername = this.get('SELECT username FROM users WHERE id=?', settings.manager)?.username ?? '';
    return { ...settings, managerUsername };
  }

  saveSettings(input) {
    const settings = validateSettings(input);
    this.run('UPDATE config SET value=json_patch(value,?) WHERE id=1', JSON.stringify(settings));
    return this.settings();
  }

  saveDrop(input) {
    check(['auto', 'manual', 'off'].includes(input.mode), 'Выберите, как показывать дроп');
    const drop = { ...defaultDrop, mode: input.mode };
    return this.transaction(() => {
      if (drop.mode === 'manual') {
        drop.productId = text(input.productId, 80, 'Товар дропа', 1);
        drop.title = text(input.title ?? '', 54, 'Заголовок');
        drop.cover = text(input.cover ?? '', 600, 'Фото обложки');
        const item = this.get(`SELECT p.value FROM products p WHERE p.id=? AND p.status='published' AND EXISTS (
          SELECT 1 FROM variants v WHERE v.product=p.id AND v.enabled=1 AND v.stock>0)`, drop.productId);
        check(item, 'Выберите опубликованный товар с остатком', 409);
        check(!drop.cover || JSON.parse(item.value).images.includes(drop.cover), 'Выберите фото из карточки товара', 409);
      }
      this.run("UPDATE config SET value=json_set(value,'$.drop',json(?)) WHERE id=1", JSON.stringify(drop));
      return drop;
    });
  }

  staffIds() { return [...new Set([this.owner, ...this.all('SELECT id FROM admins').map(a => a.id)].filter(Boolean))]; }

  team() {
    return this.staffIds().map(id => ({
      id, role: this.role(id),
      name: this.get('SELECT name FROM users WHERE id=?', id)?.name ?? '',
    }));
  }

  changeAdmin(id, remove) {
    check(/^\d{1,16}$/.test(id) && Number.isSafeInteger(Number(id)) && !/^0/.test(id), 'Укажите числовой Telegram ID');
    check(id !== this.owner, 'Роль владельца закреплена в настройках сервера');
    if (remove) {
      this.transaction(() => {
        this.run('DELETE FROM admins WHERE id=?', id);
        this.run("DELETE FROM outbox WHERE user=? AND kind IN ('staff','staff_order','reminder')", id);
      });
    } else this.run('INSERT OR IGNORE INTO admins VALUES (?)', id);
    return this.team();
  }

  products(staff = false) {
    const rows = staff ? this.all('SELECT * FROM products ORDER BY updated DESC, id') :
      this.all("SELECT * FROM products WHERE status='published' ORDER BY sort_at DESC, id");
    const variants = this.all('SELECT id,product,size,stock FROM variants WHERE enabled=1 ORDER BY CAST(size AS REAL), size');
    const grouped = Map.groupBy(variants, v => v.product);
    return rows.map(row => ({ ...asProduct(row), variants: grouped.get(row.id) ?? [] }));
  }

  saveProduct(id, input, seed = false) {
    const { variants, status, ...product } = validateProduct(input);
    const request = typeof input.request === 'string' && /^[a-f0-9-]{36}$/.test(input.request) ? input.request : '';
    const key = id || request || randomUUID();
    return this.transaction(() => {
      const existing = this.get('SELECT * FROM products WHERE id=?', key);
      check(!id || seed || existing, 'Товар не найден', 404);
      if (!id && existing) return this.products(true).find(p => p.id === key);
      const updated = Date.now();
      if (existing && !seed) check(input.updated === existing.updated, 'Товар уже изменился. Откройте карточку заново.', 409);
      const sortAt = existing?.status === 'published' && status === 'published' ? existing.sort_at : updated;
      this.run(`INSERT INTO products VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value, status=excluded.status,
        updated=MAX(products.updated+1,excluded.updated),sort_at=excluded.sort_at`, key, JSON.stringify(product), status, updated, sortAt);
      this.run('UPDATE variants SET enabled=0 WHERE product=?', key);
      for (const variant of variants) {
        this.run(`INSERT INTO variants (id,product,size,stock) VALUES (?,?,?,?)
          ON CONFLICT(product,size) DO UPDATE SET stock=excluded.stock,enabled=1`,
          randomUUID(), key, variant.size, variant.stock);
      }
      return this.products(true).find(p => p.id === key);
    });
  }

  archiveProduct(id) {
    const result = this.run("UPDATE products SET status='archived',updated=MAX(updated+1,?) WHERE id=?", Date.now(), id);
    check(result.changes, 'Товар не найден', 404);
  }

  deleteProduct(id, updated) {
    this.transaction(() => {
      const product = this.get('SELECT status,updated FROM products WHERE id=?', id);
      check(product, 'Товар не найден', 404);
      check(product.status === 'archived' && product.updated === updated, 'Откройте актуальную карточку из архива', 409);
      const offline = this.get('SELECT 1 FROM offline_sales WHERE product=? LIMIT 1', id);
      const ordered = this.get(`SELECT 1 FROM orders, json_each(orders.value, '$.items')
        WHERE json_extract(json_each.value, '$.product')=? LIMIT 1`, id);
      check(!offline && !ordered, 'Карточка связана с историей продаж и останется в архиве', 409);
      this.run('DELETE FROM carts WHERE variant IN (SELECT id FROM variants WHERE product=?)', id);
      this.run('DELETE FROM variants WHERE product=?', id);
      this.run('DELETE FROM products WHERE id=?', id);
    });
  }

  cart(id) { return this.all('SELECT variant,quantity FROM carts WHERE user=?', id); }

  editCart(user, id, quantity) {
    integer(quantity, 0, 1000, 'Количество');
    if (quantity === 0) {
      this.run('DELETE FROM carts WHERE user=? AND variant=?', user, id);
    } else {
      this.transaction(() => {
        const item = this.variant(id);
        check(item?.enabled && item.status === 'published' && item.stock >= quantity, 'Такого количества уже нет в наличии', 409);
        this.run(`INSERT INTO carts VALUES (?,?,?) ON CONFLICT(user,variant) DO UPDATE SET quantity=excluded.quantity`, user, id, quantity);
      });
    }
    return this.cart(user);
  }

  variant(id) {
    return this.get('SELECT v.*,p.status,p.value FROM variants v JOIN products p ON p.id=v.product WHERE v.id=?', id);
  }

  adjustStock(id, delta) {
    this.run('UPDATE variants SET stock=stock+? WHERE id=?', delta, id);
    this.run('UPDATE products SET updated=MAX(updated+1,?) WHERE id=(SELECT product FROM variants WHERE id=?)', Date.now(), id);
  }

  createOrder(user, input) {
    check(input && Array.isArray(input.items) && input.items.length > 0 && input.items.length <= 40, 'Выберите товары для заказа');
    const request = text(input.request, 60, 'Код операции', 16);
    check(/^[a-zA-Z0-9_-]+$/.test(request), 'Некорректный код операции');
    return this.transaction(() => {
      const existing = this.get('SELECT * FROM orders WHERE user=? AND request=?', user, request);
      if (existing) return asOrder(existing);
      const delivery = this.settings().delivery.find(d => d.id === input.delivery);
      check(delivery, 'Выберите способ доставки');
      const address = text(input.address ?? '', 250, 'Город и пункт выдачи');
      const comment = text(input.comment ?? '', 600, 'Комментарий');
      const seen = new Set();
      const items = input.items.map(line => {
        const id = text(line?.variant, 80, 'Размер', 1);
        const quantity = integer(line.quantity, 1, 1000, 'Количество');
        check(!seen.has(id), 'Размер встречается дважды');
        seen.add(id);
        const variant = this.variant(id);
        check(variant?.enabled && variant.status === 'published' && variant.stock >= quantity, 'Остаток изменился. Проверьте выбранные размеры.', 409);
        if (input.fromCart === true) {
          const cartLine = this.get('SELECT quantity FROM carts WHERE user=? AND variant=?', user, id);
          check(cartLine?.quantity >= quantity, 'Корзина изменилась. Проверьте выбранные товары.', 409);
        }
        const product = JSON.parse(variant.value);
        return {
          variant: id, product: variant.product, size: variant.size, quantity,
          brand: product.brand, name: product.name, image: product.images[0] ?? '', price: product.price,
        };
      });
      const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const total = subtotal + delivery.price;
      check(total === input.total, 'Сумма заказа изменилась. Проверьте корзину.', 409);
      let id;
      do { id = 'FFF-' + randomBytes(5).toString('hex').toUpperCase(); }
      while (this.get('SELECT 1 FROM orders WHERE id=?', id));
      const created = Date.now();
      const order = { items, delivery, address, comment, subtotal, total, tracking: '', timeline: [{ status: 'new', at: created }] };
      this.run("INSERT INTO orders VALUES (?,?,?,?,'new',?)", id, user, request, JSON.stringify(order), created);
      for (const item of items) {
        this.adjustStock(item.variant, -item.quantity);
        if (input.fromCart === true) {
          this.run('DELETE FROM carts WHERE user=? AND variant=? AND quantity<=?', user, item.variant, item.quantity);
          this.run('UPDATE carts SET quantity=quantity-? WHERE user=? AND variant=?', item.quantity, user, item.variant);
        }
      }
      const notification = JSON.stringify({ id, total });
      this.enqueue(user, notification, 'order_created');
      for (const staff of this.staffIds()) {
        this.enqueue(staff, notification, 'staff_order');
      }
      return { id, created, status: 'new', ...order };
    });
  }

  orders(user) {
    if (user) return this.all('SELECT * FROM orders WHERE user=? ORDER BY created DESC', user).map(asOrder);
    return this.all(`SELECT o.*,u.name AS buyer,u.username AS handle FROM orders o JOIN users u ON u.id=o.user ORDER BY created DESC`)
      .map(row => ({ ...asOrder(row), buyer: row.buyer, handle: row.handle, user: row.user }));
  }

  orderContact(staffId, orderId) {
    if (this.role(staffId) === 'buyer') return;
    return this.get(`SELECT u.id AS user,u.name AS buyer,u.username AS handle
      FROM orders o JOIN users u ON u.id=o.user WHERE o.id=?`, orderId);
  }

  updateOrder(id, input) {
    return this.transaction(() => {
      const row = this.get('SELECT * FROM orders WHERE id=?', id);
      check(row, 'Заказ не найден', 404);
      const { status } = input;
      const tracking = text(input.tracking ?? '', 100, 'Трек доставки');
      const order = JSON.parse(row.value);
      if (input.expectedStatus !== undefined || input.expectedTracking !== undefined) {
        check(input.expectedStatus === row.status && input.expectedTracking === order.tracking,
          'Заказ уже изменился. Откройте его заново.', 409);
      }
      check(typeof status === 'string' && Object.hasOwn(statusNames, status), 'Выберите статус заказа');
      if (status === 'cancelled' && status !== row.status) {
        for (const item of order.items) this.adjustStock(item.variant, item.quantity);
      }
      if (row.status === 'cancelled' && status !== 'cancelled') {
        for (const item of order.items) {
          check(this.variant(item.variant)?.stock >= item.quantity, 'Для восстановления заказа не хватает пар на складе.', 409);
          this.adjustStock(item.variant, -item.quantity);
        }
      }
      if (status !== row.status) order.timeline.push({ status, at: Date.now() });
      if (status !== row.status || tracking !== order.tracking) {
        this.enqueue(row.user, JSON.stringify({ id, status: statusNames[status], tracking }), 'order_update');
      }
      order.tracking = tracking;
      this.run('UPDATE orders SET value=?,status=? WHERE id=?', JSON.stringify(order), status, id);
      return { ...order, id, created: row.created, status };
    });
  }

  offlineSale(user, input) {
    return this.transaction(() => {
      const id = text(input.request, 60, 'Код операции', 16);
      check(/^[a-zA-Z0-9_-]+$/.test(id), 'Некорректный код операции');
      if (this.get('SELECT id FROM offline_sales WHERE id=? AND user=?', id, user)) return;
      const variant = this.variant(text(input.variant, 80, 'Размер', 1));
      const quantity = integer(input.quantity, 1, 1000, 'Количество');
      const price = integer(input.price, 1, 10000000, 'Цена продажи');
      const note = text(input.note ?? '', 160, 'Комментарий');
      check(variant?.enabled && variant.status !== 'archived' && variant.stock >= quantity, 'Недостаточно пар на остатке', 409);
      this.adjustStock(variant.id, -quantity);
      const { brand, name } = JSON.parse(variant.value);
      const title = name.startsWith(brand) || brand === 'Jordan' ? name : `${brand} ${name}`;
      this.run('INSERT INTO offline_sales VALUES (?,?,?,?,?,?,?,?,?)',
        id, user, variant.product, variant.id, quantity, price, title, note, Date.now());
    });
  }

  staffData() {
    const products = this.products(true);
    const orders = this.orders();
    const sales = this.all('SELECT s.*,v.size FROM offline_sales s JOIN variants v ON v.id=s.variant ORDER BY s.created DESC');
    return { products, orders, sales };
  }

  enqueue(user, message, kind = '') {
    if (this.notify) this.run('INSERT INTO outbox (user,message,app,next,kind) VALUES (?,?,?,?,?)', user, message, Number(!!kind), Date.now(), kind);
  }

  setReminders(user, enabled) {
    this.transaction(() => {
      this.run('UPDATE users SET reminders=? WHERE id=?', Number(enabled), user);
      if (!enabled) this.run("DELETE FROM outbox WHERE kind='reminder' AND user=?", user);
    });
    return this.actor(user);
  }

  reminders(days) {
    const now = Date.now();
    const cutoff = now - days * 86400000;
    this.transaction(() => {
      for (const id of this.staffIds()) {
        const user = this.get('SELECT * FROM users WHERE id=?', id);
        if (!user?.reachable || !user.reminders || !user.last_visit || user.last_visit > cutoff || user.last_reminder >= user.last_visit) continue;
        this.enqueue(id, 'Давно не открывали панель магазина. Проверьте заказы и остатки, когда будет удобно.', 'reminder');
        this.run('UPDATE users SET last_reminder=? WHERE id=?', now, id);
      }
    });
  }
}
