import { DurableObject } from 'cloudflare:workers';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { deliverOutbox, handleBotUpdate, miniAppLink, telegramApi } from '../server/bot.mjs';
import { check, HttpError, newToken, telegramIdentity } from '../server/security.mjs';
import { seedAssortment } from '../server/seed.mjs';
import { imageType, maxImage, shopApi, startup } from '../server/shop-api.mjs';
import { ShopStore } from '../server/shop-store.mjs';

const sessionTtl = 12 * 60 * 60 * 1000;
const webhookPath = '/telegram/webhook';
const uploadPath = /^\/uploads\/([a-f0-9-]{36}\.(jpg|png|webp))$/;
const imageMime = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const chunkSize = 512 * 1024;
const json = (value, status = 200) => Response.json(value, {
  status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
});

function configuration(env) {
  const url = env.PUBLIC_URL ? URL.parse(env.PUBLIC_URL) : null;
  return {
    publicUrl: url?.protocol === 'https:' ? url.origin : '',
    botToken: env.BOT_TOKEN ?? '',
    botUsername: (env.BOT_USERNAME ?? '').replace(/^@/, ''),
    appShortName: env.APP_SHORT_NAME ?? '',
    owner: /^[1-9]\d{0,15}$/.test(env.OWNER_ID ?? '') ? env.OWNER_ID : '',
    reminderDays: 3,
    portfolio: env.PORTFOLIO_DEMO === '1',
  };
}

function webhookSecret(token) {
  return createHmac('sha256', token).update('fit-feet-finds:telegram-webhook').digest('hex');
}

function authorizedWebhook(request, token) {
  const header = request.headers.get('x-telegram-bot-api-secret-token') ?? '';
  return token && /^[a-f0-9]{64}$/.test(header) &&
    timingSafeEqual(Buffer.from(header, 'hex'), Buffer.from(webhookSecret(token), 'hex'));
}

const tokenHash = token => createHash('sha256').update(token).digest('hex');
const shop = env => env.SHOP.get(env.SHOP.idFromName('store'));

async function readBody(request, limit) {
  check(Number(request.headers.get('content-length')) <= limit, 'Данные слишком большие', 413);
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks, size);
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new HttpError(413, 'Данные слишком большие');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
}

async function readJson(request, size = 64 * 1024) {
  check(/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? ''), 'Ожидается JSON', 415);
  const data = await readBody(request, size);
  let value;
  try { value = JSON.parse(data.toString('utf8')); } catch { /* Checked below. */ }
  check(value && typeof value === 'object' && !Array.isArray(value), 'Не удалось прочитать данные формы');
  return value;
}

export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url);
    const config = configuration(env);
    if (pathname === webhookPath) {
      if (request.method !== 'POST') return json({ error: 'Метод недоступен' }, 405);
      if (!authorizedWebhook(request, config.botToken)) return json({ error: 'Доступ запрещён' }, 403);
    } else if (pathname.startsWith('/telegram/')) {
      return json({ error: 'Раздел не найден' }, 404);
    } else if (pathname !== '/health' && !pathname.startsWith('/api/') && !pathname.startsWith('/uploads/')) {
      return env.ASSETS.fetch(request);
    }
    return shop(env).fetch(request);
  },
  async scheduled(_event, env) {
    await shop(env).maintain();
  },
};

export class Shop extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.config = configuration(env);
    this.api = telegramApi(this.config);
    this.rates = new Map();
    this.updatesInFlight = new Set();
    this.rateCleanupAt = 0;
    const { sql } = ctx.storage;
    const database = {
      exec: statement => sql.exec(statement),
      get: (statement, ...args) => sql.exec(statement, ...args).toArray()[0],
      all: (statement, ...args) => sql.exec(statement, ...args).toArray(),
      run: (statement, ...args) => ({ changes: sql.exec(statement, ...args).rowsWritten }),
      transaction: action => ctx.storage.transactionSync(action),
    };
    this.store = new ShopStore(database, this.config.owner, true);
    database.exec(`
      CREATE TABLE IF NOT EXISTS worker_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS worker_sessions (token TEXT PRIMARY KEY, user TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS worker_sessions_expires ON worker_sessions(expires);
      CREATE TABLE IF NOT EXISTS worker_updates (id INTEGER PRIMARY KEY, expires INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS worker_updates_expires ON worker_updates(expires);
      CREATE TABLE IF NOT EXISTS worker_photos (name TEXT PRIMARY KEY, bytes INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS worker_photo_parts (
        name TEXT NOT NULL REFERENCES worker_photos(name) ON DELETE CASCADE,
        part INTEGER NOT NULL, contents BLOB NOT NULL, PRIMARY KEY (name, part)
      );
    `);
    if (this.config.portfolio && !this.meta('portfolio-seeded')) {
      seedAssortment(this.store);
      this.store.saveDrop({ mode: 'manual', productId: 'timberland-wheat' });
      this.setMeta('portfolio-seeded', '1');
    }
  }

  meta(key) {
    return this.store.get('SELECT value FROM worker_meta WHERE key=?', key)?.value;
  }

  setMeta(key, value) {
    this.store.run('INSERT INTO worker_meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, value);
  }

  limit(key, max) {
    const now = Date.now();
    if (this.rateCleanupAt <= now) {
      for (const [id, entry] of this.rates) if (entry.until <= now) this.rates.delete(id);
      this.rateCleanupAt = now + 60000;
    }
    const entry = this.rates.get(key);
    if (!entry || entry.until <= now) {
      if (this.rates.size >= 10000) throw new HttpError(429, 'Попробуйте позже');
      this.rates.set(key, { count: 1, until: now + 60000 });
      return;
    }
    check(++entry.count <= max, 'Слишком много запросов. Попробуйте позже.', 429);
  }

  guest() {
    const { config, store } = this;
    const botLink = config.botUsername ? `https://t.me/${config.botUsername}` : '';
    return {
      profile: { id: 'guest', name: 'Гость', role: 'buyer' },
      guest: true, portfolio: config.portfolio, demo: false, appLink: miniAppLink(config),
      botLink, settings: store.settings(), products: store.products(), cart: [], orders: [],
    };
  }

  async fetch(request) {
    const { config, store } = this;
    const { origin, pathname: path } = new URL(request.url);
    const method = request.method;
    try {
      if (path === '/health' && method === 'GET') {
        return json({ ok: true, botReady: Boolean(config.botToken && config.publicUrl &&
          this.meta('webhook') === this.webhookVersion()), ownerConfigured: Boolean(config.owner) });
      }
      if (path === webhookPath) return await this.webhook(request);
      if (path.startsWith('/uploads/')) return this.photo(path, method);
      if (!['GET', 'HEAD'].includes(method)) {
        check(!request.headers.get('origin') || request.headers.get('origin') === (config.publicUrl || origin),
          'Запрос с другого сайта отклонён', 403);
      }
      if (path === '/api/session' && method === 'POST') {
        const { initData } = await readJson(request);
        if (!initData) return json(this.guest());
        this.limit(`auth:${request.headers.get('cf-connecting-ip') ?? 'local'}`, 120);
        const { user, start } = telegramIdentity(initData, config.botToken);
        const actor = store.register(user, { visit: true, reachable: user.allows_write_to_pm === true });
        this.limit(`auth-user:${actor.id}`, 30);
        const token = newToken();
        store.run('INSERT INTO worker_sessions VALUES (?,?,?)', tokenHash(token), actor.id, Date.now() + sessionTtl);
        return json({ ...startup({ store, user: actor.id }, config, { start }), portfolio: config.portfolio, token });
      }
      const token = request.headers.get('authorization')?.match(/^Bearer ([\w-]{43})$/)?.[1];
      if (!token && path === '/api/shop' && method === 'GET') return json(this.guest());
      const session = token && store.get('SELECT user FROM worker_sessions WHERE token=? AND expires>?', tokenHash(token), Date.now());
      check(session, 'Откройте магазин в Telegram', 401);
      this.limit(`api:${session.user}`, 240);
      const response = await shopApi({
        method, path, session: { ...session, store }, config, demo: false,
        json: (value, status) => json(path === '/api/shop' ? { ...value, portfolio: config.portfolio } : value, status),
        readJson: () => readJson(request), limit: (key, max) => this.limit(key, max),
        upload: () => this.upload(request),
      });
      if (path === '/api/orders' || path.startsWith('/api/staff/order/')) this.ctx.waitUntil(this.deliver());
      return response;
    } catch (error) {
      if (!(error instanceof HttpError)) console.error('Shop request:', error.code ?? '', error.name);
      return json({ error: error instanceof HttpError ? error.message : 'Сервис временно недоступен' }, error.status ?? 500);
    }
  }

  async upload(request) {
    const file = await readBody(request, maxImage);
    const type = imageType(file);
    check(type, 'Выберите фото в формате JPEG, PNG или WebP', 415);
    const name = `${randomUUID()}.${type}`;
    this.store.transaction(() => {
      this.store.run('INSERT INTO worker_photos VALUES (?,?)', name, file.length);
      for (let offset = 0; offset < file.length; offset += chunkSize) {
        this.store.run('INSERT INTO worker_photo_parts VALUES (?,?,?)',
          name, offset / chunkSize, file.subarray(offset, offset + chunkSize));
      }
    });
    return name;
  }

  photo(path, method) {
    const [, name, type] = uploadPath.exec(path) ?? [];
    check(name, 'Файл не найден', 404);
    check(['GET', 'HEAD'].includes(method), 'Метод недоступен', 405);
    const photo = this.store.get('SELECT bytes FROM worker_photos WHERE name=?', name);
    check(photo, 'Файл не найден', 404);
    const size = photo.bytes;
    const store = this.store;
    let part = 0;
    const stream = method === 'HEAD' ? null : new ReadableStream({
      pull(controller) {
        const { contents } = store.get('SELECT contents FROM worker_photo_parts WHERE name=? AND part=?', name, part++);
        controller.enqueue(new Uint8Array(contents));
        if (part * chunkSize >= size) controller.close();
      },
    });
    return new Response(stream, { headers: {
      'content-type': imageMime[type], 'content-length': String(size),
      'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff',
    } });
  }

  async webhook(request) {
    check(this.config.publicUrl, 'Бот ещё настраивается', 503);
    const update = await readJson(request, 256 * 1024);
    const id = update.update_id;
    check(Number.isSafeInteger(id) && id >= 0, 'Некорректное обновление');
    if (this.store.get('SELECT 1 FROM worker_updates WHERE id=?', id)) return json({ ok: true });
    if (this.updatesInFlight.has(id)) return json({ error: 'Обновление обрабатывается' }, 503);
    this.updatesInFlight.add(id);
    try {
      await handleBotUpdate(this.store, this.config, this.api, update);
      this.store.run('INSERT INTO worker_updates VALUES (?,?)', id, Date.now() + 2 * 86400000);
      return json({ ok: true });
    } finally { this.updatesInFlight.delete(id); }
  }

  webhookVersion() {
    return tokenHash(`${this.config.publicUrl}:1:${this.config.botToken}`);
  }

  async maintain() {
    const { store, config } = this;
    const now = Date.now();
    store.run('DELETE FROM worker_sessions WHERE expires<=?', now);
    store.run('DELETE FROM worker_updates WHERE expires<=?', now);
    if (!config.botToken || !config.publicUrl) return;
    const version = this.webhookVersion();
    if (this.meta('webhook') !== version || Number(this.meta('webhook-verified') ?? 0) <= now - 3600000) {
      try {
        const webhook = await this.api('getWebhookInfo');
        if (webhook.url !== config.publicUrl + webhookPath || this.meta('webhook') !== version) {
          await this.api('setWebhook', {
            url: config.publicUrl + webhookPath, secret_token: webhookSecret(config.botToken),
            allowed_updates: ['message'], max_connections: 5,
          });
          await this.api('setChatMenuButton', {
            menu_button: { type: 'web_app', text: 'Открыть магазин', web_app: { url: config.publicUrl } },
          });
        }
        this.setMeta('webhook', version);
        this.setMeta('webhook-verified', String(now));
      } catch (error) { console.warn('Telegram webhook setup:', error.code ?? error.name); }
    }
    if (Number(this.meta('reminders') ?? 0) <= now - 1800000) {
      store.reminders(config.reminderDays);
      this.setMeta('reminders', String(now));
    }
    await this.deliver();
  }

  async deliver() {
    const { config, store } = this;
    if (this.delivering || !config.botToken || !config.publicUrl) return;
    this.delivering = true;
    try { await deliverOutbox(store, config, this.api, undefined, 10); }
    catch (error) { console.warn('Telegram outbox:', error.code ?? error.name); }
    finally { this.delivering = false; }
  }
}
