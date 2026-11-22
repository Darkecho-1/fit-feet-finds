import { interruptPhoto, selectPhoto } from './gallery.mjs';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const point = event => ({ x: event.clientX, y: event.clientY });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function photoSwipeDirection(displacement, velocity, width) {
  const projected = displacement + clamp(velocity, -1.6, 1.6) * 75;
  return Math.abs(projected) >= Math.min(66, width * .2) ? -Math.sign(projected) : 0;
}

export function attachPhotoZoom(viewer, swipe, reducedMotion) {
  const gallery = viewer.querySelector('[data-photo-gallery]');
  const track = gallery.querySelector('.photo-track');
  const controls = viewer.querySelector('.photo-zoom-controls');
  const minus = controls.querySelector('[data-zoom="out"]');
  const plus = controls.querySelector('[data-zoom="in"]');
  const percent = controls.querySelector('[data-zoom="reset"]');
  const pointers = new Map();
  let scale = 1;
  let offset = { x: 0, y: 0 };
  let transformed;
  let zoomMotion;
  let drag;
  let pinch;

  function paint(nextScale, nextOffset, animate = false) {
    const photo = track.children[Number(gallery.dataset.current)].querySelector('img');
    const width = track.clientWidth;
    const height = track.clientHeight;
    const imageWidth = photo.naturalWidth || width;
    const imageHeight = photo.naturalHeight || height;
    const fit = Math.min(width / imageWidth, height / imageHeight);
    const maxX = Math.max(0, (imageWidth * fit * nextScale - width) / 2);
    const maxY = Math.max(0, (imageHeight * fit * nextScale - height) / 2);
    const samePhoto = transformed === photo;
    const previous = animate && !reducedMotion.matches && samePhoto ? getComputedStyle(photo).transform : null;
    zoomMotion?.cancel();
    const scaleChanged = scale !== nextScale;
    scale = nextScale;
    offset = { x: clamp(nextOffset.x, -maxX, maxX), y: clamp(nextOffset.y, -maxY, maxY) };
    if (transformed && transformed !== photo) transformed.style.transform = '';
    photo.style.transform = scale === 1 ? '' : `translate(${offset.x}px, ${offset.y}px) scale(${scale})`;
    if (previous && previous !== (photo.style.transform || 'none') && photo.animate) {
      zoomMotion = photo.animate([{ transform: previous }, { transform: photo.style.transform || 'none' }],
        { duration: 210, easing: 'cubic-bezier(.23, 1, .32, 1)' });
    }
    transformed = photo;
    if (scaleChanged) {
      track.classList.toggle('is-zoomed', scale > 1);
      minus.setAttribute('aria-disabled', String(scale === 1));
      plus.setAttribute('aria-disabled', String(scale === 4));
      percent.textContent = `${Math.round(scale * 100)}%`;
    }
  }

  function zoomAt(nextScale, start, end = start, baseScale = scale, baseOffset = offset, animate = false) {
    const target = clamp(nextScale, 1, 4);
    const ratio = target / baseScale;
    const rect = track.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    paint(target, {
      x: end.x - centerX - (start.x - centerX - baseOffset.x) * ratio,
      y: end.y - centerY - (start.y - centerY - baseOffset.y) * ratio,
    }, animate);
  }

  function reset(animate = false) {
    pointers.clear();
    drag = pinch = undefined;
    track.classList.remove('is-swiping');
    paint(1, { x: 0, y: 0 }, animate);
  }

  function resize() {
    selectPhoto(gallery, Number(gallery.dataset.current));
    paint(scale, offset);
  }

  controls.addEventListener('click', event => {
    const action = event.target.closest('[data-zoom]')?.dataset.zoom;
    if (action === 'reset') reset(true);
    if (action === 'in' || action === 'out') {
      const target = clamp(scale + (action === 'in' ? .5 : -.5), 1, 4);
      if (target !== scale) paint(target, offset, true);
    }
  });
  track.addEventListener('dblclick', event => {
    const center = point(event);
    if (scale === 1) zoomAt(2, center, center, scale, offset, true);
    else reset(true);
  });
  track.addEventListener('dragstart', event => event.preventDefault());

  track.addEventListener('pointerdown', event => {
    if (event.button !== 0 || pointers.size >= 2) return;
    track.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, point(event));
    if (pointers.size === 1) {
      interruptPhoto(gallery);
      if (zoomMotion?.playState === 'running') {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(transformed).transform);
        paint(clamp(matrix.a, 1, 4), { x: matrix.e, y: matrix.f });
      }
      drag = { start: point(event), scroll: track.scrollLeft, canSwipe: scale === 1, offset,
        lastX: event.clientX, lastAt: event.timeStamp, velocity: 0 };
    } else {
      track.classList.remove('is-swiping');
      track.scrollLeft = Number(gallery.dataset.current) * track.clientWidth;
      const [a, b] = pointers.values();
      pinch = { distance: Math.max(1, distance(a, b)), center: midpoint(a, b), scale, offset };
      drag = undefined;
    }
  });

  track.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    const current = point(event);
    pointers.set(event.pointerId, current);
    if (pinch) {
      const [a, b] = pointers.values();
      zoomAt(pinch.scale * distance(a, b) / pinch.distance, pinch.center, midpoint(a, b), pinch.scale, pinch.offset);
    } else if (drag) {
      const dx = current.x - drag.start.x;
      const dy = current.y - drag.start.y;
      if (scale > 1) paint(scale, { x: drag.offset.x + dx, y: drag.offset.y + dy });
      else if (drag.canSwipe && track.children.length > 1 &&
          (track.classList.contains('is-swiping') || Math.abs(dx) > Math.max(7, Math.abs(dy)))) {
        track.classList.add('is-swiping');
        track.scrollLeft = drag.scroll - dx;
        const elapsed = event.timeStamp - drag.lastAt;
        if (elapsed > 0) drag.velocity = (current.x - drag.lastX) / elapsed;
        drag.lastX = current.x;
        drag.lastAt = event.timeStamp;
      }
    }
  });

  function finish(event) {
    if (!pointers.delete(event.pointerId)) return;
    if (pinch) {
      pinch = undefined;
      const [remaining] = pointers.values();
      drag = remaining && { start: remaining, offset, canSwipe: false };
    } else if (track.classList.contains('is-swiping')) {
      const dx = event.clientX - drag.start.x;
      const velocity = event.timeStamp - drag.lastAt < 90 ? drag.velocity : 0;
      track.classList.remove('is-swiping');
      swipe(event.type === 'pointerup' ? photoSwipeDirection(dx, velocity, track.clientWidth) : 0);
    }
    if (!pointers.size) drag = undefined;
  }
  track.addEventListener('pointerup', finish);
  track.addEventListener('pointercancel', finish);
  track.addEventListener('lostpointercapture', finish);
  paint(1, offset);
  return { reset, resize };
}
