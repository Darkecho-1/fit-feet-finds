import { h, icon, iconButton, photo, productTitle } from './ui.mjs';

export function galleryMarkup(product, current, fullscreen = false) {
  const { images } = product;
  if (!images.length) return photo('', '', 'detail-image');
  const index = images[current] ? current : 0;
  const title = [productTitle(product), product.color].filter(Boolean).join(' ');
  const multiple = images.length > 1;
  return `<div class="photo-gallery" role="group" aria-label="Фотографии товара" data-photo-gallery data-current="${index}">
    <div class="photo-track">
      ${images.map((src, i) => {
        const image = photo(src, `${title}, фото ${i + 1}`, 'detail-image', i === index);
        return `<div class="photo-slide" aria-hidden="${i !== index}">${fullscreen ? image :
          `<button type="button" class="gallery-photo" data-action="open-photo" data-value="${i}" tabindex="${i === index ? 0 : -1}" aria-label="Открыть фото ${i + 1} на весь экран">
            ${image}<span class="gallery-expand" aria-hidden="true">${icon('expand')}</span>
          </button>`}</div>`;
      }).join('')}
    </div>
    ${multiple ? `
      ${iconButton('chevron-left', 'previous-photo', 'Предыдущее фото', `aria-disabled="${index === 0}"`)}
      ${iconButton('chevron', 'next-photo', 'Следующее фото', `aria-disabled="${index === images.length - 1}"`)}
      ${fullscreen ? '' : `<div class="thumbnails glass" role="group" aria-label="Миниатюры">${images.map((src, i) =>
        `<button type="button" data-action="gallery" data-value="${i}" class="${i === index ? 'is-active' : ''}" aria-label="Фото ${i + 1}" aria-pressed="${i === index}">${photo(src, '', '', true)}</button>`).join('')}</div>`}
    ` : ''}
    ${multiple ? `<span class="photo-count${fullscreen ? '' : ' visually-hidden'}" role="status" aria-label="Фото">${index + 1} / ${images.length}</span>` : ''}
  </div>`;
}

export function selectPhoto(gallery, index) {
  if (!gallery) return;
  const track = gallery.querySelector('.photo-track');
  const target = Math.max(0, Math.min(index, track.children.length - 1));
  track.scrollLeft = target * track.clientWidth;
  return syncPhoto(gallery);
}

export function syncPhoto(gallery) {
  const track = gallery.querySelector('.photo-track');
  if (!track.clientWidth) return Number(gallery.dataset.current);
  const slides = [...track.children];
  const index = Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
  if (index === Number(gallery.dataset.current)) return index;
  gallery.dataset.current = String(index);

  const active = slides[index];
  active.setAttribute('aria-hidden', 'false');
  const activeButton = active.querySelector('button');
  if (activeButton && track.contains(document.activeElement)) activeButton.focus({ preventScroll: true });
  slides.forEach((slide, i) => {
    slide.setAttribute('aria-hidden', String(i !== index));
    const button = slide.querySelector('button');
    if (button) button.tabIndex = i === index ? 0 : -1;
  });
  gallery.querySelector('[data-action="previous-photo"]').setAttribute('aria-disabled', String(index === 0));
  gallery.querySelector('[data-action="next-photo"]').setAttribute('aria-disabled', String(index === slides.length - 1));
  gallery.querySelector('.photo-count').textContent = `${index + 1} / ${slides.length}`;

  const thumbs = gallery.querySelector('.thumbnails');
  if (thumbs) {
    for (const [i, thumb] of [...thumbs.children].entries()) {
      thumb.classList.toggle('is-active', i === index);
      thumb.setAttribute('aria-pressed', String(i === index));
    }
    const thumb = thumbs.children[index];
    const left = thumb.offsetLeft;
    const right = left + thumb.offsetWidth;
    if (left < thumbs.scrollLeft) thumbs.scrollLeft = left - 4;
    if (right > thumbs.scrollLeft + thumbs.clientWidth) thumbs.scrollLeft = right - thumbs.clientWidth + 4;
  }
  return index;
}
