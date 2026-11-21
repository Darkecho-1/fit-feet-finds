import { check, HttpError, telegramId, text } from './security.mjs';
import { miniAppLink } from './bot.mjs';

export const maxImage = 6 * 1024 * 1024;

export function startup(session, config, { demo = false, start = '' } = {}) {
  const { store, user } = session;
  return {
    profile: store.actor(user), settings: store.settings(), products: store.products(),
    cart: store.cart(user), orders: store.orders(user), demo, start,
    appLink: demo ? '' : miniAppLink(config), botLink: demo || !config.botUsername ? '' : `https://t.me/${config.botUsername}`,
  };
}

export function imageType(buffer) {
  if (buffer.length < 24) return '';
  if (buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255])) &&
      buffer.subarray(-2).equals(Buffer.from([255, 217]))) return 'jpg';
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      buffer.toString('ascii', 12, 16) === 'IHDR') return 'png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' &&
      buffer.readUInt32LE(4) + 8 === buffer.length) return 'webp';
  return '';
}

export async function shopApi({ method, path, session, config, demo, json, readJson, limit, upload }) {
  const { store, user } = session;
  const actor = store.actor(user);
  if (path === '/api/shop' && method === 'GET') return json(startup(session, config, { demo }));
  if (path === '/api/cart' && method === 'PUT') {
    const { variant, quantity } = await readJson();
    check(typeof variant === 'string' && variant.length <= 80, 'Выберите размер');
    return json(store.editCart(user, variant, quantity));
  }
  if (path === '/api/orders' && method === 'POST') {
    limit(`orders:${session.key ?? user}`, 15);
    return json(store.createOrder(user, await readJson()), 201);
  }
  if (path === '/api/manager/question' && method === 'POST') {
    limit(`manager:${user}`, 5);
    const { question, product } = await readJson();
    const message = text(question, 600, 'Ваш вопрос', 1);
    const { manager } = store.settings();
    check(!demo && telegramId(manager) && store.notify && config.botToken,
      'Обращения через бота пока недоступны', 503);
    check(store.get('SELECT reachable FROM users WHERE id=?', manager)?.reachable,
      'Менеджер ещё не подключился к боту', 503);
    const item = product ? store.products().find(entry => entry.id === product) : undefined;
    check(!product || item, 'Карточка товара недоступна', 404);
    const buyer = `Покупатель: ${actor.name}${actor.username ? ` (@${actor.username})` : ''}`;
    const context = item ? `\nТовар: ${item.brand} ${item.name}\n${miniAppLink(config, 'p_' + item.id)}` : '';
    store.enqueue(manager, JSON.stringify({
      buyer: user, text: `Вопрос по магазину\n${buyer}${context}\n\n${message}\n\nОтветьте на это сообщение, чтобы бот передал ваш ответ покупателю.`,
    }), 'manager_question');
    return json({ ok: true }, 202);
  }
  if (!path.startsWith('/api/staff/')) throw new HttpError(404, 'Раздел не найден');
  check(actor.role !== 'buyer', 'Доступ только для команды магазина', 403);

  if (path === '/api/staff/data' && method === 'GET') return json(store.staffData());
  if (path === '/api/staff/product' && method === 'POST') {
    const input = await readJson();
    const id = typeof input.id === 'string' && input.id.length < 80 ? input.id : '';
    return json(store.saveProduct(id, input), id ? 200 : 201);
  }
  const product = path.match(/^\/api\/staff\/product\/([a-zA-Z0-9_-]{1,80})$/)?.[1];
  if (product && method === 'DELETE') {
    store.archiveProduct(product);
    return json({ ok: true });
  }
  const purge = path.match(/^\/api\/staff\/product\/([a-zA-Z0-9_-]{1,80})\/purge$/)?.[1];
  if (purge && method === 'DELETE') {
    const { updated } = await readJson();
    store.deleteProduct(purge, updated);
    return json({ ok: true });
  }
  if (path === '/api/staff/photo' && method === 'POST') {
    limit(`photos:${session.key ?? user}`, 24);
    const name = await upload();
    return json({ url: `/uploads/${name}` }, 201);
  }
  const order = path.match(/^\/api\/staff\/order\/(FFF-[A-F0-9]{10})$/)?.[1];
  if (order && method === 'PATCH') return json(store.updateOrder(order, await readJson()));
  if (path === '/api/staff/sale' && method === 'POST') {
    store.offlineSale(user, await readJson());
    return json({ ok: true }, 201);
  }
  if (path === '/api/staff/settings' && method === 'PUT') return json(store.saveSettings(await readJson()));
  if (path === '/api/staff/drop' && method === 'PUT') return json(store.saveDrop(await readJson()));
  if (path === '/api/staff/reminders' && method === 'PUT') {
    const { enabled } = await readJson();
    check(typeof enabled === 'boolean', 'Выберите значение');
    return json(store.setReminders(user, enabled));
  }
  if (path === '/api/staff/team') {
    check(actor.role === 'owner', 'Управлять командой может владелец', 403);
    if (method === 'GET') return json(store.team());
    if (method === 'POST') {
      const input = await readJson();
      return json(store.changeAdmin(String(input.id ?? ''), input.remove === true));
    }
  }
  throw new HttpError(404, 'Раздел не найден');
}
