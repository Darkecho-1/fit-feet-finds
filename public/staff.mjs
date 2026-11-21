import { amount, date, empty, h, icon, iconButton, photo, productStatuses, productTitle, rub, sheetHead, statuses, statusTag } from './ui.mjs';
import { availableDrops, dropBanner, resolveDrop } from './drop.mjs';

const heading = (title, description, actions = '') => `<div class="page-head staff-heading"><div><h1>${title}</h1><p>${description}</p></div>${actions}</div>`;

function rowOrder(order) {
  return `<button class="staff-order" data-action="staff-order" data-id="${h(order.id)}">
    <div><strong>${h(order.id)}</strong><small>${h(order.buyer)} · ${date(order.created)}</small></div>
    ${statusTag(order.status)}<b>${rub(order.total)}</b>${icon('chevron', 'order-chevron')}</button>`;
}

export function overview(state) {
  const { products, orders, sales } = state.staff;
  const live = products.filter(p => p.status === 'published');
  const inStock = products.filter(p => p.status !== 'archived').reduce((sum, p) => sum + amount(p), 0);
  const active = orders.filter(o => !['delivered', 'cancelled'].includes(o.status));
  const reserved = active.reduce((n, o) => n + o.items.reduce((sum, item) => sum + item.quantity, 0), 0);
  const onlineSales = orders.filter(o => o.status === 'delivered');
  const revenue = onlineSales.reduce((sum, order) => sum + order.subtotal, 0) + sales.reduce((sum, sale) => sum + sale.quantity * sale.price, 0);
  const low = live.filter(p => amount(p) > 0 && amount(p) <= 3);
  const drop = resolveDrop(state.products, state.settings.drop);
  return `<div class="admin-banner">
    <div><span class="admin-ident">${icon('chart')} ${state.profile.role === 'owner' ? 'Владелец' : 'Администратор'}</span>
    <h1>Панель магазина</h1><p>${h(state.settings.name)}</p></div>
    <div class="admin-intro-actions"><button class="hero-button glass" data-action="new-product">${icon('plus')} Новый товар</button><button class="hero-button glass" data-action="sale">${icon('wallet')} Внешняя продажа</button></div>
  </div>
  <section class="admin-panel drop-overview" aria-labelledby="drop-overview-title">
    <div class="drop-overview-photo">${photo(drop?.cover)}</div>
    <div><h2 id="drop-overview-title">Дроп на витрине</h2>
      <p>${drop ? `${drop.manual ? '' : 'Автоматический выбор · '}${h(productTitle(drop.product))}` :
        state.settings.drop?.mode === 'off' ? 'Баннер скрыт' : 'Нет товаров с остатком'}</p></div>
    <button type="button" class="button secondary" data-action="edit-drop">${icon('edit')} Редактировать дроп</button>
  </section>
  <div class="stats-grid">
    ${[['bag', 'Активные заказы', active.length, `${orders.filter(o => o.status === 'new').length} новых`], ['layers', 'Пар на остатке', inStock, `${reserved} в резерве`],
      ['grid', 'В каталоге', live.length, `${products.filter(p => p.status === 'draft').length} черновиков`],
      ['wallet', 'Выручка за товары', rub(revenue), 'Выданные заказы и внешние продажи']].map(([glyph, label, number, small]) => `<article class="stat"><div>${icon(glyph)}<span>${label}</span></div><strong>${number}</strong><p>${small}</p></article>`).join('')}
  </div>
  <div class="overview-grid">
    <section class="admin-panel"><div class="panel-head"><h2>Последние заказы</h2><button class="text-button" data-action="admin-tab" data-id="manage-orders">Все заказы ${icon('arrow')}</button></div>
      ${orders.length ? orders.slice(0, 5).map(rowOrder).join('') : '<p class="quiet">Новых заказов пока нет.</p>'}
    </section>
    <section class="admin-panel"><div class="panel-head"><h2>Склад</h2><button class="text-button" data-action="admin-tab" data-id="inventory">Товары ${icon('arrow')}</button></div>
      <div class="data-pair"><span>Мало в наличии</span><strong>${low.length}</strong></div>
      <div class="data-pair"><span>Распродано в каталоге</span><strong>${live.filter(p => !amount(p)).length}</strong></div>
      <div class="data-pair"><span>Внешние продажи</span><strong>${sales.reduce((sum, sale) => sum + sale.quantity, 0)} шт.</strong></div>
      ${sales.length ? '<button class="text-button sale-history" data-action="sale-history">Журнал внешних продаж ' + icon('arrow') + '</button>' : ''}
    </section>
  </div>`;
}

export function dropCoverOptions(product, selected = '') {
  const images = product?.images ?? [];
  return `<option value="">${images.length ? 'Первое фото товара' : 'Фото появятся из карточки товара'}</option>
    ${images.slice(1).map((src, i) => `<option value="${h(src)}" ${src === selected ? 'selected' : ''}>Фото ${i + 2}</option>`).join('')}`;
}

export function dropPreview(state, settings) {
  const entry = resolveDrop(state.products, settings);
  if (settings.mode === 'manual' && !entry?.manual) return '<p class="drop-preview-empty">Выберите товар, чтобы увидеть баннер.</p>';
  return dropBanner(entry, true) || `<p class="drop-preview-empty">${settings.mode === 'off' ?
    'Покупатели сразу увидят каталог.' : 'Баннер появится, когда будут товары в наличии.'}</p>`;
}

export function dropEditor(state) {
  const settings = state.settings.drop ?? { mode: 'auto' };
  const products = availableDrops(state.products);
  const product = products.find(p => p.id === settings.productId);
  const manual = settings.mode === 'manual';
  const modes = [['manual', 'Выбрать товар вручную'], ['auto', 'Показывать новинку автоматически'], ['off', 'Скрыть баннер']];
  return `${sheetHead('Дроп на витрине')}
    <form id="drop-form" class="sheet-pad form-stack">
      <label>Показ на главной<select name="mode">${modes.map(([mode, label]) =>
        `<option value="${mode}" ${settings.mode === mode ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <div id="drop-manual-fields" class="form-stack" ${manual ? '' : 'hidden'}>
        <label>Товар дропа<select name="productId" ${manual ? 'required' : ''}>
          <option value="">Выберите товар</option>
          ${products.map(p => `<option value="${h(p.id)}" ${product?.id === p.id ? 'selected' : ''}>${h(productTitle(p))}${p.color ? ' · ' + h(p.color) : ''}</option>`).join('')}
        </select></label>
        ${!products.length ? '<p class="small-print">Опубликуйте товар с остатком, чтобы выбрать его для дропа.</p>' : ''}
        <label>Заголовок <span class="muted">по желанию</span>
          <input name="title" maxlength="54" placeholder="Пары, которые ищут." value="${h(settings.title)}"></label>
        <label>Фото обложки<select name="cover">${dropCoverOptions(product, settings.cover)}</select></label>
      </div>
      <div class="drop-preview-panel"><h3>Предпросмотр витрины</h3>
        <div id="drop-preview">${dropPreview(state, settings)}</div>
      </div>
      <p class="form-error" role="alert"></p>
      <button type="submit" class="button primary full">Сохранить дроп ${icon('check')}</button>
    </form>`;
}

export function inventory(state) {
  const list = state.staff.products;
  return `${heading('Товары', 'Каталог, размеры и остатки', `<div class="heading-actions"><button class="button secondary" data-action="sale">${icon('wallet')} Внешняя продажа</button><button class="button primary" data-action="new-product">${icon('plus')} Новый товар</button></div>`)}
  <div class="chips staff-chips" aria-label="Статус товара">${[['all', 'Все'], ...Object.entries(productStatuses)].map(([id, label]) =>
    `<button class="chip ${state.inventoryFilter === id ? 'is-active' : ''}" data-action="inventory-filter" data-id="${id}" aria-pressed="${state.inventoryFilter === id}">${label}${id !== 'all' ? ` <small>${list.filter(p => p.status === id).length}</small>` : ''}</button>`).join('')}</div>
  <div class="admin-panel inventory-panel">${inventoryRows(state)}</div>`;
}

function inventoryRows(state) {
  const rows = state.staff.products.filter(p => state.inventoryFilter === 'all' || p.status === state.inventoryFilter);
  if (!rows.length) return '<p class="quiet">В этом разделе пока нет товаров.</p>';
  return rows.map(p => `<article class="inventory-row clickable-row">
    <div class="line-photo">${photo(p.images[0])}</div>
    <div class="inventory-copy"><button type="button" class="row-trigger" data-action="edit-product" data-id="${h(p.id)}" aria-label="Редактировать ${h([productTitle(p), p.color].filter(Boolean).join(' '))}"><strong>${h(productTitle(p))}</strong></button>
      <small>${h(p.color)} · ${rub(p.price)}</small><div class="inventory-status">${statusTag(p.status, productStatuses)}<span>${amount(p)} шт.</span></div></div>
    <div class="inventory-sizes" aria-label="Остатки по размерам">${p.variants.map(v => `<span class="${v.stock ? '' : 'zero'}">${h(v.size)} <b>${v.stock}</b></span>`).join('')}</div>
    <div class="inventory-actions">
      ${p.status === 'published' ? iconButton('link', 'share-product', 'Скопировать ссылку на карточку', `data-id="${h(p.id)}"`) : ''}
      <span class="icon-button" aria-hidden="true">${icon('edit')}</span>
    </div></article>`).join('');
}

export function manageOrders(state) {
  const orders = state.staff.orders.filter(o => state.orderFilter === 'all' || o.status === state.orderFilter);
  return `${heading('Заказы', 'Обработка, доставка и история')}
    <div class="chips staff-chips" aria-label="Статус заказа">${[['all', 'Все'], ...Object.entries(statuses)].map(([id, label]) => `<button class="chip ${state.orderFilter === id ? 'is-active' : ''}" data-action="order-filter" data-id="${id}" aria-pressed="${state.orderFilter === id}">${label}</button>`).join('')}</div>
    ${orders.length ? `<div class="admin-panel order-panel">${orders.map(rowOrder).join('')}</div>` : empty('box', 'Заказов в этом статусе нет', 'Попробуйте выбрать другой статус.')}`;
}

export function deliveryRow(delivery = { id: '', title: '', detail: '', price: 0 }) {
  return `<div class="delivery-editor"><input type="hidden" name="delivery-id" value="${h(delivery.id)}"><div class="editor-inline">
    <label>Название<input name="delivery-title" value="${h(delivery.title)}" required maxlength="70"></label>
    <label>Цена, ₽<input name="delivery-price" type="number" min="0" max="100000" required value="${delivery.price}"></label>
    ${iconButton('close', 'remove-row', 'Убрать способ доставки')}</div>
    <label>Подсказка<input name="delivery-detail" value="${h(delivery.detail)}" maxlength="180"></label></div>`;
}

export function settings(state) {
  const info = state.settings;
  return `${heading('Настройки', 'Информация для покупателей и доступ команды')}
    <div class="settings-layout">
    <form id="settings-form" class="admin-panel settings-panel form-stack">
      <h2>Информация о магазине</h2>
      <label>Название<input name="name" required maxlength="50" value="${h(info.name)}"></label>
      <div class="split-form"><label>Менеджер в Telegram<input name="manager" required maxlength="33" placeholder="Telegram ID или @username" value="${/^\d+$/.test(info.manager) ? '' : '@'}${h(info.manager)}"></label>
      <label>Канал магазина<input name="channel" required maxlength="33" value="@${h(info.channel)}"></label></div>
      <label>О магазине<textarea name="about" required rows="3" maxlength="1200">${h(info.about)}</textarea></label>
      <label>Условия заказа<textarea name="terms" required rows="3" maxlength="1600">${h(info.terms)}</textarea></label>
      <div class="panel-head no-border"><h2>Доставка</h2><button type="button" class="text-button" data-action="add-delivery">${icon('plus')} Добавить</button></div>
      <div id="delivery-rows">${info.delivery.map(deliveryRow).join('')}</div>
      <p class="form-error" role="alert"></p><button type="submit" class="button primary">Сохранить настройки ${icon('check')}</button>
    </form>
    <div class="settings-side">
      <section class="admin-panel settings-panel"><h2>Напоминания</h2>
      <p class="muted">Бот напомнит об открытии панели после перерыва.</p>
      <label class="switch-line"><span>Напоминать в Telegram</span><input type="checkbox" data-toggle="reminders" role="switch" ${state.profile.reminders ? 'checked' : ''}></label></section>
      ${state.profile.role === 'owner' ? `<section class="admin-panel settings-panel"><h2>Команда</h2>
      <p class="muted">Управляйте доступом по Telegram ID. Администраторы работают с каталогом и заказами.</p>
      <button class="button secondary full" data-action="team">${icon('userplus')} Управлять доступом</button></section>` : ''}
    </div></div>`;
}

export function variantRow(variant = { size: '', stock: 0 }) {
  return `<div class="variant-editor editor-inline"><label>Размер<input name="size" maxlength="12" value="${h(variant.size)}" required placeholder="42"></label>
    <label>Доступно, шт.<input name="stock" type="number" min="0" max="10000" value="${variant.stock}" inputmode="numeric" required></label>
    ${iconButton('close', 'remove-row', 'Убрать размер')}</div>`;
}

export function editor(product) {
  const p = product ?? { name: '', brand: '', price: '', oldPrice: '', color: '', category: 'Кроссовки', condition: 'Новые, оригинал', description: '',
    post: '', measurements: '', images: [], status: 'draft', variants: [{ size: '', stock: 0 }] };
  return `${sheetHead(product ? 'Редактирование товара' : 'Новый товар')}
    <form id="product-form" class="sheet-pad form-stack" data-id="${h(p.id)}" data-updated="${h(p.updated)}">
      <div class="split-form"><label>Бренд<input name="brand" required maxlength="40" value="${h(p.brand)}" placeholder="Nike"></label>
      <label>Модель<input name="name" required maxlength="100" value="${h(p.name)}" placeholder="Shox TL"></label></div>
      <div class="split-form"><label>Расцветка<input name="color" maxlength="60" value="${h(p.color)}"></label>
      <label>Категория<input name="category" required maxlength="40" value="${h(p.category)}" list="categories"></label></div>
      <datalist id="categories"><option value="Кроссовки"><option value="Ботинки"><option value="Кеды"></datalist>
      <div class="split-form"><label>Цена, ₽<input name="price" required type="number" min="1" max="10000000" value="${h(p.price)}"></label>
      <label>Старая цена, ₽<input name="oldPrice" type="number" min="0" max="10000000" value="${p.oldPrice || ''}"></label></div>
      <label>Статус<select name="status">${Object.entries(productStatuses).map(([id, label]) => `<option value="${id}" ${id === p.status ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <label>Описание<textarea name="description" maxlength="2000" rows="3">${h(p.description)}</textarea></label>
      <label>Состояние<input name="condition" maxlength="80" value="${h(p.condition)}"></label>
      <label>Замеры или совет по размеру<textarea name="measurements" rows="2" maxlength="400">${h(p.measurements)}</textarea></label>
      <label>Пост в канале<input name="post" maxlength="150" value="${h(p.post)}" placeholder="https://t.me/канал/123"></label>
      <div class="editor-section"><h3>Фотографии</h3>
        <div class="editor-photos" id="editor-photos">${p.images.map(editorPhoto).join('')}</div>
        <label class="upload-label">${icon('photo')} Загрузить фото<input id="photo-upload" type="file" accept="image/jpeg,image/png,image/webp" multiple></label>
        <div class="photo-url-row"><input id="photo-url" type="url" placeholder="Или добавьте HTTPS-ссылку" aria-label="Ссылка на фото">
        ${iconButton('plus', 'add-photo-url', 'Добавить фото по ссылке')}</div>
        <p class="small-print">До 8 фотографий. JPEG, PNG, WebP до 6 МБ.</p>
      </div>
      <div class="editor-section"><div class="panel-head no-border"><h3>Размеры и остатки</h3><button type="button" class="text-button" data-action="add-variant">${icon('plus')} Размер</button></div>
        <div id="variant-rows">${p.variants.map(variantRow).join('')}</div><p class="small-print">Укажите доступное количество без уже зарезервированных пар.</p></div>
      <p class="form-error" role="alert"></p>
      <button type="submit" class="button primary full">Сохранить товар ${icon('check')}</button>
      ${p.id ? `<button type="button" class="text-button danger-text" data-action="${p.status === 'archived' ? 'confirm-purge' : 'confirm-archive'}" data-id="${h(p.id)}">${icon('archive')} ${p.status === 'archived' ? 'Удалить карточку' : 'Убрать в архив'}</button>` : ''}
    </form>`;
}

export function editorPhoto(url) {
  return `<div class="editor-photo"><input type="hidden" name="image" value="${h(url)}">${photo(url, '', '', true)}
    ${iconButton('close', 'remove-photo', 'Убрать фотографию')}</div>`;
}

export function archive(product) {
  return `${sheetHead('Убрать товар в архив?')}<div class="sheet-pad form-stack">
    <p>${h(productTitle(product))} исчезнет из витрины. Его можно снова опубликовать из архива.</p>
    <button class="button danger full" data-action="archive-product" data-id="${h(product.id)}">Убрать в архив</button>
    <button class="button secondary full" data-action="edit-product" data-id="${h(product.id)}">Вернуться к редактированию</button></div>`;
}

export function purge(product) {
  return `${sheetHead('Удалить карточку?')}<div class="sheet-pad form-stack">
    <p>${h(productTitle(product))} будет удалён без восстановления, если карточка ещё не связана с продажами или заказами.</p>
    <button class="button danger full" data-action="purge-product" data-id="${h(product.id)}" data-value="${product.updated}">Удалить карточку</button>
    <button class="button secondary full" data-action="edit-product" data-id="${h(product.id)}">Оставить в архиве</button></div>`;
}

function orderContact(order, { botLink, demo }) {
  const draft = encodeURIComponent(`Здравствуйте! По вашему заказу ${order.id}. `);
  const url = order.handle ? `https://t.me/${order.handle}?text=${draft}` :
    botLink && `${botLink}?start=contact_${order.id}`;
  const label = order.handle ? 'Написать покупателю в Telegram' : 'Открыть профиль через бота';
  return `<section class="order-contact" aria-label="Контакты покупателя">
    <div class="data-pair"><span>Покупатель</span><strong>${h(order.buyer)}</strong></div>
    <div class="data-pair"><span>Telegram ID</span><button type="button" class="text-button" data-action="copy" data-value="${h(order.user)}"
      aria-label="Скопировать Telegram ID ${h(order.user)}">${h(order.user)} ${icon('link')}</button></div>
    <div class="data-pair"><span>Юзернейм</span><strong>${order.handle ? '@' + h(order.handle) : 'Не указан'}</strong></div>
    ${demo ? `<button type="button" class="button secondary full" data-action="demo-contact">${icon('telegram')} ${label}</button>` :
      url ? `<a class="button secondary full" href="${h(url)}" target="_blank" rel="noopener noreferrer" data-action="telegram">${icon('telegram')} ${label}</a>` : ''}
    ${!order.handle ? '<p class="small-print">Доступ к профилю по ID зависит от настроек приватности Telegram.</p>' : ''}
  </section>`;
}

export function staffOrder(order, state) {
  return `${sheetHead(order.id, date(order.created))}
    <form id="staff-order-form" class="sheet-pad form-stack" data-id="${h(order.id)}" data-status="${h(order.status)}" data-tracking="${h(order.tracking)}">
      ${orderContact(order, state)}
      <div class="checkout-lines">${order.items.map(line => `<div class="checkout-line">${photo(line.image, '', 'small-photo', true)}<div><strong>${h(productTitle(line))}</strong><p>EU ${h(line.size)} · ${line.quantity} шт.</p></div><strong>${rub(line.price * line.quantity)}</strong></div>`).join('')}</div>
      <div class="data-pair"><span>Доставка</span><strong>${h(order.delivery.title)} · ${rub(order.delivery.price)}</strong></div>
      ${order.address ? `<div class="data-pair"><span>Город и пункт</span><strong>${h(order.address)}</strong></div>` : ''}
      ${order.comment ? `<div class="data-pair"><span>Комментарий</span><strong>${h(order.comment)}</strong></div>` : ''}
      <div class="data-pair"><span>Итого</span><strong>${rub(order.total)}</strong></div>
      <fieldset class="order-status-picker">
        <legend>Статус заказа</legend>
        <div>${Object.entries(statuses).map(([value, label]) => `<label><input type="radio" name="status" value="${value}"
          ${value === order.status ? 'checked' : ''}> <span>${label}</span></label>`).join('')}</div>
        <p class="small-print">${order.status === 'cancelled' ? 'При восстановлении заказа пары снова резервируются.' :
          order.status === 'shipped' || order.status === 'delivered' ? 'Отменяйте заказ после возврата пар на склад.' : 'Отмена возвращает пары на склад.'}</p>
      </fieldset>
      <label>Трек доставки<input name="tracking" maxlength="100" value="${h(order.tracking)}" placeholder="Номер СДЭК или другой службы"></label>
      <p class="form-error" role="alert"></p>
      <button class="button primary full" type="submit">Сохранить заказ ${icon('check')}</button>
    </form>`;
}

export function sale(state) {
  const available = state.staff.products.filter(p => p.status !== 'archived' && amount(p));
  return `${sheetHead('Внешняя продажа', 'Списание пары, проданной вне приложения')}
    ${available.length ? `<form id="sale-form" class="sheet-pad form-stack">
      <label>Товар<select name="product">${available.map(p => `<option value="${h(p.id)}">${h(productTitle(p))} · ${h(p.color)}</option>`).join('')}</select></label>
      <label>Размер EU<select name="variant"></select></label>
      <div class="split-form"><label>Количество<input name="quantity" type="number" min="1" value="1" required></label>
      <label>Цена за пару, ₽<input name="price" type="number" min="1" max="10000000" required></label></div>
      <label>Комментарий <span class="muted">по желанию</span><input name="note" maxlength="160" placeholder="Где продали пару"></label>
      <p class="form-error" role="alert"></p><button class="button primary full" type="submit">Записать продажу ${icon('check')}</button></form>` : '<div class="sheet-pad"><p>Для продажи нужны доступные пары на складе.</p></div>'}`;
}

export function saleHistory(sales) {
  return `${sheetHead('Внешние продажи')}<div class="sheet-pad form-stack">${sales.map(row => `<div class="data-pair">
    <span><b>${h(row.name)}</b><br>EU ${h(row.size)} · ${row.quantity} шт.<br>${date(row.created)}${row.note ? ' · ' + h(row.note) : ''}</span>
    <strong>${rub(row.price * row.quantity)}</strong></div>`).join('')}</div>`;
}

export function team(team) {
  return `${sheetHead('Команда')}<div class="sheet-pad form-stack">
    <p class="muted">Чтобы узнать свой ID, сотрудник может отправить боту команду /id.</p>
    <div class="team-list">${team.map(p => `<div class="team-row"><div><strong>${h(p.name || 'Пользователь Telegram')}</strong>
      <small>${p.role === 'owner' ? 'Владелец' : 'Администратор'} · ${h(p.id)}</small></div>
      ${p.role === 'admin' ? iconButton('close', 'confirm-admin-remove', 'Убрать доступ', `data-id="${h(p.id)}"`) : ''}</div>`).join('')}</div>
    <form id="team-form" class="form-stack"><label>Telegram ID сотрудника<input name="id" inputmode="numeric" pattern="[1-9][0-9]{0,15}" required placeholder="123456789"></label>
      <p class="form-error" role="alert"></p><button class="button primary full" type="submit">${icon('userplus')} Добавить администратора</button></form>
  </div>`;
}

export function removeAdmin(id) {
  return `${sheetHead('Убрать доступ?')}<div class="sheet-pad form-stack">
    <p>Пользователь с ID ${h(id)} потеряет доступ к панели магазина.</p><button class="button danger full" data-action="admin-remove" data-id="${h(id)}">Убрать доступ</button>
    <button class="button secondary full" data-action="team">Оставить доступ</button></div>`;
}
