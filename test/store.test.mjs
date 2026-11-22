import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { Store } from '../server/store.mjs';
import { seedAssortment } from '../server/seed.mjs';
import { telegramIdentity } from '../server/security.mjs';
import { deliverOutbox, handleBotUpdate } from '../server/bot.mjs';
import { shopApi } from '../server/shop-api.mjs';
import { cartItems, checkoutTotal, manager } from '../public/shop.mjs';
import { staffOrder } from '../public/staff.mjs';
import { dropBanner, resolveDrop } from '../public/drop.mjs';
import { photoSwipeDirection } from '../public/photo-zoom.mjs';

test('photo swipe advances on distance or a quick flick and ignores short slow drags', () => {
  assert.equal(photoSwipeDirection(-85, 0, 390), 1);
  assert.equal(photoSwipeDirection(22, .7, 390), -1);
  assert.equal(photoSwipeDirection(-21, -.1, 390), 0);
  assert.equal(photoSwipeDirection(-80, .9, 390), 0);
});

function fixture(t) {
  const store = new Store(':memory:', '100', true);
  t.after(() => store.close());
  for (const id of [100, 101, 102]) store.register({ id, first_name: 'Демо' });
  const product = store.saveProduct('', {
    name: 'Shox TL', brand: 'Nike', category: 'Кроссовки', price: 13990, status: 'published',
    images: ['/assets/shox-blue.jpg'], variants: [{ size: '42', stock: 2 }],
  });
  const variant = product.variants[0].id;
  const order = (quantity = 1) => ({ request: randomUUID(), items: [{ variant, quantity }], total: 13990 * quantity, delivery: 'pickup' });
  return { store, product, variant, order };
}

test('checkout is idempotent and reserves inventory once', t => {
  const { store, variant, order } = fixture(t);
  store.editCart('101', variant, 2);
  const request = { ...order(2), fromCart: true };
  const placed = store.createOrder('101', request);
  assert.equal(store.createOrder('101', request).id, placed.id);
  assert.equal(store.variant(variant).stock, 0);
  assert.equal(store.cart('101').length, 0);
  assert.equal(store.orders('102').length, 0);
  assert.equal(store.all('SELECT * FROM outbox').length, 2);
  assert.throws(() => store.createOrder('102', order()), { status: 409 });
});

test('invalid checkout leaves stock and cart unchanged', t => {
  const { store, variant, order } = fixture(t);
  const request = order();
  store.editCart('101', variant, 1);
  assert.throws(() => store.createOrder('101', { ...request, total: 1, fromCart: true }), { status: 409 });
  assert.equal(store.variant(variant).stock, 2);
  assert.equal(store.cart('101').length, 1);
  assert.equal(store.orders('101').length, 0);
});

test('cart view keeps full product details when variants include a product ID', t => {
  const { store, variant } = fixture(t);
  store.editCart('101', variant, 2);
  const settings = store.settings();
  const [{ item, quantity }] = cartItems({ products: store.products(), cart: store.cart('101') });
  assert.equal(item.product.images[0], '/assets/shox-blue.jpg');
  const { total } = checkoutTotal({ settings }, { lines: [{ ...item, quantity }] }, 'cdek');
  assert.equal(total, 2 * 13990 + 490);
});

test('cart checkout buys the selected variants and leaves the other lines in the cart', t => {
  const { store, product, variant, order } = fixture(t);
  const updated = store.saveProduct(product.id, {
    ...product, variants: [...product.variants, { size: '43', stock: 2 }],
  });
  const skipped = updated.variants.find(v => v.size === '43').id;
  store.editCart('101', variant, 1);
  store.editCart('101', skipped, 2);
  const lines = cartItems({ products: store.products(), cart: store.cart('101'), cartExcluded: new Set([skipped]) });
  const selected = lines.filter(line => line.selected);
  assert.deepEqual(selected.map(line => line.variant), [variant]);
  const placed = store.createOrder('101', { ...order(), fromCart: true });
  assert.deepEqual(placed.items.map(line => line.variant), [variant]);
  assert.deepEqual(store.cart('101').map(line => [line.variant, line.quantity]), [[skipped, 2]]);
  assert.equal(store.variant(skipped).stock, 2);
  assert.throws(() => store.createOrder('101', { ...order(), fromCart: true }), { status: 409 });
});

test('cancellation restores stock once and detects an outdated order view', t => {
  const { store, variant, order } = fixture(t);
  const placed = store.createOrder('101', order());
  store.updateOrder(placed.id, { status: 'confirmed' });
  assert.throws(() => store.updateOrder(placed.id, { status: 'cancelled', expectedStatus: 'new', expectedTracking: '' }), { status: 409 });
  store.updateOrder(placed.id, { status: 'cancelled' });
  store.updateOrder(placed.id, { status: 'cancelled' });
  assert.equal(store.variant(variant).stock, 2);
  assert.deepEqual(store.orders('101')[0].timeline.map(e => e.status), ['new', 'confirmed', 'cancelled']);
});

test('staff can skip stages while cancellation and reopening each change stock once', t => {
  const { store, variant, order } = fixture(t);
  const placed = store.createOrder('101', order(2));
  store.updateOrder(placed.id, { status: 'delivered' });
  assert.equal(store.variant(variant).stock, 0);
  store.updateOrder(placed.id, { status: 'cancelled' });
  assert.equal(store.variant(variant).stock, 2);

  const other = store.createOrder('102', order());
  assert.throws(() => store.updateOrder(placed.id, { status: 'shipped' }), { status: 409 });
  assert.equal(store.orders('101')[0].status, 'cancelled');
  assert.equal(store.variant(variant).stock, 1);
  store.updateOrder(other.id, { status: 'cancelled' });
  store.updateOrder(placed.id, { status: 'shipped' });
  store.updateOrder(placed.id, { status: 'confirmed' });
  assert.equal(store.variant(variant).stock, 0);
});

test('the storefront drop keeps its settings and falls back when its product is unavailable', t => {
  const { store, product, order } = fixture(t);
  const next = store.saveProduct('', { ...product, name: 'Air Max Plus TN', images: [] });
  const cover = product.images[0];
  store.saveDrop({ mode: 'manual', productId: product.id, title: 'Городской дроп', cover });
  const { drop, ...shopSettings } = store.settings();
  store.saveSettings({ ...shopSettings, name: 'Новая витрина' });
  assert.deepEqual(store.settings().drop, drop);
  const published = resolveDrop(store.products(), drop);
  assert.equal(published.product.id, product.id);
  assert.equal(published.cover, cover);
  assert.ok(dropBanner(published).includes('Городской дроп'));
  assert.throws(() => store.saveDrop({ ...drop, cover: '/assets/other.jpg' }), { status: 409 });

  store.createOrder('101', order(2));
  assert.throws(() => store.saveDrop(drop), { status: 409 });
  const fallback = resolveDrop(store.products(), store.settings().drop);
  assert.equal(fallback.product.id, next.id);
  assert.equal(fallback.manual, false);
  assert.equal(fallback.title, '');
  store.saveDrop({ mode: 'off' });
  assert.equal(resolveDrop(store.products(), store.settings().drop), null);
});

test('outside sale preserves the ledger, depletes stock once and rejects outdated edits', t => {
  const { store, product, variant } = fixture(t);
  const sale = { variant, price: 12500, quantity: 1, request: randomUUID(), note: 'Шоурум' };
  store.offlineSale('100', sale);
  store.offlineSale('100', sale);
  assert.equal(store.staffData().sales.length, 1);
  assert.throws(() => store.saveProduct(product.id, product), { status: 409 });
  assert.equal(store.variant(variant).stock, 1);
  store.archiveProduct(product.id);
  assert.deepEqual(store.products(), []);
  assert.throws(() => store.deleteProduct(product.id, store.products(true)[0].updated), { status: 409 });
});

test('archived product without history can be deleted and stale cart entries are removed', t => {
  const { store, product, variant } = fixture(t);
  store.editCart('102', variant, 1);
  store.archiveProduct(product.id);
  store.deleteProduct(product.id, store.products(true)[0].updated);
  assert.deepEqual(store.products(true), []);
  assert.deepEqual(store.cart('102'), []);
});

test('role edits and reminder preferences affect the expected accounts', t => {
  const { store } = fixture(t);
  store.changeAdmin('101', false);
  assert.equal(store.role('100'), 'owner');
  assert.equal(store.role('101'), 'admin');
  assert.equal(store.role('102'), 'buyer');
  store.register({ id: 101, first_name: 'Демо' }, { visit: true, reachable: true });
  store.run('UPDATE users SET last_visit=? WHERE id=?', Date.now() - 5 * 86400000, '101');
  store.reminders(3);
  assert.equal(store.all('SELECT * FROM outbox').length, 1);
  store.setReminders('101', false);
  assert.equal(store.all('SELECT * FROM outbox').length, 0);
  store.changeAdmin('101', true);
  assert.equal(store.role('101'), 'buyer');
});

test('order contact uses the latest Telegram profile and is restricted to staff', t => {
  const { store, order } = fixture(t);
  const placed = store.createOrder('101', order());
  const config = { botLink: 'https://t.me/shop_test_bot', demo: false };
  assert.equal(store.orderContact('101', placed.id), undefined);
  assert.equal(store.orderContact('102', placed.id), undefined);
  assert.equal(Object.hasOwn(store.orders('101')[0], 'handle'), false);
  const fallback = staffOrder(store.orders()[0], config);
  assert.ok(fallback.includes(`href="https://t.me/shop_test_bot?start=contact_${placed.id}"`));

  store.register({ id: 101, first_name: 'Мария', username: 'mria' });
  store.changeAdmin('102', false);
  const contact = store.orderContact('102', placed.id);
  assert.deepEqual({ ...contact }, { user: '101', buyer: 'Мария', handle: 'mria' });
  const detail = staffOrder(store.orders()[0], config);
  assert.ok(detail.includes('@mria'));
  assert.ok(detail.includes('data-value="101"'));
  const href = /href="(https:\/\/t\.me\/mria\?text=[^"]+)"/.exec(detail)?.[1];
  assert.ok(href);
  assert.ok(new URL(href).searchParams.get('text').includes(placed.id));
  store.changeAdmin('102', true);
  assert.equal(store.orderContact('102', placed.id), undefined);
});

test('manager ID opens the registered username or routes questions and replies through the bot', async t => {
  const { store, product } = fixture(t);
  const config = { botToken: 'test', botUsername: 'shop_test_bot' };
  const question = {
    path: '/api/manager/question', method: 'POST', session: { store, user: '101' },
    config, json: (_value, status) => status, limit: () => {},
    readJson: async () => ({ product: product.id, question: 'Есть 42 размер?' }),
  };
  store.saveSettings({ ...store.settings(), manager: '100' });
  await assert.rejects(shopApi(question), { status: 503 });
  store.register({ id: 100, first_name: 'Менеджер' }, { reachable: true });
  assert.match(manager({ settings: store.settings() }), /Отправить вопрос/);
  assert.equal(await shopApi(question), 202);
  const sends = [];
  const api = async (method, payload) => {
    assert.equal(method, 'sendMessage');
    sends.push(payload);
    return { message_id: sends.length };
  };
  await deliverOutbox(store, config, api);
  assert.equal(sends[0].chat_id, '100');
  assert.ok(sends[0].text.includes('p_' + product.id));
  assert.equal(sends[0].reply_markup.force_reply, true);
  const update = id => ({
    message: { from: { id }, chat: { type: 'private' }, text: 'Да, в наличии',
      reply_to_message: { message_id: 1 } },
  });
  await handleBotUpdate(store, config, api, update(102));
  assert.equal(sends.length, 1);
  await handleBotUpdate(store, config, api, update(100));
  await deliverOutbox(store, config, api);
  assert.equal(sends[2].chat_id, '101');
  assert.match(sends[2].text, /Да, в наличии/);
  store.register({ id: 100, username: 'manager_test' }, { reachable: true });
  assert.match(manager({ settings: store.settings() }), /data-url="https:\/\/t\.me\/manager_test"/);
});

test('production import keeps the 26 source cards in drafts with zero stock', t => {
  const store = new Store();
  t.after(() => store.close());
  seedAssortment(store, true);
  assert.equal(store.products(true).length, 26);
  assert.equal(store.products().length, 0);
  assert.ok(store.products(true).every(p => p.variants.every(v => v.stock === 0)));
});

test('Telegram session verifies signed identity and checks the launch time', () => {
  const token = '100:local-test-token';
  const now = 1780000000000;
  const fields = new URLSearchParams({
    auth_date: String(now / 1000), start_param: 'p_shox-blue',
    user: JSON.stringify({ id: 100, first_name: 'Демо' }),
  });
  fields.sort();
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const digest = createHmac('sha256', secret).update([...fields].map(([key, value]) => `${key}=${value}`).join('\n')).digest('hex');
  fields.set('hash', digest);
  assert.deepEqual(telegramIdentity(fields.toString(), token, now), { user: { id: 100, first_name: 'Демо' }, start: 'p_shox-blue' });
  assert.throws(() => telegramIdentity(fields.toString(), token, now + 7200000), { status: 401 });
  assert.throws(() => telegramIdentity(fields.toString(), '100:wrong-local-key', now), { status: 401 });
});
