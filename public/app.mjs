import * as shop from './shop.mjs';
import * as staff from './staff.mjs';
import { galleryMarkup, interruptPhoto, selectPhoto, syncPhoto } from './gallery.mjs';
import { attachPhotoZoom } from './photo-zoom.mjs';
import { empty, h, icon, iconButton, productLink, productTitle, rub, sheetHead } from './ui.mjs';

const byId = id => document.getElementById(id);
const main = byId('content');
const header = byId('header');
const dock = byId('dock');
const dialog = byId('sheet');
const dialogBody = byId('sheet-body');
const photoViewer = byId('photo-viewer');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const easeOut = 'cubic-bezier(.23, 1, .32, 1)';
const defaultFilters = () => ({ category: 'all', query: '', size: '', sort: 'recent', available: false });
const state = {
  profile: null, page: 'catalog', view: 'shop', adminTab: 'overview',
  filters: defaultFilters(), inventoryFilter: 'all', orderFilter: 'all', cart: [], cartExcluded: new Set(), products: [], orders: [],
};
let tg;
let token;
let photoZoom;
let sheet;
let returnFocus;
let toastTimer;
let cartBusy = false;
let productRoute = false;
let lastRefresh = 0;
let refreshingOnReturn = false;
let booting = false;
let sheetBusy = 0;
let renderedPage;
let pageMotion;
let sheetMotion;
let dockMarkup = '';

async function api(path, options = {}) {
  const method = options.method ?? 'GET';
  const headers = {};
  if (token) headers.authorization = 'Bearer ' + token;
  if (options.data) headers['content-type'] = 'application/json';
  let response;
  try {
    response = await fetch('/api/' + path, {
      method, headers, cache: 'no-store',
      body: options.blob ?? (options.data ? JSON.stringify(options.data) : undefined),
    });
  } catch {
    throw new Error('Проверьте подключение и попробуйте ещё раз.');
  }
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error ?? 'Попробуйте ещё раз');
    error.status = response.status;
    throw error;
  }
  return result;
}

async function loadTelegram() {
  if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return;
  await new Promise(resolve => {
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-web-app.js?62';
    const fallback = setTimeout(resolve, 4300);
    script.onload = script.onerror = () => { clearTimeout(fallback); resolve(); };
    document.head.append(script);
  });
  tg = window.Telegram?.WebApp;
  if (tg?.initData) document.documentElement.classList.add('telegram-app');
  if (tg?.isVersionAtLeast?.('6.2')) tg.enableClosingConfirmation?.();
  if (tg?.isVersionAtLeast?.('7.7')) tg.disableVerticalSwipes?.();
  tg?.ready?.();
  tg?.expand?.();
  try {
    tg?.setHeaderColor('#edf0f8');
    tg?.setBackgroundColor('#edf0f8');
    tg?.setBottomBarColor('#edf0f8');
  } catch { /* Older Telegram clients use their default chrome. */ }
  tg?.BackButton?.onClick(back);
  tg?.onEvent?.('activated', refreshOnReturn);
}

function install(data) {
  const { token: issued, ...snapshot } = data;
  if (issued) token = issued;
  if (state.profile?.id !== snapshot.profile.id) state.cartExcluded.clear();
  Object.assign(state, snapshot);
  const variants = new Set(state.cart.map(line => line.variant));
  for (const id of state.cartExcluded) if (!variants.has(id)) state.cartExcluded.delete(id);
}

async function refresh() {
  install(await api('shop'));
  lastRefresh = Date.now();
  if (state.profile.role === 'buyer' && state.view === 'admin') {
    state.view = 'shop';
    closeSheet();
  }
  if (state.view === 'admin') state.staff = await api('staff/data');
}

async function refreshOnReturn() {
  if (!state.profile || state.demo || refreshingOnReturn || cartBusy || sheetBusy || Date.now() - lastRefresh < 15000) return;
  refreshingOnReturn = true;
  try {
    await refresh();
    if (!sheet && !cartBusy && !(document.activeElement instanceof HTMLInputElement) &&
        !(document.activeElement instanceof HTMLTextAreaElement) &&
        !(document.activeElement instanceof HTMLSelectElement) &&
        !(state.view === 'admin' && state.adminTab === 'settings')) render();
  } catch (error) {
    if (error.status === 401 && !sheet) showToast(error.message);
  } finally { refreshingOnReturn = false; }
}

function render() {
  header.innerHTML = shop.header(state);
  renderDock();
  if (!state.profile) return;
  const buyer = { catalog: shop.catalog, cart: shop.cart, orders: shop.buyerOrders };
  const admin = { overview: staff.overview, inventory: staff.inventory, 'manage-orders': staff.manageOrders, settings: staff.settings };
  const isAdmin = state.view === 'admin';
  const page = isAdmin ? state.adminTab : state.page;
  const nextPage = `${state.view}/${page}`;
  main.innerHTML = (isAdmin ? admin : buyer)[page](state);
  if (renderedPage && renderedPage !== nextPage && !reducedMotion.matches && main.animate) {
    const current = pageMotion?.playState === 'running' ? getComputedStyle(main) : null;
    const from = current ? { opacity: current.opacity, transform: current.transform } :
      { opacity: .65, transform: 'translateY(6px)' };
    pageMotion?.cancel();
    pageMotion = main.animate([from, { opacity: 1, transform: 'none' }], { duration: 200, easing: easeOut });
  }
  renderedPage = nextPage;
  if (byId('cart-select-all')) syncCartSelectAll(shop.cartItems(state));
  syncBack();
}

function syncCartSelectAll(items) {
  const available = items.filter(line => line.available);
  const selected = available.filter(line => line.selected).length;
  const control = byId('cart-select-all');
  control.checked = selected > 0 && selected === available.length;
  control.indeterminate = selected > 0 && selected < available.length;
}

function renderDock() {
  dock.hidden = !state.profile;
  dock.classList.toggle('staff-dock', state.view === 'admin');
  const markup = state.profile ? shop.dock(state) : '';
  if (markup === dockMarkup) return;
  const focused = dock.contains(document.activeElement) ? document.activeElement.dataset.id : '';
  dock.innerHTML = markup;
  dockMarkup = markup;
  if (focused) dock.querySelector(`[data-id="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
}

function showToast(message) {
  clearTimeout(toastTimer);
  const notice = byId(dialog.open ? 'sheet-notice' : 'notice');
  byId('notice').classList.remove('visible');
  byId('sheet-notice').classList.remove('visible');
  notice.textContent = message;
  notice.classList.add('visible');
  toastTimer = setTimeout(() => notice.classList.remove('visible'), 3200);
}

function syncBack() {
  if (sheet || (state.view === 'shop' && state.page !== 'catalog') || (state.view === 'admin' && state.adminTab !== 'overview')) {
    tg?.BackButton?.show();
  } else {
    tg?.BackButton?.hide();
  }
}

function back() {
  if (photoViewer.open) { photoViewer.close(); return; }
  if (sheet) { closeSheet(); return; }
  if (state.view === 'admin') { setAdminTab('overview'); return; }
  go('catalog');
}

function top() { window.scrollTo({ top: 0, behavior: 'instant' }); }

function go(page) {
  if (!['catalog', 'cart', 'orders'].includes(page)) return;
  if (state.guest && page !== 'catalog') {
    openSheet('telegram-entry', { page });
    return;
  }
  state.view = 'shop';
  state.page = page;
  render();
  top();
  if (page !== 'catalog') refreshOnReturn();
}

function setAdminTab(tab) {
  if (!['overview', 'inventory', 'manage-orders', 'settings'].includes(tab)) return;
  state.adminTab = tab;
  render();
  top();
  if (tab !== 'settings' && tab !== 'inventory') refreshOnReturn();
}

function addProductRoute(id) {
  const url = new URL(location.href);
  url.searchParams.set('product', id);
  url.searchParams.delete('tgWebAppStartParam');
  history.pushState({ fffProduct: true }, '', url);
  productRoute = true;
}

function clearItemRoute(fromHistory = false) {
  const url = new URL(location.href);
  if (productRoute && !fromHistory && history.state?.fffProduct) {
    productRoute = false;
    history.back();
    return;
  }
  productRoute = false;
  if (!['product', 'tgWebAppStartParam', 'order'].some(key => url.searchParams.has(key))) return;
  url.searchParams.delete('product');
  url.searchParams.delete('tgWebAppStartParam');
  url.searchParams.delete('order');
  history.replaceState(null, '', url);
}

const sheetRenderers = {
  product: () => shop.details(state, sheet),
  checkout: () => shop.checkout(state, sheet),
  success: () => shop.success(state, sheet.order),
  about: () => shop.about(state),
  profile: () => shop.profile(state),
  'telegram-entry': () => shop.telegramEntry(state, sheet.page),
  manager: () => shop.manager(state, state.products.find(p => p.id === sheet.id)),
  'manager-sent': () => shop.managerSent(state),
  filters: () => shop.filters(state),
  drop: () => staff.dropEditor(state),
  'buyer-order': () => shop.orderDetails(state.orders.find(o => o.id === sheet.id)),
  'staff-order': () => staff.staffOrder(state.staff.orders.find(o => o.id === sheet.id), state),
  editor: () => staff.editor(state.staff.products.find(p => p.id === sheet.id)),
  archive: () => staff.archive(state.staff.products.find(p => p.id === sheet.id)),
  purge: () => staff.purge(state.staff.products.find(p => p.id === sheet.id)),
  sale: () => staff.sale(state),
  'sale-history': () => staff.saleHistory(state.staff.sales),
  team: () => staff.team(sheet.team),
  'remove-admin': () => staff.removeAdmin(sheet.id),
  copy: () => `${sheetHead('Скопировать')}<div class="sheet-pad form-stack"><label>Ссылка или номер<input value="${h(sheet.value)}" readonly data-select></label></div>`,
};

function renderSheet(restore) {
  dialog.className = sheet.type === 'product' ? 'wide-sheet' : '';
  dialogBody.innerHTML = sheetRenderers[sheet.type]();
  if (sheet.type === 'product' && dialog.open) selectPhoto(dialogBody.querySelector('[data-photo-gallery]'), sheet.image);
  if (sheet.type === 'sale') fillSaleForm();
  if (restore) {
    const selector = `[data-action="${restore.action}"][data-id="${CSS.escape(restore.id ?? '')}"]`;
    const candidate = dialog.querySelector(selector) ?? dialog.querySelector(`[data-action="${restore.action}"][data-value="${CSS.escape(restore.value ?? '')}"]`) ??
      dialog.querySelector(`[data-action="${restore.action}"]`);
    if (candidate && !candidate.disabled) candidate.focus({ preventScroll: true });
  }
}

function openSheet(type, options = {}, { reset = true } = {}) {
  const changedSection = dialog.open && sheet?.type !== type;
  if (!dialog.open) returnFocus = document.activeElement;
  sheet = { type, ...options };
  renderSheet();
  const notice = byId('sheet-notice');
  notice.classList.remove('visible');
  notice.textContent = '';
  if (!dialog.open) dialog.showModal();
  if (type === 'product') selectPhoto(dialogBody.querySelector('[data-photo-gallery]'), sheet.image);
  if (reset) {
    dialog.scrollTop = 0;
    const first = [...dialog.querySelectorAll('[data-action="close"]')].find(el => el.getClientRects().length);
    first?.focus({ preventScroll: true });
  }
  if (changedSection && !reducedMotion.matches && dialogBody.animate) {
    sheetMotion?.cancel();
    sheetMotion = dialogBody.animate([{ opacity: .65 }, { opacity: 1 }], { duration: 165, easing: easeOut });
  }
  syncBack();
}

function closeSheet(fromHistory = false) {
  if (sheetBusy) return;
  const hadSheet = !!sheet;
  sheet = undefined;
  sheetMotion?.cancel();
  if (photoViewer.open) photoViewer.close();
  if (dialog.open) dialog.close();
  byId('sheet-notice').classList.remove('visible');
  if (hadSheet) clearItemRoute(fromHistory);
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  returnFocus = undefined;
  syncBack();
}

function openProduct(id, initial = false) {
  if (!initial && !dialog.open) addProductRoute(id);
  openSheet('product', { id, image: 0 });
}

function changePhoto(gallery, index, smooth = !reducedMotion.matches) {
  if (!gallery || sheet?.type !== 'product') return;
  const previous = Number(gallery.dataset.current);
  const count = gallery.querySelector('.photo-track').childElementCount;
  if (index >= 0 && index < count && index !== previous && photoViewer.contains(gallery)) {
    photoZoom?.reset();
  }
  sheet.image = selectPhoto(gallery, index, smooth);
}

function stepPhoto(gallery, direction, smooth) {
  changePhoto(gallery, Number(gallery.dataset.current) + direction, smooth);
}

function openPhoto(index) {
  const product = state.products.find(p => p.id === sheet.id);
  if (!product?.images[index]) return;
  photoViewer.dataset.product = product.id;
  photoViewer.innerHTML = `${galleryMarkup(product, index, true)}
    <div class="photo-viewer-heading"><h2 id="photo-viewer-title">${h(productTitle(product))}</h2>
    ${iconButton('close', 'close-photo', 'Закрыть полноэкранный просмотр', 'autofocus')}</div>
    <div class="photo-zoom-controls" role="group" aria-label="Масштаб фото">
      <button class="icon-button" type="button" data-zoom="out" aria-label="Уменьшить фото" aria-disabled="true">${icon('minus')}</button>
      <button type="button" data-zoom="reset" aria-label="Сбросить масштаб" title="Сбросить масштаб">100%</button>
      <button class="icon-button" type="button" data-zoom="in" aria-label="Приблизить фото" aria-disabled="false">${icon('plus')}</button>
    </div>`;
  photoViewer.showModal();
  const gallery = photoViewer.querySelector('[data-photo-gallery]');
  sheet.image = selectPhoto(gallery, index);
  photoZoom = attachPhotoZoom(photoViewer, direction => stepPhoto(gallery, direction), reducedMotion);
  photoViewer.querySelector('[data-action="close-photo"]').focus({ preventScroll: true });
}

function showDetailError(message) {
  const target = byId('detail-error');
  if (target) target.textContent = message;
}

function chosenSize() {
  const product = state.products.find(p => p.id === sheet.id);
  const variant = product?.variants.find(v => v.id === sheet.variant && v.stock > 0);
  if (!variant) {
    const picker = byId('size-picker');
    sheet.sizePrompt = 'Выберите доступный размер EU.';
    picker.classList.add('needs-size');
    if (!byId('size-feedback').textContent) byId('size-feedback').textContent = sheet.sizePrompt;
    picker.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    picker.querySelector('[data-action="size"]:enabled')?.focus({ preventScroll: true });
  }
  return { product, variant };
}

function openCheckout(lines, fromCart) {
  openSheet('checkout', { lines, fromCart, request: crypto.randomUUID() });
}

function updateQtyAndTotal(form) {
  const chosen = form.elements.delivery.value;
  if (!sheet.fromCart) {
    const line = sheet.lines[0];
    const requested = Number(form.elements.quantity?.value ?? 1);
    if (Number.isInteger(requested) && requested >= 1 && requested <= line.stock) line.quantity = requested;
  }
  const { subtotal, total } = shop.checkoutTotal(state, sheet, chosen);
  byId('checkout-subtotal').textContent = rub(subtotal);
  byId('checkout-total').textContent = rub(total);
  if (!sheet.fromCart) form.querySelector('.checkout-line > strong:last-child').textContent = rub(subtotal);
  return total;
}

function fillSaleForm() {
  const form = byId('sale-form');
  if (!form) return;
  const product = state.staff.products.find(p => p.id === form.elements.product.value);
  const available = product.variants.filter(v => v.stock > 0);
  form.elements.variant.innerHTML = available.map(v => `<option value="${h(v.id)}">EU ${h(v.size)} · ${v.stock} шт.</option>`).join('');
  form.elements.price.value = product.price;
  saleQuantity(form);
}

function updateDropPreview(form) {
  byId('drop-preview').innerHTML = staff.dropPreview(state, values(form));
}

function saleQuantity(form) {
  const product = state.staff.products.find(p => p.id === form.elements.product.value);
  const variant = product?.variants.find(v => v.id === form.elements.variant.value);
  if (!variant) return;
  form.elements.quantity.max = Math.min(variant.stock, 1000);
  form.elements.quantity.value = Math.min(Number(form.elements.quantity.value) || 1, variant.stock);
}

function openTelegram(url) {
  const link = new URL(url);
  if (link.protocol !== 'https:' || link.hostname !== 't.me') return;
  if (tg?.initData && tg.openTelegramLink) tg.openTelegramLink(link.href);
  else window.open(link.href, '_blank', 'noopener,noreferrer');
}

function allowBot() {
  if (tg?.isVersionAtLeast?.('6.9') && tg.requestWriteAccess) {
    tg.requestWriteAccess(allowed => {
      if (!allowed) { showToast('Нажмите Start в чате бота, чтобы получать сообщения'); return; }
      state.profile.reachable = true;
      if (sheet?.type === 'profile' || sheet?.type === 'success') renderSheet();
      showToast('Сообщения в Telegram включены');
    });
  } else if (state.botLink) openTelegram(state.botLink + '?start=notifications');
}

async function copy(value) {
  try {
    await navigator.clipboard.writeText(value);
    showToast('Скопировано');
  } catch {
    openSheet('copy', { value });
    dialog.querySelector('[data-select]').select();
  }
}

function focusCatalog(search = false) {
  if (state.view !== 'shop' || state.page !== 'catalog') go('catalog');
  const options = { behavior: reducedMotion.matches ? 'instant' : 'smooth' };
  byId('catalog-section').scrollIntoView(options);
  if (search) byId('catalog-search').focus({ preventScroll: true });
}

function updateResults() {
  byId('product-grid').innerHTML = shop.catalogResults(state);
  byId('results-count').textContent = shop.visibleProducts(state).length;
}

async function changeCart(variant, quantity, button) {
  if (cartBusy) return;
  cartBusy = true;
  button.disabled = true;
  try {
    state.cart = await api('cart', { method: 'PUT', data: { variant, quantity } });
    if (quantity === 0) state.cartExcluded.delete(variant);
    if (state.page === 'cart') {
      render();
      const buttons = [...main.querySelectorAll('[data-action="cart-qty"]')];
      buttons.find(el => el.dataset.id === variant && el.dataset.value === String(quantity - 1))?.focus({ preventScroll: true });
    } else renderDock();
    if (button.dataset.action === 'add-cart') {
      tg?.HapticFeedback?.impactOccurred?.('light');
      showToast('Пара добавлена в корзину');
      const detail = byId('detail-error');
      if (detail) detail.innerHTML = `Добавлено. <button class="text-button" data-action="show-cart">Открыть корзину ${icon('arrow')}</button>`;
    }
  } catch (error) {
    if (error.status === 409) {
      try {
        await refresh();
        render();
        if (sheet?.type === 'product') renderSheet();
      } catch { /* The original stock error is still relevant. */ }
    }
    if (sheet?.type === 'product') showDetailError(error.message);
    else showToast(error.message);
  } finally {
    cartBusy = false;
    if (button.isConnected) button.disabled = false;
  }
}

async function demoRole(role) {
  install(await api('session/demo-role', { method: 'POST', data: { role } }));
  closeSheet();
  state.view = role === 'owner' ? 'admin' : 'shop';
  state.page = 'catalog';
  state.adminTab = 'overview';
  if (state.view === 'admin') state.staff = await api('staff/data');
  render();
  top();
}

async function showTeam() {
  openSheet('team', { team: await api('staff/team') });
}

function addPhoto(url) {
  const photos = byId('editor-photos');
  if (!photos) return;
  if (photos.children.length >= 8) throw new Error('Можно добавить до восьми фотографий.');
  photos.insertAdjacentHTML('beforeend', staff.editorPhoto(url));
}

const actions = {
  home: () => state.view === 'admin' ? setAdminTab('overview') : go('catalog'),
  go: el => go(el.dataset.id),
  browse: () => focusCatalog(),
  search: () => focusCatalog(true),
  about: () => openSheet('about'),
  profile: () => openSheet('profile'),
  filters: () => openSheet('filters'),
  'clear-filters': () => { state.filters = defaultFilters(); render(); },
  category: el => {
    state.filters.category = el.dataset.id;
    for (const chip of main.querySelectorAll('[data-action="category"]')) {
      const selected = chip === el;
      chip.classList.toggle('is-active', selected);
      chip.setAttribute('aria-pressed', selected);
    }
    updateResults();
  },
  product: el => openProduct(el.dataset.id),
  close: () => closeSheet(),
  size: el => {
    sheet.variant = el.dataset.id;
    delete sheet.sizePrompt;
    renderSheet(el.dataset);
  },
  gallery: el => changePhoto(el.closest('[data-photo-gallery]'), Number(el.dataset.value)),
  'open-photo': el => openPhoto(Number(el.dataset.value)),
  'close-photo': () => photoViewer.close(),
  'previous-photo': el => stepPhoto(el.closest('[data-photo-gallery]'), -1),
  'next-photo': el => stepPhoto(el.closest('[data-photo-gallery]'), 1),
  measurements: el => { sheet.measurements = !sheet.measurements; renderSheet(el.dataset); },
  manager: el => openSheet('manager', { id: el.dataset.id }),
  telegram: (el, event) => {
    if (el instanceof HTMLAnchorElement) {
      if (!tg?.initData || !tg.openTelegramLink || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
    }
    openTelegram(el.dataset.url ?? el.href);
  },
  'demo-contact': () => showToast('Демо. В рабочем магазине здесь откроется Telegram.'),
  'allow-bot': allowBot,
  'add-cart': el => {
    const { variant } = chosenSize();
    if (variant) {
      const qty = state.cart.find(line => line.variant === variant.id)?.quantity ?? 0;
      if (qty >= variant.stock) showDetailError('Все доступные пары этого размера уже в корзине.');
      else return changeCart(variant.id, qty + 1, el);
    }
  },
  'cart-qty': el => changeCart(el.dataset.id, Number(el.dataset.value), el),
  'show-cart': () => { closeSheet(); go('cart'); },
  buy: () => {
    const { product, variant } = chosenSize();
    if (variant) openCheckout([{ ...variant, variant: variant.id, product, quantity: 1 }], false);
  },
  'cart-checkout': () => {
    if (cartBusy) return;
    const lines = shop.cartItems(state).filter(line => line.selected);
    if (lines.length) openCheckout(lines.map(({ item, variant, quantity }) => ({ ...item, variant, quantity })), true);
  },
  'buyer-order': el => openSheet('buyer-order', { id: el.dataset.id }),
  'success-orders': () => { closeSheet(); go('orders'); },
  'success-catalog': () => { closeSheet(); go('catalog'); },
  copy: el => copy(el.dataset.value),
  'demo-owner': () => demoRole('owner'),
  'demo-buyer': () => demoRole('buyer'),
  'view-shop': () => { closeSheet(); go('catalog'); },
  'view-admin': async () => {
    state.staff = await api('staff/data');
    closeSheet();
    state.view = 'admin';
    setAdminTab('overview');
  },
  'admin-tab': el => setAdminTab(el.dataset.id),
  'inventory-filter': el => { state.inventoryFilter = el.dataset.id; render(); },
  'order-filter': el => { state.orderFilter = el.dataset.id; render(); },
  'new-product': () => openSheet('editor', { request: crypto.randomUUID() }),
  'edit-drop': () => openSheet('drop'),
  'edit-product': el => openSheet('editor', { id: el.dataset.id }),
  'confirm-archive': el => openSheet('archive', { id: el.dataset.id }),
  'archive-product': async el => {
    await api('staff/product/' + el.dataset.id, { method: 'DELETE' });
    await refresh();
    closeSheet();
    render();
    showToast('Товар в архиве');
  },
  'confirm-purge': el => openSheet('purge', { id: el.dataset.id }),
  'purge-product': async el => {
    await api('staff/product/' + el.dataset.id + '/purge', { method: 'DELETE', data: { updated: Number(el.dataset.value) } });
    await staffSaved('Карточка удалена');
  },
  'share-product': el => copy(productLink(state, el.dataset.id)),
  'staff-order': el => openSheet('staff-order', { id: el.dataset.id }),
  'add-variant': () => {
    const rows = byId('variant-rows');
    if (rows.children.length >= 40) throw new Error('Можно добавить до 40 размеров.');
    rows.insertAdjacentHTML('beforeend', staff.variantRow());
    rows.lastElementChild.querySelector('input').focus();
  },
  'add-delivery': () => {
    const rows = byId('delivery-rows');
    if (rows.children.length >= 8) throw new Error('Можно добавить до восьми способов доставки.');
    rows.insertAdjacentHTML('beforeend', staff.deliveryRow());
    rows.lastElementChild.querySelector('input[name="delivery-title"]').focus();
  },
  'remove-row': el => {
    const row = el.closest('.variant-editor,.delivery-editor');
    if (row.parentElement.children.length > 1) row.remove();
    else showToast('Оставьте хотя бы одну строку.');
  },
  'remove-photo': el => el.closest('.editor-photo').remove(),
  'add-photo-url': () => {
    const input = byId('photo-url');
    if (!input.value.trim()) { input.focus(); return; }
    if (!/^https:\/\//i.test(input.value) || !input.reportValidity()) throw new Error('Введите HTTPS-ссылку на фото.');
    addPhoto(input.value.trim());
    input.value = '';
  },
  sale: () => openSheet('sale', { request: crypto.randomUUID() }),
  'sale-history': () => openSheet('sale-history'),
  team: showTeam,
  'confirm-admin-remove': el => openSheet('remove-admin', { id: el.dataset.id }),
  'admin-remove': async el => {
    const team = await api('staff/team', { method: 'POST', data: { id: el.dataset.id, remove: true } });
    openSheet('team', { team });
    showToast('Доступ убран');
  },
  retry: start,
};

document.addEventListener('click', async event => {
  const el = event.target.closest('[data-action]');
  if (!el || el.disabled || !actions[el.dataset.action]) return;
  try { await actions[el.dataset.action](el, event); } catch (error) { showToast(error.message); }
});

dialog.addEventListener('cancel', event => { event.preventDefault(); closeSheet(); });
photoViewer.addEventListener('close', () => {
  if (photoViewer.open) return;
  photoZoom = undefined;
  if (!dialog.open || sheet?.type !== 'product' || sheet.id !== photoViewer.dataset.product) return;
  sheet.image = Number(photoViewer.querySelector('[data-photo-gallery]').dataset.current);
  const gallery = dialogBody.querySelector('[data-photo-gallery]');
  selectPhoto(gallery, sheet.image);
  gallery?.querySelector('.gallery-photo[tabindex="0"]')?.focus({ preventScroll: true });
});

for (const modal of [dialog, photoViewer]) {
  const interrupt = event => {
    const track = event.target.closest?.('.photo-track');
    if (!track || sheet?.type !== 'product') return;
    const index = interruptPhoto(track.closest('[data-photo-gallery]'));
    if (index !== undefined) sheet.image = index;
  };
  if (modal === dialog) modal.addEventListener('pointerdown', interrupt, { passive: true });
  modal.addEventListener('wheel', interrupt, { passive: true });

  modal.addEventListener('scroll', event => {
    if (!event.target.matches?.('.photo-track') || event.target.classList.contains('is-swiping')) return;
    const gallery = event.target.closest('[data-photo-gallery]');
    const index = syncPhoto(gallery);
    if (sheet?.type === 'product' && (photoViewer.open ? modal === photoViewer : modal === dialog)) sheet.image = index;
  }, { capture: true, passive: true });

  modal.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const gallery = modal.querySelector('[data-photo-gallery]');
    if (!gallery || !gallery.querySelector('[data-action="next-photo"]')) return;
    event.preventDefault();
    stepPhoto(gallery, event.key === 'ArrowLeft' ? -1 : 1, false);
  });
}
window.addEventListener('resize', () => { if (photoViewer.open) photoZoom?.resize(); });

let pointerOutside = false;
dialog.addEventListener('pointerdown', event => { pointerOutside = event.target === dialog; });
dialog.addEventListener('click', event => { if (pointerOutside && event.target === dialog) closeSheet(); pointerOutside = false; });
window.addEventListener('popstate', () => {
  if (photoViewer.open) photoViewer.close();
  const id = new URLSearchParams(location.search).get('product');
  if (id && state.profile) {
    productRoute = Boolean(history.state?.fffProduct);
    openProduct(id, true);
  }
  else if (sheet?.type === 'product' || sheet?.type === 'checkout' || sheet?.type === 'manager') closeSheet(true);
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshOnReturn(); });

document.addEventListener('input', event => {
  if (event.target.id === 'catalog-search') {
    state.filters.query = event.target.value;
    updateResults();
  }
  if (event.target.closest('#checkout-form')) updateQtyAndTotal(event.target.form);
  if (event.target.form?.id === 'drop-form' && event.target.name === 'title') updateDropPreview(event.target.form);
});

document.addEventListener('change', async event => {
  const input = event.target;
  try {
    if (input.form?.id === 'drop-form') {
      const form = input.form;
      const manual = form.elements.mode.value === 'manual';
      byId('drop-manual-fields').hidden = !manual;
      form.elements.productId.required = manual;
      if (input.name === 'productId') {
        const product = state.products.find(p => p.id === input.value);
        form.elements.cover.innerHTML = staff.dropCoverOptions(product);
      }
      updateDropPreview(form);
    }
    if (input.id === 'cart-select-all' || input.dataset.cartSelect) {
      const checks = input.id === 'cart-select-all' ? [...main.querySelectorAll('[data-cart-select]:enabled')] : [input];
      for (const check of checks) {
        check.checked = input.checked;
        if (check.checked) state.cartExcluded.delete(check.dataset.cartSelect);
        else state.cartExcluded.add(check.dataset.cartSelect);
      }
      const items = shop.cartItems(state);
      syncCartSelectAll(items);
      byId('cart-receipt').innerHTML = shop.cartReceipt(items);
    }
    if (input.form?.id === 'sale-form') {
      if (input.name === 'product') fillSaleForm();
      if (input.name === 'variant') saleQuantity(input.form);
    }
    if (input.dataset.toggle === 'reminders') {
      input.disabled = true;
      try {
        state.profile = await api('staff/reminders', { method: 'PUT', data: { enabled: input.checked } });
        showToast(input.checked ? 'Напоминания включены' : 'Напоминания выключены');
      } catch (error) {
        input.checked = !input.checked;
        throw error;
      } finally { input.disabled = false; }
    }
    if (input.id === 'photo-upload' && input.files.length) {
      const files = [...input.files];
      const form = input.form;
      const submitButton = form.querySelector('[type="submit"]');
      input.disabled = true;
      submitButton.disabled = true;
      sheetBusy += 1;
      try {
        for (const blob of files) {
          if (byId('editor-photos').children.length >= 8) throw new Error('Можно добавить до восьми фотографий.');
          if (blob.size > 6 * 1024 * 1024) throw new Error('Фото должно весить до 6 МБ.');
          const result = await api('staff/photo', { method: 'POST', blob });
          addPhoto(result.url);
        }
        showToast('Фото загружены');
      } finally {
        sheetBusy -= 1;
        input.disabled = false;
        submitButton.disabled = false;
        input.value = '';
      }
    }
  } catch (error) { showToast(error.message); }
});

function values(form) { return Object.fromEntries(new FormData(form)); }

const forms = {
  'filter-form': form => {
    const { size, sort, available } = values(form);
    state.filters = { ...state.filters, size, sort, available: !!available };
    return () => { closeSheet(); render(); focusCatalog(); };
  },
  'manager-form': async form => {
    const question = form.elements.question.value.trim();
    if (form.dataset.url) {
      openTelegram(form.dataset.url + '?text=' + encodeURIComponent(form.dataset.prefix + question));
      return;
    }
    await api('manager/question', { method: 'POST', data: { question, product: form.dataset.product } });
    return () => openSheet('manager-sent');
  },
  'checkout-form': async form => {
    const data = values(form);
    const total = updateQtyAndTotal(form);
    const { request, fromCart, lines } = sheet;
    const order = await api('orders', {
      method: 'POST', data: {
        request, fromCart, total, items: lines.map(({ variant, quantity }) => ({ variant, quantity })),
        delivery: data.delivery, address: data.address, comment: data.comment,
      },
    });
    state.orders = [order, ...state.orders.filter(item => item.id !== order.id)];
    if (fromCart) {
      const purchased = new Map(order.items.map(({ variant, quantity }) => [variant, quantity]));
      state.cart = state.cart.map(line => ({ ...line, quantity: line.quantity - (purchased.get(line.variant) ?? 0) }))
        .filter(line => line.quantity > 0);
    }
    try { await refresh(); } catch { /* The server already confirmed the order. */ }
    return () => {
      go('catalog');
      tg?.HapticFeedback?.notificationOccurred?.('success');
      openSheet('success', { order });
    };
  },
  'product-form': async form => {
    const data = new FormData(form);
    const fields = Object.fromEntries(data);
    const size = data.getAll('size');
    const stock = data.getAll('stock');
    await api('staff/product', {
      method: 'POST', data: {
        ...fields, id: form.dataset.id, updated: Number(form.dataset.updated), request: sheet.request,
        price: Number(fields.price), oldPrice: Number(fields.oldPrice),
        images: data.getAll('image'), variants: size.map((s, index) => ({ size: s, stock: Number(stock[index]) })),
      },
    });
    return () => staffSaved('Товар сохранён');
  },
  'staff-order-form': async form => {
    await api('staff/order/' + form.dataset.id, {
      method: 'PATCH',
      data: { ...values(form), expectedStatus: form.dataset.status, expectedTracking: form.dataset.tracking },
    });
    return () => staffSaved('Заказ обновлён');
  },
  'sale-form': async form => {
    const data = values(form);
    await api('staff/sale', { method: 'POST', data: { ...data, quantity: Number(data.quantity), price: Number(data.price), request: sheet.request } });
    return () => staffSaved('Продажа записана, остаток обновлён');
  },
  'settings-form': async form => {
    const data = new FormData(form);
    const delivery = data.getAll('delivery-title').map((title, i) => ({
      title, detail: data.getAll('delivery-detail')[i], price: Number(data.getAll('delivery-price')[i]),
      id: data.getAll('delivery-id')[i] || crypto.randomUUID(),
    }));
    state.settings = await api('staff/settings', { method: 'PUT', data: { ...Object.fromEntries(data), delivery } });
    return () => { render(); showToast('Настройки сохранены'); };
  },
  'drop-form': async form => {
    const drop = await api('staff/drop', { method: 'PUT', data: values(form) });
    state.settings = { ...state.settings, drop };
    return () => {
      closeSheet();
      render();
      main.querySelector('[data-action="edit-drop"]')?.focus({ preventScroll: true });
      showToast('Дроп обновлён');
    };
  },
  'team-form': async form => {
    const team = await api('staff/team', { method: 'POST', data: values(form) });
    return () => { openSheet('team', { team }); showToast('Доступ администратора добавлен'); };
  },
};

async function staffSaved(message) {
  closeSheet();
  showToast(message);
  await refresh();
  render();
}

document.addEventListener('submit', async event => {
  const form = event.target;
  if (!forms[form.id]) return;
  event.preventDefault();
  if (form.dataset.submitting === '1' || (dialog.contains(form) && sheetBusy)) return;
  const button = event.submitter ?? form.querySelector('[type="submit"]');
  const errorText = form.querySelector('.form-error');
  if (errorText) errorText.textContent = '';
  const lockSheet = dialog.contains(form);
  if (lockSheet) sheetBusy += 1;
  form.dataset.submitting = '1';
  if (button) button.disabled = true;
  let after;
  try {
    after = await forms[form.id](form);
  } catch (error) {
    if (errorText) errorText.textContent = error.message;
    else showToast(error.message);
    if (error.status === 409 && lockSheet) {
      try { await refresh(); render(); } catch { /* Keep the original validation message. */ }
    }
  } finally {
    if (lockSheet) sheetBusy -= 1;
    delete form.dataset.submitting;
    if (button) button.disabled = false;
  }
  try { await after?.(); } catch (error) { showToast(error.message); }
});

async function start() {
  if (booting) return;
  booting = true;
  header.innerHTML = shop.header(state);
  main.innerHTML = '<div class="startup" role="status"><span class="spinner"></span> Открываем витрину</div>';
  try {
    if (!tg) await loadTelegram();
    const params = new URLSearchParams(location.search);
    const snapshot = await api('session', { method: 'POST', data: { initData: tg?.initData ?? '' } });
    install(snapshot);
    lastRefresh = Date.now();
    const startParam = state.start || params.get('tgWebAppStartParam') || '';
    const id = /^p_([\w-]{1,80})$/.exec(startParam)?.[1] || params.get('product');
    const orderId = /^(FFF-[A-F0-9]{10})$/.exec(params.get('order'))?.[1];
    const wantsBuyer = id || params.get('view') === 'shop';
    state.view = !wantsBuyer && state.profile.role !== 'buyer' ? 'admin' : 'shop';
    const orderLink = !id && orderId && !state.guest;
    const isAdmin = state.view === 'admin';
    if (isAdmin) state.staff = await api('staff/data');
    if (orderLink) {
      if (isAdmin) state.adminTab = 'manage-orders';
      else state.page = 'orders';
    }
    render();
    if (id) openProduct(id, true);
    else if (orderLink && (isAdmin ? state.staff.orders : state.orders).some(order => order.id === orderId)) {
      openSheet(isAdmin ? 'staff-order' : 'buyer-order', { id: orderId });
    }
  } catch (error) {
    main.innerHTML = empty('telegram', error.status === 401 ? 'Откройте магазин в Telegram' : 'Витрина недоступна',
      error.message, error.status === 401 && !tg?.initData ? '' : 'retry', 'Попробовать снова');
  } finally { booting = false; }
}

start();
