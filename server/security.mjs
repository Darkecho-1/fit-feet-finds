import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function check(condition, message, status = 400) {
  if (!condition) throw new HttpError(status, message);
}

export function telegramIdentity(initData, token, now = Date.now()) {
  check(typeof initData === 'string' && initData.length <= 8192 && token, 'Откройте магазин в Telegram', 401);
  const fields = new URLSearchParams(initData);
  const keys = [...fields.keys()];
  const hash = fields.get('hash');
  const authDate = Number(fields.get('auth_date'));
  const age = Math.floor(now / 1000) - authDate;
  check(new Set(keys).size === keys.length && /^[a-f0-9]{64}$/.test(hash ?? '') &&
    Number.isSafeInteger(authDate) && age >= -60 && age <= 3600, 'Сессия Telegram истекла. Откройте магазин заново.', 401);
  fields.delete('hash');
  fields.sort();
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const expected = createHmac('sha256', secret).update([...fields].map(([k, v]) => `${k}=${v}`).join('\n')).digest();
  check(timingSafeEqual(expected, Buffer.from(hash, 'hex')), 'Не удалось подтвердить аккаунт Telegram', 401);
  let user;
  try { user = JSON.parse(fields.get('user')); } catch { /* checked below */ }
  check(Number.isSafeInteger(user?.id) && user.id > 0, 'Профиль Telegram недоступен', 401);
  return { user, start: fields.get('start_param') ?? '' };
}

export function newToken() {
  return randomBytes(32).toString('base64url');
}

export function text(value, max, label, min = 0) {
  check(typeof value === 'string', `Заполните поле «${label}»`);
  const clean = value.trim();
  check(clean.length >= min && clean.length <= max, `Проверьте длину поля «${label}»`);
  return clean;
}

export function integer(value, min, max, label) {
  check(Number.isSafeInteger(value) && value >= min && value <= max, `Проверьте значение «${label}»`);
  return value;
}

export function telegramHandle(value) {
  const handle = text(value, 33, 'Telegram').replace(/^@/, '');
  check(/^[A-Za-z0-9_]{5,32}$/.test(handle), 'Укажите Telegram-имя без ссылки');
  return handle;
}

export function telegramId(value) {
  return typeof value === 'string' && /^[1-9]\d{0,15}$/.test(value) && Number.isSafeInteger(Number(value));
}

export function photoUrl(value) {
  const input = text(value, 600, 'Фото', 1);
  if (/^\/(assets|uploads)\/[a-zA-Z0-9_-]+\.(jpe?g|png|webp)$/i.test(input)) return input;
  let url;
  try { url = new URL(input); } catch { /* checked below */ }
  check(url?.protocol === 'https:' && !url.username && !url.password, 'Фото должно иметь HTTPS-ссылку');
  return url.href;
}
