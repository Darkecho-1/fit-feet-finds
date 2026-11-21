import { amount, h, icon, photo, productTitle } from './ui.mjs';

export const availableDrops = products => products.filter(product => product.status === 'published' && amount(product) > 0);

export function resolveDrop(products, settings) {
  if (settings?.mode === 'off') return null;
  const candidates = availableDrops(products);
  const picked = settings?.mode === 'manual' && candidates.find(p => p.id === settings.productId);
  const product = picked || candidates[0];
  if (!product) return null;
  return {
    product,
    manual: Boolean(picked),
    title: picked ? settings.title : '',
    cover: picked && product.images.includes(settings.cover) ? settings.cover : product.images[0],
  };
}

export function dropBanner(entry, preview = false) {
  if (!entry) return '';
  const { product, manual, title, cover } = entry;
  const editorial = product.id === 'timberland-wheat' && cover === product.images[0] && !!cover;
  const heading = preview ? 'h3' : 'h1';
  const id = preview ? 'drop-preview-title' : 'hero-title';
  const button = manual ? 'Смотреть дроп' : 'Смотреть товар';
  return `<section class="hero ${editorial ? 'hero-editorial' : 'hero-standard'}${cover ? ' has-cover' : ''}${preview ? ' hero-preview' : ''}" aria-labelledby="${id}">
    ${cover ? `<div class="hero-art">${photo(cover, productTitle(product), '', true)}</div>` : ''}
    <div class="hero-copy">
      <span class="drop-label"><span></span> ${manual ? 'Свежий дроп' : 'Из каталога'}</span>
      <${heading} id="${id}" class="hero-title${title ? ' hero-custom-title' : ''}">${title ? h(title) : 'Пары,<br>которые<br class="mobile-break"> ищут<span>.</span>'}</${heading}>
      <p>${h(productTitle(product))}${product.color ? `<span class="hero-color"> / ${h(product.color)}</span>` : ''}</p>
      ${preview ? `<span class="hero-button glass" aria-hidden="true">${button} ${icon('northeast')}</span>` :
        `<button class="hero-button glass" data-action="product" data-id="${h(product.id)}">${button} ${icon('northeast')}</button>`}
    </div>
  </section>`;
}
