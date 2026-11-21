const shapes = {
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
  bag: '<path d="M5 8h14l1.2 12H3.8L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>',
  box: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4.3 7.7 7.7 4.4 7.7-4.4M12 12v9M8 5.3l8 4.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  northeast: '<path d="M6 18 18 6M8 6h10v10"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  'chevron-left': '<path d="m15 6-6 6 6 6"/>',
  expand: '<path d="M14 4h6v6M20 4l-6 6M10 20H4v-6m0 6 6-6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  search: '<circle cx="10.7" cy="10.7" r="5.7"/><path d="m15 15 4.5 4.5"/>',
  filters: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="11" cy="18" r="2" fill="currentColor"/>',
  person: '<circle cx="12" cy="8" r="3.2"/><path d="M5 20v-1a7 7 0 0 1 14 0v1"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  shield: '<path d="M12 3 5 6v5c0 4.5 2.6 7.6 7 10 4.4-2.4 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
  truck: '<path d="M3 5h11v12H3zM14 9h3.5l3.5 4v4h-7"/><circle cx="7" cy="18" r="2" fill="var(--icon-bg, white)"/><circle cx="17" cy="18" r="2" fill="var(--icon-bg, white)"/>',
  pin: '<path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.1"/>',
  chat: '<path d="M20 11.5a7.8 7.8 0 0 1-8 7.5H5l1.3-3.8A7.4 7.4 0 0 1 4 11.5 7.8 7.8 0 0 1 12 4a7.8 7.8 0 0 1 8 7.5Z"/><path d="M9 11.5h.01m3 0h.01m3 0h.01"/>',
  chart: '<path d="M4 4v16h16M8 15l4-5 3 2 5-6"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="m10 3-.7 2.4-2 .9-2.3-.9-2 3.4L4.9 11v2L3 15.2l2 3.4 2.3-.9 2 .9.7 2.4h4l.7-2.4 2-.9 2.3.9 2-3.4-1.9-2.2v-2L21 8.8l-2-3.4-2.3.9-2-.9L14 3h-4Z"/>',
  link: '<path d="m10 14 4-4m-7 2-2 2a3.5 3.5 0 0 0 5 5l2-2m0-10 2-2a3.5 3.5 0 0 1 5 5l-2 2"/>',
  edit: '<path d="M4 20h4L20 8l-4-4L4 16v4Zm10-14 4 4"/>',
  archive: '<path d="M4 5h16v4H4zM6 9v10h12V9m-8 4h4"/>',
  userplus: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1m4-14v6m-3-3h6"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  photo: '<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="9" cy="9" r="1.5"/><path d="m4 17 5-4 3 3 4-5 4 4"/>',
  wallet: '<path d="M4 7a2 2 0 0 1 2-2h12v3M4 7v11h16v-4m-16-7 2 1h14v3"/><path d="M16 11h5v4h-5a2 2 0 0 1 0-4Z"/>',
  info: '<circle cx="12" cy="12" r="8"/><path d="M12 11v5m0-8h.01"/>',
  telegram: '<path d="m3 11 17-7-3 16-5-4-3 3v-6l8-6-10 5-4-1Z"/>',
};

export const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name] ?? ''}</svg>`;
export const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
export const rub = value => `${Number(value).toLocaleString('ru-RU')} ₽`;
export const date = time => new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(time);
export const amount = product => product.variants.reduce((sum, v) => sum + v.stock, 0);
export const unique = list => [...new Set(list)];
export const productTitle = product => product.name.startsWith(product.brand) || product.brand === 'Jordan' ? product.name : `${product.brand} ${product.name}`;
export const productLink = (state, id) => state.appLink ? `${state.appLink}=p_${encodeURIComponent(id)}` :
  `${location.origin}/?product=${encodeURIComponent(id)}`;
export const statuses = {
  new: 'Новый', confirmed: 'Подтверждён', packed: 'Собран',
  shipped: 'В пути', delivered: 'Выдан', cancelled: 'Отменён',
};
export const productStatuses = { published: 'В каталоге', draft: 'Черновик', archived: 'В архиве' };
export const statusTag = (status, labels = statuses) => `<span class="status status-${h(status)}"><i></i>${h(labels[status])}</span>`;
export const iconButton = (glyph, action, label, extra = '') => `<button type="button" class="icon-button" data-action="${action}" aria-label="${h(label)}" title="${h(label)}" ${extra}>${icon(glyph)}</button>`;
export const photo = (src, alt = '', klass = '', eager = false) => src
  ? `<img class="${klass}" src="${h(src)}" alt="${h(alt)}" ${eager ? '' : 'loading="lazy"'} decoding="async">`
  : `<div class="photo-fallback ${klass}" aria-hidden="true">${icon('photo')}</div>`;

export function empty(glyph, title, description, action = '', label = '') {
  return `<div class="empty"><div class="empty-icon">${icon(glyph)}</div><h2>${h(title)}</h2><p>${h(description)}</p>
    ${action ? `<button class="button primary" data-action="${action}">${h(label)} ${icon('arrow')}</button>` : ''}</div>`;
}

export function avatar(profile) {
  const initials = profile.name.split(/\s+/).slice(0, 2).map(v => [...v][0]).join('').toUpperCase();
  return `<span class="avatar"><span>${h(initials)}</span>${profile.photo ? photo(profile.photo, '', 'avatar-image', true) : ''}</span>`;
}

export function sheetHead(title, subtitle = '') {
  return `<div class="sheet-head"><div><h2 id="sheet-title">${h(title)}</h2>${subtitle ? `<p>${h(subtitle)}</p>` : ''}</div>
    ${iconButton('close', 'close', 'Закрыть')}</div>`;
}
