import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from './store.mjs';
import { seedAssortment, seedDemo } from './seed.mjs';
import { check, HttpError, newToken, telegramIdentity } from './security.mjs';
import { startBot } from './bot.mjs';
import { imageType, maxImage, shopApi, startup } from './shop-api.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(root, 'public');
const demo = process.argv.includes('--demo');
const config = {
  host: demo ? '127.0.0.1' : process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 3000),
  publicUrl: process.env.PUBLIC_URL || '',
  botToken: process.env.BOT_TOKEN || '',
  botUsername: (process.env.BOT_USERNAME || '').replace(/^@/, ''),
  appShortName: process.env.APP_SHORT_NAME || '',
  owner: process.env.OWNER_ID || '',
  reminderDays: Number(process.env.REMINDER_DAYS || 3),
};
if (!demo) {
  if (!/^https:\/\/[a-z0-9]/i.test(config.publicUrl) || !/^\d+:[\w-]+$/.test(config.botToken) ||
      !/^[\w]{5,32}$/.test(config.botUsername) || !/^[1-9]\d{0,15}$/.test(config.owner) || !Number.isSafeInteger(Number(config.owner)) ||
      (config.appShortName && !/^[a-zA-Z0-9_]{3,30}$/.test(config.appShortName)) ||
      !Number.isInteger(config.reminderDays) || config.reminderDays < 1 || config.reminderDays > 365) {
    throw new Error('Set PUBLIC_URL (HTTPS), BOT_TOKEN, BOT_USERNAME and OWNER_ID in .env, or run npm run demo.');
  }
  config.publicUrl = new URL(config.publicUrl).origin;
}

const data = resolve(root, process.env.DATA_DIR || 'data');
const uploads = join(data, 'uploads');
if (!demo) await mkdir(uploads, { recursive: true });
const live = demo ? null : new Store(join(data, 'shop.sqlite'), config.owner, true);
if (live && process.env.IMPORT_DEMO_DRAFTS === '1') seedAssortment(live, true);
const stopBot = live ? startBot(live, config) : null;
const sessions = new Map();
const demoUploads = new Map();
const rates = new Map();
const sessionTtl = 12 * 60 * 60 * 1000;
const demoCookie = `fit_demo_${config.port}`;
const demoCookiePattern = new RegExp(`(?:^|;\\s*)${demoCookie}=([\\w-]+)`);
const mime = {
  '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

function send(res, status, payload, headers = {}) {
  res.writeHead(status, headers);
  res.end(payload);
}

function json(res, payload, status = 200) {
  send(res, status, JSON.stringify(payload), {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
  });
}

async function body(req, limit) {
  check(!req.headers['content-length'] || Number(req.headers['content-length']) <= limit, 'Файл слишком большой', 413);
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    check(length <= limit, 'Данные слишком большие', 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  check(/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? ''), 'Ожидается JSON', 415);
  try {
    const value = JSON.parse(await body(req, 64 * 1024));
    check(value && typeof value === 'object' && !Array.isArray(value), 'Проверьте данные формы');
    return value;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'Не удалось прочитать данные формы');
  }
}

function limit(key, max, window = 60000) {
  const now = Date.now();
  let entry = rates.get(key);
  if (!entry || entry.until <= now) {
    entry = { count: 0, until: now + window };
    rates.set(key, entry);
  }
  check(++entry.count <= max, 'Слишком много запросов. Попробуйте позже.', 429);
}

function demoSession(req, res, create = false) {
  const key = req.headers.cookie?.match(demoCookiePattern)?.[1];
  let session = sessions.get(key);
  if (!session && create) {
    if (sessions.size >= 100) throw new HttpError(503, 'Демо перегружено. Попробуйте позже.');
    const id = newToken();
    session = { key: id, user: '100001', store: new Store(':memory:', '100002'), until: Date.now() + sessionTtl };
    seedDemo(session.store);
    sessions.set(id, session);
    res.setHeader('set-cookie', `${demoCookie}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`);
  }
  return session;
}

function sessionFrom(req, res) {
  const token = req.headers.authorization?.match(/^Bearer ([\w-]+)$/)?.[1];
  const session = demo ? demoSession(req, res) : sessions.get(token);
  check(session && session.until > Date.now(), 'Сессия истекла. Откройте приложение заново.', 401);
  return session;
}

async function api(req, res, path) {
  const method = req.method;
  const remote = req.socket.remoteAddress;
  if (method !== 'GET') {
    const expected = demo ? `http://${req.headers.host}` : config.publicUrl;
    check(!req.headers.origin || req.headers.origin === expected, 'Запрос с другого сайта отклонён', 403);
  }

  if (path === '/api/session' && method === 'POST') {
    limit(`auth:${remote}`, 300);
    if (demo) {
      await readJson(req);
      return json(res, startup(demoSession(req, res, true), config, { demo }));
    }
    const input = await readJson(req);
    const { user, start } = telegramIdentity(input.initData, config.botToken);
    const actor = live.register(user, { visit: true, reachable: user.allows_write_to_pm === true });
    limit(`auth-user:${actor.id}`, 30);
    const token = newToken();
    const session = { user: actor.id, store: live, until: Date.now() + sessionTtl };
    sessions.set(token, session);
    return json(res, { ...startup(session, config, { start }), token });
  }
  const session = sessionFrom(req, res);
  const { user } = session;
  limit(`api:${session.key ?? user}`, 240);

  if (path === '/api/session/demo-role' && method === 'POST' && demo) {
    const { role } = await readJson(req);
    check(['buyer', 'owner'].includes(role), 'Неизвестный режим');
    session.user = role === 'owner' ? '100002' : '100001';
    return json(res, startup(session, config, { demo }));
  }
  return shopApi({
    method, path, session, config, demo, limit,
    json: (payload, status) => json(res, payload, status),
    readJson: () => readJson(req),
    async upload() {
      const file = await body(req, maxImage);
      const type = imageType(file);
      check(type, 'Выберите фото в формате JPEG, PNG или WebP', 415);
      const name = `${randomUUID()}.${type}`;
      if (demo) {
        const total = [...demoUploads.values()].filter(v => v.session === session.key).reduce((sum, v) => sum + v.file.length, 0);
        check(total + file.length <= 24 * 1024 * 1024, 'Лимит изображений демо исчерпан', 413);
        demoUploads.set(name, { file, session: session.key });
      } else {
        await writeFile(join(uploads, name), file, { flag: 'wx' });
      }
      return name;
    },
  });
}

const server = createServer(async (req, res) => {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('content-security-policy', "default-src 'self'; script-src 'self' https://telegram.org; style-src 'self'; img-src 'self' https: data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self' https://web.telegram.org https://*.telegram.org");
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path.startsWith('/api/')) return await api(req, res, path);
    if (path === '/health' && req.method === 'GET') return json(res, { ok: true });
    check(req.method === 'GET' || req.method === 'HEAD', 'Метод недоступен', 405);
    const name = path === '/' ? '/index.html' : path;
    const upload = name.match(/^\/uploads\/([a-f0-9-]{36}\.(?:jpg|png|webp))$/)?.[1];
    const filename = resolve(web, '.' + name);
    const type = mime[extname(filename)];
    check(type && filename.startsWith(web + sep) && !/%/.test(name), 'Страница не найдена', 404);
    let file;
    try {
      if (upload) {
        if (demo) {
          const entry = demoUploads.get(upload);
          if (entry?.session === demoSession(req, res)?.key) file = entry?.file;
        } else {
          file = await readFile(join(uploads, upload));
        }
      } else {
        file = await readFile(filename);
      }
      if (!file) throw new Error('Missing file');
    } catch { throw new HttpError(404, 'Файл не найден'); }
    return send(res, 200, req.method === 'HEAD' ? undefined : file, {
      'content-type': type,
      'content-length': file.length,
      'cache-control': demo && upload ? 'private, no-store' : /^\/(assets|uploads)\//.test(path) ? 'public, max-age=86400' : 'no-cache',
    });
  } catch (error) {
    if (res.headersSent) return res.destroy();
    if (!(error instanceof HttpError)) console.error(error.name, error.code ?? '', error.stack?.split('\n').slice(1, 4).join('\n'));
    return json(res, { error: error instanceof HttpError ? error.message : 'Сервис временно недоступен' }, error.status ?? 500);
  }
});

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, session] of sessions) {
    if (session.until > now) continue;
    if (demo) session.store.close();
    sessions.delete(key);
  }
  for (const [key, entry] of demoUploads) if (!sessions.has(entry.session)) demoUploads.delete(key);
  for (const [key, entry] of rates) if (entry.until <= now) rates.delete(key);
}, 60000);
cleanup.unref();

async function stop() {
  await stopBot?.();
  server.close(() => {
    live?.close();
    for (const session of sessions.values()) if (demo) session.store.close();
  });
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
server.listen(config.port, config.host, () => console.log(`FIT FEET FINDS ${demo ? 'demo' : 'shop'}: http://${config.host}:${server.address().port}`));
