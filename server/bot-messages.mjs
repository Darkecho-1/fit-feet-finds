const customEmoji = {
  // More Traffic Vacancy Animated V2
  shop: { id: '5307718613006852063', emoji: '⭐' },
  panel: { id: '5307849515020097017', emoji: '🗂️' },
  order: { id: '5310169699303072267', emoji: '🧾' },
  check: { id: '5307881826059068082', emoji: '✅' },
  bell: { id: '5307577007935101117', emoji: '📌' },
  // sti_277b9_by_TgEmodziBot
  ship: { id: '5226813785771110475', emoji: '✈️' },
  cancel: { id: '5226828423019655070', emoji: '➖' },
  chat: { id: '5224615432530461449', emoji: '💬' },
};

// Strelki Bee6f Adaptive Video
export const botActionEmojiId = '5309987944877038986';

const bold = text => ({ text, type: 'bold' });
const code = text => ({ text, type: 'code' });

function badge(key) {
  const { emoji, id } = customEmoji[key];
  return { text: emoji, type: 'custom_emoji', custom_emoji_id: id };
}

function message(...parts) {
  let text = '';
  const entities = [];
  for (const part of parts) {
    if (typeof part === 'string') {
      text += part;
    } else {
      const { text: value, ...entity } = part;
      entities.push({ ...entity, offset: text.length, length: value.length });
      text += value;
    }
  }
  return { text, entities };
}

const heading = (key, title) => [badge(key), '  ', bold(title)];
const rubles = total => `${total.toLocaleString('ru-RU')} ₽`;

export function welcomeMessage(name, staff, product) {
  if (staff) {
    return message(...heading('panel', 'Панель магазина'), '\n', bold(name),
      '\n\nПроверьте новые заказы, обновите остатки и выберите пару для следующего дропа.');
  }
  if (product) {
    return message(...heading('shop', 'Ваш выбор'), '\n', bold(product),
      '\n\nОткройте карточку, чтобы посмотреть фото, доступные размеры и условия заказа.');
  }
  return message(...heading('shop', name),
    '\n\nЗдесь собраны свежие дропы, классические пары и последние размеры.',
    '\n\nВыберите свою пару в каталоге. В карточке можно уточнить детали у менеджера или оформить заказ.');
}

export function orderMessage(kind, { id, total, status, tracking }) {
  if (kind === 'order_update') {
    const markers = {
      'Подтверждён': 'check', 'В пути': 'ship', 'Выдан': 'check', 'Отменён': 'cancel',
    };
    const parts = [...heading(markers[status] ?? 'order', 'Статус заказа'), '\n\nНомер  ', code(id), '\nСтатус  ', bold(status)];
    if (tracking) parts.push('\nТрек доставки  ', code(tracking));
    return message(...parts);
  }
  const staff = kind === 'staff_order';
  return message(...heading('order', staff ? 'Новый заказ' : 'Заказ принят'),
    '\n\nНомер  ', code(id), '\nСумма  ', bold(rubles(total)),
    staff ? '\n\nПроверьте заказ и обновите статус в панели.' :
      '\n\nСтатус и трек доставки появятся в разделе «Мои заказы».');
}

export const reminderMessage = text => message(...heading('bell', 'Напоминание о магазине'), '\n\n', text);
export const questionMessage = text => message(...heading('chat', 'Вопрос покупателя'), '\n\n', text);
export const managerMessage = text => message(...heading('chat', 'Ответ менеджера'), '\n\n', text);
export const reminderSetting = enabled => message(
  ...heading(enabled ? 'bell' : 'check', enabled ? 'Напоминания включены' : 'Напоминания выключены'),
);
export const telegramIdMessage = id => message(...heading('panel', 'Ваш Telegram ID'), '\n\n', code(id));
export const orderContactMessage = (id, buyer, user, note = '') => message(
  ...heading('chat', 'Контакт покупателя'), '\n\nЗаказ  ', code(id), '\n',
  bold(buyer), '\nTelegram ID  ', code(user), note,
);
