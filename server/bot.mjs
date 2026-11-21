import { setTimeout as delay } from 'node:timers/promises';

export function miniAppLink(config, start = '') {
  if (!config.botUsername) return '';
  const path = config.appShortName ? `/${config.appShortName}` : '';
  return `https://t.me/${config.botUsername}${path}?startapp${start ? `=${encodeURIComponent(start)}` : ''}`;
}

function botButton(config, staff, start = '') {
  const url = new URL(config.publicUrl);
  if (staff) url.searchParams.set('view', 'admin');
  if (start) url.searchParams.set('product', start);
  return { inline_keyboard: [[{ text: staff ? 'Открыть панель' : 'Открыть магазин', web_app: { url: url.href } }]] };
}

export function telegramApi(config, signal) {
  return async (method, body = {}) => {
    const response = await fetch(`https://api.telegram.org/bot${config.botToken}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(35000)]) : AbortSignal.timeout(10000),
    });
    const result = await response.json();
    if (!result.ok) {
      const error = new Error(`Telegram API ${result.error_code ?? response.status}`);
      error.code = result.error_code ?? response.status;
      error.retry = result.parameters?.retry_after;
      throw error;
    }
    return result.result;
  };
}

const send = (api, id, text, markup) => api('sendMessage', {
  chat_id: id, text, ...(markup && { reply_markup: markup }),
});

export async function handleBotUpdate(store, config, api, update) {
  const message = update.message;
  if (message?.chat?.type !== 'private' || message.from?.is_bot || !message.from) return;
  const actor = store.register(message.from, { reachable: true });
  const staff = actor.role !== 'buyer';
  const [raw = '', arg = ''] = (message.text ?? '').trim().split(/\s+/, 2);
  const command = raw.split('@')[0].toLowerCase();
  if (command === '/start' && arg.startsWith('contact_')) {
    const orderId = /^contact_(FFF-[0-9A-F]{10})$/.exec(arg)?.[1];
    const contact = orderId && store.orderContact(actor.id, orderId);
    if (!contact) {
      await send(api, actor.id, 'Заказ недоступен.');
      return;
    }
    const info = `Покупатель по заказу ${orderId}\n${contact.buyer}\nTelegram ID: ${contact.user}`;
    const url = contact.handle ? `https://t.me/${contact.handle}` : `tg://user?id=${contact.user}`;
    try {
      await send(api, actor.id, info, { inline_keyboard: [[{
        text: contact.handle ? 'Открыть чат' : 'Открыть профиль покупателя',
        url,
      }]] });
    } catch (error) {
      if (error.code !== 400 || contact.handle) throw error;
      await send(api, actor.id, `${info}\nTelegram не разрешил открыть профиль по ID.`);
    }
  } else if (command === '/id') {
    await send(api, actor.id, `Ваш Telegram ID: ${actor.id}`);
  } else if (staff && ['/reminders_on', '/reminders_off'].includes(command)) {
    const enabled = command === '/reminders_on';
    store.setReminders(actor.id, enabled);
    await send(api, actor.id, enabled ? 'Напоминания включены.' : 'Напоминания выключены.');
  } else if (command === '/start' || (staff && command === '/panel')) {
    const product = arg.startsWith('p_') && store.products().some(p => p.id === arg.slice(2)) ? arg.slice(2) : '';
    const panel = staff && !product;
    const note = panel ? 'Панель магазина. Здесь можно обработать заказы, обновить каталог и проверить остатки.' :
      `Добро пожаловать в ${store.settings().name}! Откройте витрину, чтобы посмотреть пары и оформить заказ.`;
    await send(api, actor.id, note, botButton(config, panel, product));
  }
}

export async function deliverOutbox(store, config, api, signal, batchSize = 20) {
  const pending = store.all('SELECT * FROM outbox WHERE next<=? ORDER BY id LIMIT ?', Date.now(), batchSize);
  for (const event of pending) {
    if (!store.get('SELECT 1 FROM outbox WHERE id=?', event.id)) continue;
    try {
      await send(api, event.user, event.message, event.app ? botButton(config, true) : undefined);
      store.run('DELETE FROM outbox WHERE id=?', event.id);
    } catch (error) {
      if (signal?.aborted) break;
      if (event.attempts >= 52) {
        console.warn('Bot notification expired:', error.code ?? error.name);
        store.run('DELETE FROM outbox WHERE id=?', event.id);
      } else {
        const backoff = Math.min(21600, 5 * 2 ** event.attempts);
        store.run('UPDATE outbox SET next=?,attempts=attempts+1 WHERE id=?',
          Date.now() + Math.max(error.retry ?? 0, backoff) * 1000, event.id);
      }
      if (error.code === 429) break;
    }
  }
}

export function startBot(store, config) {
  const controller = new AbortController();
  const { signal } = controller;
  const api = telegramApi(config, signal);

  async function poll() {
    let offset = 0;
    while (!signal.aborted) {
      try {
        const updates = await api('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] });
        for (const update of updates) {
          try { await handleBotUpdate(store, config, api, update); }
          catch (error) { if (!signal.aborted) console.warn('Bot update:', error.code ?? error.name); }
          offset = update.update_id + 1;
        }
      } catch (error) {
        if (signal.aborted) break;
        console.warn('Bot polling:', error.code ?? error.name);
        await delay(Math.max(3, error.retry ?? 0) * 1000, undefined, { signal }).catch(() => {});
      }
    }
  }

  async function deliver() {
    while (!signal.aborted) {
      try { await deliverOutbox(store, config, api, signal); }
      catch (error) { if (!signal.aborted) console.warn('Bot outbox:', error.name); }
      await delay(3000, undefined, { signal }).catch(() => {});
    }
  }

  const reminders = () => store.reminders(config.reminderDays);
  const timer = setInterval(reminders, 30 * 60 * 1000);
  reminders();
  const workers = [poll(), deliver()];
  return async () => {
    clearInterval(timer);
    controller.abort();
    await Promise.allSettled(workers);
  };
}
