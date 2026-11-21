import { amount, avatar, date, empty, h, icon, iconButton, photo, productLink, productTitle, rub, sheetHead, statuses, statusTag, unique } from './ui.mjs';
import { galleryMarkup } from './gallery.mjs';
import { dropBanner, resolveDrop } from './drop.mjs';

const tabs = [['catalog', 'grid', 'Каталог'], ['cart', 'bag', 'Корзина'], ['orders', 'box', 'Мои заказы']];
const adminTabs = [['overview', 'chart', 'Обзор'], ['inventory', 'layers', 'Товары'], ['manage-orders', 'box', 'Заказы'], ['settings', 'gear', 'Настройки']];

function telegramEntryLink(state, product) {
  const url = product && state.appLink ? productLink(state, product.id) : state.appLink || state.botLink;
  return url ? `<a class="button primary full" href="${h(url)}" data-action="telegram">${icon('telegram')} Открыть в Telegram</a>` : '';
}

export function telegramEntry(state, page) {
  const title = page === 'cart' ? 'Корзина' : 'Мои заказы';
  return `${sheetHead(title)}<div class="sheet-pad form-stack">
    <p>${page === 'cart' ? 'Добавить пары в корзину и оформить заказ можно в Telegram.' : 'История и статусы ваших заказов доступны в Telegram.'}</p>
    ${telegramEntryLink(state)}</div>`;
}

export function header(state) {
  const admin = state.view === 'admin';
  const name = state.profile?.name || 'Профиль';
  return `<div class="header-inner">
    <button class="wordmark" data-action="home" aria-label="${h(state.settings?.name ?? 'FIT FEET FINDS')}">
      <img src="/assets/mark.svg" alt="" width="40" height="40">
      <span><strong>${h(state.settings?.name ?? 'FIT FEET FINDS')}</strong><small>${admin ? 'Управление магазином' : state.portfolio ? 'Демо-магазин кроссовок' : 'Магазин кроссовок'}</small></span>
    </button>
    ${state.profile ? `<div class="header-center">${admin ? '<button class="header-link" data-action="view-shop">Витрина магазина</button>' :
      '<button class="header-link" data-action="browse">Каталог</button><button class="header-link" data-action="about">О магазине</button>'}</div>
    <div class="header-actions">
      ${state.demo ? `<button class="demo-switch" data-action="${admin ? 'demo-buyer' : 'demo-owner'}" aria-label="${admin ? 'Режим покупателя' : 'Демо админки'}"><i></i><span class="demo-full">${admin ? 'Режим покупателя' : 'Демо админки'}</span><span class="demo-short">${admin ? 'Витрина' : 'Демо'}</span></button>` : ''}
      ${!admin ? iconButton('search', 'search', 'Поиск по каталогу') : ''}
      <button class="profile-button" data-action="profile" aria-label="Профиль, ${h(name)}">${avatar(state.profile)}<span>${h(name.split(' ')[0])}</span>${icon('down')}</button>
    </div>` : ''}
  </div>`;
}

export function dock(state) {
  const admin = state.view === 'admin';
  const active = admin ? state.adminTab : state.page;
  const cartCount = state.cart.reduce((sum, line) => sum + line.quantity, 0);
  const newCount = state.staff?.orders.filter(o => o.status === 'new').length ?? 0;
  return (admin ? adminTabs : tabs).map(([id, glyph, label]) => {
    const badge = id === 'cart' ? cartCount : id === 'manage-orders' ? newCount : 0;
    return `<button class="dock-tab ${active === id ? 'is-active' : ''}" data-action="${admin ? 'admin-tab' : 'go'}" data-id="${id}" ${active === id ? 'aria-current="page"' : ''}>
      <span class="dock-glyph">${icon(glyph)}${badge ? `<b aria-label="${badge}">${badge > 99 ? '99+' : badge}</b>` : ''}</span>
      <span>${label}</span></button>`;
  }).join('');
}

export function visibleProducts(state) {
  const { category, query, size, sort, available } = state.filters;
  const search = query.trim().toLowerCase();
  const products = state.products.filter(p => {
    const matchCategory = category === 'all' || (category === 'sale' ? p.oldPrice > p.price : p.category === category);
    const matchSize = !size || p.variants.some(v => v.size === size && v.stock > 0);
    return matchCategory && matchSize && (!available || amount(p) > 0) &&
      (!search || [p.brand, p.name, p.color, p.category].join(' ').toLowerCase().includes(search));
  });
  if (sort === 'low') products.sort((a, b) => a.price - b.price);
  if (sort === 'high') products.sort((a, b) => b.price - a.price);
  return products;
}

function productCard(p, index) {
  const stock = amount(p);
  const sale = p.oldPrice > p.price;
  return `<article class="product-card clickable-row">
      <div class="product-media">
        ${photo(p.images[0], '', 'product-image', index < 4)}
        ${sale ? `<span class="card-flag sale-flag">−${Math.round((1 - p.price / p.oldPrice) * 100)}%</span>` :
          !stock ? '<span class="card-flag">Распродано</span>' : ''}
      </div>
      <div class="product-info">
        <h3 class="product-name"><button type="button" class="row-trigger" data-action="product" data-id="${h(p.id)}" aria-label="${h([productTitle(p), p.color].filter(Boolean).join(' '))}">${h(productTitle(p))}</button></h3>
        <p>${h(p.color || p.category)}</p>
        <div class="product-bottom"><div><strong>${rub(p.price)}</strong>${sale ? `<del>${rub(p.oldPrice)}</del>` : ''}</div>
          <span class="icon-button" aria-hidden="true">${icon(stock ? 'plus' : 'arrow')}</span></div>
      </div>
    </article>`;
}

export function catalogResults(state) {
  const products = visibleProducts(state);
  return products.length ? products.map(productCard).join('') : empty('search', 'Пары не найдены', 'Попробуйте изменить фильтры или поисковый запрос.', 'clear-filters', 'Сбросить фильтры');
}

export function catalog(state) {
  const categories = [['all', 'Все пары'], ...unique(state.products.map(p => p.category)).map(v => [v, v])];
  if (state.products.some(p => p.oldPrice > p.price)) categories.push(['sale', 'Последние размеры']);
  const filterCount = Number(!!state.filters.size) + Number(state.filters.sort !== 'recent') + Number(state.filters.available);
  return `${dropBanner(resolveDrop(state.products, state.settings.drop))}
    ${state.demo ? `<div class="store-points">
      <button data-action="about">${icon('shield')}<span>Только оригинал</span></button>
      <button data-action="about">${icon('truck')}<span>Доставка по РФ и СНГ</span></button>
      <button data-action="about">${icon('pin')}<span>Москва и Могилёв</span></button>
    </div>` : ''}
    <section class="catalog" id="catalog-section" aria-labelledby="catalog-title">
      <div class="catalog-top"><div><h2 id="catalog-title">Каталог</h2><p><span id="results-count">${visibleProducts(state).length}</span> из ${state.products.length} моделей</p></div>
      <div class="catalog-tools"><label class="search-field">${icon('search')}<input id="catalog-search" type="search" aria-label="Поиск по каталогу" placeholder="Бренд или модель" value="${h(state.filters.query)}"></label>
      <button class="filter-button" data-action="filters" aria-label="Фильтры">${icon('filters')}<span>Фильтры</span>${filterCount ? `<b>${filterCount}</b>` : ''}</button></div></div>
      <div class="chips" aria-label="Категории">${categories.map(([id, label]) => `<button class="chip ${state.filters.category === id ? 'is-active' : ''}" data-action="category" data-id="${h(id)}" aria-pressed="${state.filters.category === id}">${h(label)}</button>`).join('')}</div>
      <div class="product-grid" id="product-grid">${state.products.length ? catalogResults(state) :
        empty('box', 'Дроп готовится', 'Новые пары появятся здесь после публикации.')}</div>
    </section>
    <footer class="store-footer"><span>${h(state.settings.name)}</span><button data-action="about">Доставка и контакты ${icon('northeast')}</button></footer>`;
}

export function cartItems(state) {
  const variants = new Map(state.products.flatMap(p => p.variants.map(v => [v.id, { ...v, product: p }])));
  return state.cart.map(line => {
    const item = variants.get(line.variant);
    const available = !!item && item.stock >= line.quantity;
    return { ...line, item, available, selected: available && !state.cartExcluded?.has(line.variant) };
  });
}

export function cartReceipt(items) {
  const selected = items.filter(line => line.selected);
  const quantity = selected.reduce((sum, line) => sum + line.quantity, 0);
  const total = selected.reduce((sum, line) => sum + line.item.product.price * line.quantity, 0);
  return `<h2>К оформлению</h2><div><span>Выбрано ${quantity} шт.</span><strong>${rub(total)}</strong></div>
    <p>${selected.length ? 'Стоимость доставки появится при оформлении.' : 'Отметьте товары, которые хотите заказать.'}</p>
    <button class="button primary full" data-action="cart-checkout" ${selected.length ? '' : 'disabled'}>Оформить заказ ${icon('arrow')}</button>`;
}

export function cart(state) {
  const items = cartItems(state);
  return `<div class="page-head"><h1>Корзина</h1>${items.length ? `<p>${items.reduce((n, line) => n + line.quantity, 0)} шт.</p>` : ''}</div>
    ${!items.length ? empty('bag', 'Корзина пока пуста', 'Выберите пару в каталоге и добавьте её в корзину.', 'home', 'В каталог') :
      `<div class="cart-layout"><div class="list-panel"><label class="cart-select-all"><input type="checkbox" id="cart-select-all"
          ${items.some(line => line.available) ? '' : 'disabled'}> Выбрать все</label>
      ${items.map(({ quantity, variant, item, available, selected }) => `<article class="cart-line${item ? ' clickable-row' : ''}">
      <label class="cart-select"><input type="checkbox" data-cart-select="${h(variant)}" ${selected ? 'checked' : ''} ${available ? '' : 'disabled'}
        aria-label="${h(item ? `Выбрать ${productTitle(item.product)} ${item.product.color} EU ${item.size}` : 'Товар недоступен')}"></label>
      <div class="line-photo">${photo(item?.product.images[0])}</div>
      <div class="line-copy"><h2>${item ? `<button type="button" class="row-trigger" data-action="product" data-id="${h(item.product.id)}">${h(productTitle(item.product))}</button>` : 'Товар недоступен'}</h2>
      <p>${item ? `${h(item.product.color)} · EU ${h(item.size)}` : 'Можно удалить из корзины'}</p>
      ${item && item.stock < quantity ? '<span class="line-warning">Проверьте доступное количество</span>' : ''}
      ${item ? `<div class="stepper"><button data-action="cart-qty" data-id="${h(variant)}" data-value="${quantity - 1}" aria-label="Уменьшить количество">${icon('minus')}</button>
      <span>${quantity}</span><button data-action="cart-qty" data-id="${h(variant)}" data-value="${quantity + 1}" aria-label="Увеличить количество" ${quantity >= item.stock ? 'disabled' : ''}>${icon('plus')}</button></div>` : ''}</div>
      <div class="line-end">${item ? `<strong>${rub(item.product.price * quantity)}</strong>` : ''}<button class="text-button" data-action="cart-qty" data-id="${h(variant)}" data-value="0">Удалить</button></div>
      </article>`).join('')}</div>
      <aside class="receipt" id="cart-receipt">${cartReceipt(items)}</aside></div>`}`;
}

export function buyerOrders(state) {
  return `<div class="page-head"><h1>Мои заказы</h1><p>Статусы и трек-номера доставки</p></div>
    ${!state.orders.length ? empty('box', 'Заказов пока нет', 'После оформления здесь появятся детали и статус заказа.', 'home', 'В каталог') :
      `<div class="buyer-orders">${state.orders.map(order => `<button class="buyer-order list-panel" data-action="buyer-order" data-id="${h(order.id)}">
        <div class="order-preview">${photo(order.items[0]?.image)}</div><div><strong>${h(order.id)}</strong>
        <p>${h(productTitle(order.items[0]))}${order.items.length > 1 ? ` и ещё ${order.items.length - 1}` : ''}</p><small>${date(order.created)}</small></div>
        <div class="order-right">${statusTag(order.status)}<strong>${rub(order.total)}</strong></div>${icon('chevron', 'order-chevron')}
        </button>`).join('')}</div>`}`;
}

export function details(state, model) {
  const p = state.products.find(item => item.id === model.id);
  if (!p) return `${sheetHead('Товар недоступен')}<div class="sheet-pad"><p>Возможно, карточку убрали из каталога.</p><button class="button primary full" data-action="close">В каталог</button></div>`;
  const stock = amount(p);
  const selected = p.variants.find(v => v.id === model.variant && v.stock > 0);
  const needsSize = stock > 0 && !selected;
  return `<div class="product-close">${iconButton('close', 'close', 'Закрыть карточку')}</div>
    <div class="product-sheet"><div class="detail-gallery" ${p.id.startsWith('timberland') ? 'data-contain-photo' : ''}>
    ${galleryMarkup(p, model.image)}
  </div><div class="detail-copy">
    <div class="detail-context">${h(p.category)} <span> / </span> ${h(p.brand)}</div>
    <h2 id="sheet-title">${h(productTitle(p))}</h2><p class="detail-color">${h(p.color)}</p>
    <div class="detail-price"><strong>${rub(p.price)}</strong>${p.oldPrice ? `<del>${rub(p.oldPrice)}</del>` : ''}<span class="availability ${stock ? '' : 'is-out'}"><i></i>${stock ? 'В наличии' : 'Распродано'}</span></div>
    <div class="size-picker${needsSize && model.sizePrompt ? ' needs-size' : ''}" id="size-picker">
      <div class="size-head"><div class="size-heading"><h3 id="size-label">Размер EU</h3>${needsSize ? '<span class="size-required">Обязательно</span>' : ''}</div>
        ${p.measurements ? '<button class="text-button" data-action="measurements">Как выбрать размер?</button>' : ''}</div>
      ${model.measurements ? `<p class="measurement-note">${h(p.measurements)}</p>` : ''}
      <div class="size-grid" role="group" aria-labelledby="size-label" aria-describedby="size-feedback">${p.variants.map(v => `<button class="${selected?.id === v.id ? 'is-active' : ''}" data-action="size" data-id="${h(v.id)}" aria-pressed="${selected?.id === v.id}" ${v.stock ? '' : 'disabled'}>${h(v.size)}</button>`).join('')}</div>
      <p class="size-feedback" id="size-feedback" role="alert">${needsSize ? h(model.sizePrompt) : ''}</p>
      ${selected ? `<p class="stock-note">${selected.stock} шт. в наличии</p>` : ''}
    </div>
    ${p.description ? `<p class="detail-description">${h(p.description)}</p>` : ''}
    <div class="detail-meta">${p.condition ? `<span>${icon('shield')} ${h(p.condition)}</span>` : ''}${p.post ? `<button class="text-button" data-action="telegram" data-url="${h(p.post)}">Пост в канале ${icon('northeast')}</button>` : ''}</div>
    <div class="detail-actions">${state.guest ? telegramEntryLink(state, p) :
      `<button class="button primary full" data-action="buy" ${stock ? '' : 'disabled'}>${needsSize ? `Выбрать размер ${icon('down', 'size-jump')}` : `Оформить заказ ${icon('arrow')}`}</button>
    <div><button class="button secondary full" data-action="add-cart" ${stock ? '' : 'disabled'}>${icon('bag')} В корзину</button>
    <button class="button secondary full" data-action="manager" data-id="${h(p.id)}" aria-label="Написать менеджеру">${icon('chat')} Менеджер</button></div>
    <p class="form-error" id="detail-error" role="alert"></p>`}</div>
  </div></div>`;
}

export function filters(state) {
  const sizes = unique(state.products.flatMap(p => p.variants.map(v => v.size))).sort((a, b) => Number(a) - Number(b));
  const { size, sort, available } = state.filters;
  return `${sheetHead('Фильтры')}<form id="filter-form" class="sheet-pad form-stack">
    <label>Размер EU<select name="size"><option value="">Любой размер</option>${sizes.map(v => `<option ${v === size ? 'selected' : ''}>${h(v)}</option>`).join('')}</select></label>
    <label>Сортировка<select name="sort"><option value="recent">Сначала новые</option><option value="low" ${sort === 'low' ? 'selected' : ''}>По возрастанию цены</option><option value="high" ${sort === 'high' ? 'selected' : ''}>По убыванию цены</option></select></label>
    <label class="check-control"><input type="checkbox" name="available" ${available ? 'checked' : ''}> Только в наличии</label>
    <button class="button primary full" type="submit">Показать пары ${icon('arrow')}</button></form>`;
}

export function checkoutTotal(state, model, selectedId) {
  const shipping = state.settings.delivery.find(d => d.id === selectedId);
  const subtotal = model.lines.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  return { shipping, subtotal, total: subtotal + (shipping?.price ?? 0) };
}

export function checkout(state, model) {
  const choice = state.settings.delivery[0]?.id;
  const { subtotal, total } = checkoutTotal(state, model, choice);
  return `${sheetHead('Оформление заказа', 'Проверьте пары и выберите доставку')}
  <form id="checkout-form" class="sheet-pad form-stack">
    <div class="checkout-lines">${model.lines.map(line => `<div class="checkout-line">
      ${photo(line.product.images[0], '', 'small-photo', true)}<div><strong>${h(productTitle(line.product))}</strong>
      <p>EU ${h(line.size)} ${model.fromCart ? `· ${line.quantity} шт.` : ''}</p></div>
      ${!model.fromCart && line.stock > 1 ? `<label class="quantity-select"><span>Количество</span><input name="quantity" type="number" min="1" max="${Math.min(line.stock, 1000)}" value="${line.quantity}" required inputmode="numeric"></label>` : ''}
      <strong>${rub(line.product.price * line.quantity)}</strong>
    </div>`).join('')}</div>
    <fieldset class="radio-group"><legend>Доставка</legend>${state.settings.delivery.map((d, index) => `<label class="radio-tile"><input type="radio" name="delivery" value="${h(d.id)}" ${index === 0 ? 'checked' : ''}><span><strong>${h(d.title)}</strong><small>${h(d.detail)}</small></span><b>${d.price ? rub(d.price) : 'Бесплатно'}</b></label>`).join('')}</fieldset>
    ${state.portfolio ? '' : '<label>Город и пункт выдачи <span class="muted">по желанию</span><input name="address" maxlength="250" placeholder="Город, адрес или пункт выдачи" autocomplete="address-level2"></label>'}
    <label>Комментарий <span class="muted">по желанию</span><textarea name="comment" maxlength="600" rows="2" placeholder="Например, уточните длину стельки"></textarea></label>
    <div class="payment-note">${icon('wallet')}<div><strong>${state.portfolio ? 'Тестовый заказ' : 'Оплата после подтверждения'}</strong><p>${state.portfolio ? 'Оплата и доставка условные. Используйте вымышленные данные.' : state.demo ? 'Демо-заказ. Деньги не списываются.' : 'Менеджер свяжется с вами и согласует оплату.'}</p></div></div>
    <div class="checkout-total"><span>Товары <b id="checkout-subtotal">${rub(subtotal)}</b></span><strong>Итого <b id="checkout-total">${rub(total)}</b></strong></div>
    <p class="form-error" role="alert"></p><button class="button primary full" type="submit">Подтвердить заказ ${icon('arrow')}</button>
  </form>`;
}

export function success(state, order) {
  return `${sheetHead('Заказ оформлен')}<div class="sheet-pad success">
    <div class="success-icon">${icon('check')}</div><span class="muted">Номер заказа</span><strong class="order-code">${h(order.id)}</strong>
    <p>${state.portfolio ? 'Тестовый заказ сохранён. Посмотреть статус можно в разделе «Мои заказы».' : 'Статус можно посмотреть в разделе «Мои заказы». Трек доставки появится после отправки.'}</p>
    ${state.botLink && !state.profile.reachable ? `<button class="button secondary full" data-action="allow-bot">${icon('telegram')} Получать сообщения в Telegram</button>
    <p class="small-print">Если бот ещё не запущен, нажмите Start в его чате.</p>` : ''}
    <button class="button primary full" data-action="success-orders">Мои заказы ${icon('arrow')}</button>
    <button class="text-button" data-action="success-catalog">Вернуться в каталог</button></div>`;
}

export function orderDetails(order) {
  return `${sheetHead(order.id, date(order.created))}<div class="sheet-pad form-stack">
    ${statusTag(order.status)}<div class="checkout-lines">${order.items.map(line => `<div class="checkout-line">
    ${photo(line.image, '', 'small-photo', true)}<div><strong>${h(productTitle(line))}</strong><p>EU ${h(line.size)} · ${line.quantity} шт.</p></div><strong>${rub(line.price * line.quantity)}</strong></div>`).join('')}</div>
    <div class="data-pair"><span>Доставка</span><strong>${h(order.delivery.title)}</strong></div>
    ${order.address ? `<div class="data-pair"><span>Город и пункт</span><strong>${h(order.address)}</strong></div>` : ''}
    ${order.comment ? `<div class="data-pair"><span>Комментарий</span><strong>${h(order.comment)}</strong></div>` : ''}
    ${order.tracking ? `<div class="data-pair"><span>Трек доставки</span><button class="text-button" data-action="copy" data-value="${h(order.tracking)}">${h(order.tracking)} ${icon('link')}</button></div>` : ''}
    <div class="data-pair"><span>Итого</span><strong>${rub(order.total)}</strong></div>
    <ol class="timeline">${[...order.timeline].reverse().map(e => `<li><i></i><div>${h(statuses[e.status])}<small>${date(e.at)}</small></div></li>`).join('')}</ol></div>`;
}

export function about(state) {
  const info = state.settings;
  return `${sheetHead('О магазине')}<div class="sheet-pad about form-stack">
    <h3>${h(info.name)}</h3><p>${h(info.about)}</p><h3>Доставка</h3>
    <div class="about-delivery">${info.delivery.map(d => `<div><strong>${h(d.title)}</strong><p>${h(d.detail)}</p></div>`).join('')}</div>
    <h3>Условия заказа</h3><p>${h(info.terms)}</p>
    ${state.guest ? telegramEntryLink(state) : '<button class="button primary full" data-action="manager">' + icon('chat') + ' Написать менеджеру</button>'}
    <button class="button secondary full" data-action="telegram" data-url="https://t.me/${h(info.channel)}">${icon('telegram')} Канал магазина</button>
  </div>`;
}

export function profile(state) {
  const p = state.profile;
  return `${sheetHead('Профиль')}<div class="sheet-pad form-stack">
    <div class="profile-person">${avatar(p)}<div><strong>${h(p.name)}</strong><p>${p.username ? '@' + h(p.username) : state.guest ? 'Гостевой просмотр' : state.demo ? 'Демо-профиль' : 'Профиль Telegram'}</p></div></div>
    ${p.role !== 'buyer' ? `<button class="button primary full" data-action="${state.view === 'admin' ? 'view-shop' : 'view-admin'}">${icon('chart')} ${state.view === 'admin' ? 'К витрине' : 'Панель магазина'}</button>` : ''}
    ${state.demo ? `<button class="button secondary full" data-action="${p.role === 'buyer' ? 'demo-owner' : 'demo-buyer'}">${p.role === 'buyer' ? 'Открыть демо админки' : 'Демо покупателя'}</button>` : ''}
    ${state.guest ? telegramEntryLink(state) : state.botLink && !p.reachable ? '<button class="button secondary full" data-action="allow-bot">Включить сообщения от бота</button>' : ''}
    <button class="text-button" data-action="about">О магазине ${icon('northeast')}</button>
  </div>`;
}

export function manager(state, product) {
  const contact = state.settings.manager;
  const username = /^\d+$/.test(contact) ? state.settings.managerUsername : contact;
  const href = username ? `https://t.me/${username}` : '';
  const prefix = product ? `Здравствуйте! Вопрос по модели ${productTitle(product)} (${product.color || product.category}).\n${state.demo && product.post ? product.post : productLink(state, product.id)}\n\n` : 'Здравствуйте! Вопрос по магазину.\n\n';
  return `${sheetHead('Написать менеджеру', username ? '@' + username : 'Вопрос через бота')}
    <form id="manager-form" class="sheet-pad form-stack" data-url="${h(href)}" data-product="${h(product?.id)}" data-prefix="${h(prefix)}">
    ${product ? `<div class="checkout-line">${photo(product.images[0], '', 'small-photo', true)}<div><strong>${h(productTitle(product))}</strong><p>${h(product.color)}</p></div></div>` : ''}
    <label>Ваш вопрос ${href ? '<span class="muted">по желанию</span>' : ''}<textarea name="question" maxlength="600" rows="3" placeholder="Например, есть ли размер 43?" ${href ? '' : 'required'}></textarea></label>
    <p class="small-print">${href ? 'Telegram откроет чат с готовым черновиком.' : 'Ответ менеджера придёт в чат бота.'}</p>
    <p class="form-error" role="alert"></p><button class="button primary full" type="submit">${icon('telegram')} ${href ? 'Открыть чат' : 'Отправить вопрос'}</button></form>`;
}

export function managerSent(state) {
  return `${sheetHead('Вопрос отправлен')}<div class="sheet-pad form-stack">
    <p>Откройте чат бота и нажмите Start, если ещё с ним не общались. Здесь появится ответ менеджера.</p>
    <a class="button primary full" href="${h(state.botLink)}?start=notifications" data-action="telegram">${icon('telegram')} Открыть чат бота</a></div>`;
}
