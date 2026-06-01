import './legal-page.js';

const MANIFEST_URL = '/hidden/timetable/data/manifest.json';
const STORAGE_KEY = 'rits-oic-map:timetable-layout:v1';

const elements = {
  cardGrid: document.querySelector('[data-card-grid]'),
  hiddenList: document.querySelector('[data-hidden-list]'),
  hiddenCount: document.querySelector('[data-hidden-count]'),
  sourceNote: document.querySelector('[data-source-note]'),
  resetLayout: document.querySelector('[data-reset-layout]'),
  showAll: document.querySelector('[data-show-all]'),
};

let manifest = null;
let state = {
  order: [],
  hidden: [],
};
const scheduleCache = new Map();
const activeSchedulesByCardId = new Map();
let dragState = null;

init().catch((error) => {
  console.error(error);
  if (elements.cardGrid) {
    elements.cardGrid.innerHTML = `
      <article class="timetable-card timetable-card-error">
        <h2>時刻表を読み込めませんでした</h2>
        <p>通信状態を確認して、もう一度開き直してください。</p>
      </article>
    `;
  }
});

async function init() {
  manifest = await fetchJson(MANIFEST_URL);
  state = normalizeState(loadState(), manifest.cards);
  setupEvents();
  await render();
  window.setInterval(() => {
    updateCountdownDisplays();
  }, 1_000);
}

function setupEvents() {
  elements.resetLayout?.addEventListener('click', () => {
    state.order = manifest.cards.map((card) => card.id);
    saveState();
    void renderCards();
  });

  elements.showAll?.addEventListener('click', () => {
    state.hidden = [];
    saveState();
    void render();
  });
}

async function render() {
  renderHiddenList();
  renderSourceNote();
  await renderCards();
}

async function renderCards() {
  if (!elements.cardGrid) return;

  const cards = orderedCards().filter((card) => !state.hidden.includes(card.id));

  if (!cards.length) {
    elements.cardGrid.innerHTML = `
      <article class="timetable-card timetable-card-empty">
        <h2>表示中のカードがありません</h2>
        <p>非表示カードを再表示してください。</p>
      </article>
    `;
    return;
  }

  const schedules = await Promise.all(cards.map((card) => loadScheduleSet(card)));
  activeSchedulesByCardId.clear();
  cards.forEach((card, index) => {
    activeSchedulesByCardId.set(card.id, schedules[index]);
  });
  elements.cardGrid.innerHTML = cards.map((card, index) => renderCard(card, schedules[index])).join('');
  bindCardEvents();
  updateCountdownDisplays();
}

function renderCard(card, scheduleSet) {
  const railway = manifest.railways.find((item) => item.id === card.railwayId);
  const view = resolveTimetableView(scheduleSet);
  const schedule = view.schedule;
  const next = view.next;
  const later = view.later;
  const calendarLabel = schedule.calendar.shortLabelJa || schedule.calendar.labelJa;

  return `
    <article
      class="timetable-card"
      data-card-id="${escapeHtml(card.id)}"
      data-active-schedule-id="${escapeHtml(schedule.id)}"
      title="ドラッグで並べ替え"
      style="--timetable-railway-color: ${escapeHtml(railway?.color || '#991c27')}; --timetable-railway-text: ${escapeHtml(railway?.textColor || '#fff')};"
    >
      <header class="timetable-card-header">
        <div>
          <p class="timetable-railway">${escapeHtml(card.railwayNameJa)} / ${escapeHtml(schedule.line.nameJa)}</p>
          <h2>${escapeHtml(card.station.nameJa)} <span>${escapeHtml(card.direction.labelJa)}</span></h2>
        </div>
      </header>

      <div class="timetable-card-body">
        <section class="timetable-next" aria-label="次の発車">
          <div class="timetable-next-meta">
            <span>${escapeHtml(calendarLabel)}</span>
          </div>
          <p class="timetable-next-time" data-next-countdown>${escapeHtml(formatCountdownPrecise(next.secondsUntil))}</p>
          <div class="timetable-next-row">
            <span class="timetable-train-type ${serviceClass(next.departure.serviceType)}" data-next-service>${escapeHtml(next.departure.serviceType)}</span>
            <time class="timetable-next-departure" data-next-departure-time>${escapeHtml(next.departure.time)}発</time>
            <span class="timetable-destination">${escapeHtml(next.departure.destinationJa)}</span>
          </div>
        </section>

        <section class="timetable-upcoming" aria-label="この後の発車" data-upcoming>
          ${renderUpcoming(later)}
        </section>
      </div>

      <details class="timetable-all">
        <summary>全便を見る</summary>
        <div class="timetable-hour-list">
          ${renderHourList(schedule.departures)}
        </div>
      </details>
    </article>
  `;
}

function renderUpcoming(later) {
  return later
    .map(
      (entry) => `
        <div class="timetable-upcoming-item">
          <time>${escapeHtml(entry.departure.time)}</time>
          <div>
            <span class="timetable-train-type ${serviceClass(entry.departure.serviceType)}">${escapeHtml(entry.departure.serviceType)}</span>
            <span>${escapeHtml(entry.departure.destinationJa)}</span>
          </div>
        </div>
      `
    )
    .join('');
}

function updateCountdownDisplays() {
  if (!elements.cardGrid) return;

  let shouldRerender = false;
  elements.cardGrid.querySelectorAll('.timetable-card[data-card-id]').forEach((cardElement) => {
    const cardId = cardElement.dataset.cardId;
    const scheduleSet = activeSchedulesByCardId.get(cardId);
    if (!scheduleSet) return;

    const view = resolveTimetableView(scheduleSet);
    const scheduleChanged = cardElement.dataset.activeScheduleId !== view.schedule.id;
    if (scheduleChanged && !dragState?.active) {
      shouldRerender = true;
      return;
    }

    const { next, later } = view;
    const countdown = cardElement.querySelector('[data-next-countdown]');
    const departureTime = cardElement.querySelector('[data-next-departure-time]');
    const service = cardElement.querySelector('[data-next-service]');
    const destination = cardElement.querySelector('.timetable-destination');
    const upcoming = cardElement.querySelector('[data-upcoming]');

    if (countdown) countdown.textContent = formatCountdownPrecise(next.secondsUntil);
    if (departureTime) departureTime.textContent = `${next.departure.time}発`;
    if (service) {
      service.className = `timetable-train-type ${serviceClass(next.departure.serviceType)}`;
      service.textContent = next.departure.serviceType;
    }
    if (destination) destination.textContent = next.departure.destinationJa;
    if (upcoming && !dragState?.active) upcoming.innerHTML = renderUpcoming(later);
  });

  if (shouldRerender) void renderCards();
}

function bindCardEvents() {
  elements.cardGrid.querySelectorAll('[data-card-id]').forEach((cardElement) => {
    setupCardDrag(cardElement);
    setupTimetableDetails(cardElement);
  });
}

function setupCardDrag(cardElement) {
  cardElement.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || isInteractiveDragTarget(event.target)) return;
    if (event.pointerType === 'touch') return;
    if (hasAnimatingDetails(cardElement)) return;

    const dragSurface = event.target.closest('.timetable-card');
    if (!dragSurface || !cardElement.contains(dragSurface)) return;

    dragState = {
      input: 'pointer',
      cardElement,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      active: false,
    };

    cardElement.setPointerCapture?.(event.pointerId);
    window.addEventListener('pointermove', onTimetablePointerMove, { passive: false });
    window.addEventListener('pointerup', onTimetablePointerEnd);
    window.addEventListener('pointercancel', onTimetablePointerEnd);
  });

  cardElement.querySelector('.timetable-card-header')?.addEventListener(
    'touchstart',
    (event) => {
      if (dragState || event.touches.length !== 1 || isInteractiveDragTarget(event.target)) return;
      if (hasAnimatingDetails(cardElement)) return;
      const touch = event.changedTouches[0];
      dragState = {
        input: 'touch',
        cardElement,
        touchId: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        currentX: touch.clientX,
        currentY: touch.clientY,
        active: false,
      };
      window.addEventListener('touchmove', onTimetableTouchMove, { passive: false });
      window.addEventListener('touchend', onTimetableTouchEnd);
      window.addEventListener('touchcancel', onTimetableTouchEnd);
    },
    { passive: true }
  );
}

function onTimetablePointerMove(event) {
  if (!dragState || dragState.input !== 'pointer' || event.pointerId !== dragState.pointerId) return;

  const deltaX = event.clientX - dragState.startX;
  const deltaY = event.clientY - dragState.startY;
  if (!dragState.active && Math.hypot(deltaX, deltaY) < 8) return;

  event.preventDefault();
  activateTimetableDrag();
  updateDragVisual(event.clientX, event.clientY);

  scheduleReorderAtPoint(event.clientX, event.clientY);
}

function onTimetablePointerEnd(event) {
  if (!dragState || dragState.input !== 'pointer' || event.pointerId !== dragState.pointerId) return;

  if (dragState.active) {
    flushPendingReorder();
    commitDraggedOrder();
  }

  dragState.cardElement.releasePointerCapture?.(dragState.pointerId);
  cleanupTimetableDrag();
}

function onTimetableTouchMove(event) {
  if (!dragState || dragState.input !== 'touch') return;

  const touch = findTrackedTouch(event.changedTouches);
  if (!touch) return;

  const deltaX = touch.clientX - dragState.startX;
  const deltaY = touch.clientY - dragState.startY;
  if (!dragState.active) {
    if (Math.hypot(deltaX, deltaY) < 16) return;
  }

  event.preventDefault();
  activateTimetableDrag();
  updateDragVisual(touch.clientX, touch.clientY);
  scheduleReorderAtPoint(touch.clientX, touch.clientY);
}

function onTimetableTouchEnd(event) {
  if (!dragState || dragState.input !== 'touch' || !findTrackedTouch(event.changedTouches)) return;

  if (dragState.active) {
    flushPendingReorder();
    commitDraggedOrder();
  }

  cleanupTimetableDrag();
}

function activateTimetableDrag() {
  if (!dragState || dragState.active) return;
  dragState.active = true;
  prepareDragGhost();
  dragState.cardElement.classList.add('is-dragging');
  elements.cardGrid?.classList.add('is-sorting');
  document.body.classList.add('is-timetable-sorting');
}

function cleanupTimetableDrag() {
  if (!dragState) return;
  if (dragState.reorderFrame) {
    window.cancelAnimationFrame(dragState.reorderFrame);
  }
  finishDragGhost();
  clearPushedCards();
  elements.cardGrid?.classList.remove('is-sorting');
  document.body.classList.remove('is-timetable-sorting');
  window.removeEventListener('pointermove', onTimetablePointerMove);
  window.removeEventListener('pointerup', onTimetablePointerEnd);
  window.removeEventListener('pointercancel', onTimetablePointerEnd);
  window.removeEventListener('touchmove', onTimetableTouchMove);
  window.removeEventListener('touchend', onTimetableTouchEnd);
  window.removeEventListener('touchcancel', onTimetableTouchEnd);
  dragState = null;
}

function findTrackedTouch(touches) {
  return [...touches].find((touch) => touch.identifier === dragState?.touchId);
}

function scheduleReorderAtPoint(x, y) {
  if (!dragState) return;

  dragState.pendingReorder = { x, y };
  if (dragState.reorderFrame) return;

  dragState.reorderFrame = window.requestAnimationFrame(() => {
    if (!dragState?.pendingReorder) return;
    const point = dragState.pendingReorder;
    dragState.pendingReorder = null;
    dragState.reorderFrame = 0;
    reorderCardAtPoint(point.x, point.y);
  });
}

function flushPendingReorder() {
  if (!dragState?.pendingReorder) return;

  if (dragState.reorderFrame) {
    window.cancelAnimationFrame(dragState.reorderFrame);
    dragState.reorderFrame = 0;
  }
  const point = dragState.pendingReorder;
  dragState.pendingReorder = null;
  reorderCardAtPoint(point.x, point.y);
}

function prepareDragGhost() {
  if (!dragState || dragState.ghost) return;

  const rect = dragState.cardElement.getBoundingClientRect();
  const ghost = dragState.cardElement.cloneNode(true);
  ghost.classList.add('timetable-card-drag-ghost');
  ghost.removeAttribute('data-card-id');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  dragState.offsetX = dragState.startX - rect.left;
  dragState.offsetY = dragState.startY - rect.top;
  dragState.ghost = ghost;
  document.body.appendChild(ghost);
  updateDragVisual(dragState.currentX, dragState.currentY);
}

function updateDragVisual(x, y) {
  if (!dragState) return;

  dragState.currentX = x;
  dragState.currentY = y;
  if (!dragState.ghost) return;

  const left = x - (dragState.offsetX || 0);
  const top = y - (dragState.offsetY || 0);
  dragState.ghost.style.transform = `translate3d(${left}px, ${top}px, 0) scale(1.03)`;
}

function finishDragGhost() {
  if (!dragState) return;

  const cardElement = dragState.cardElement;
  const ghost = dragState.ghost;
  if (!ghost || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    ghost?.remove();
    cardElement.classList.remove('is-dragging');
    return;
  }

  const rect = cardElement.getBoundingClientRect();
  ghost.classList.add('is-settling');
  ghost.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0) scale(1)`;
  ghost.style.opacity = '0';
  window.setTimeout(() => {
    ghost.remove();
    cardElement.classList.remove('is-dragging');
  }, 190);
}

function reorderCardAtPoint(x, y) {
  if (!dragState || !elements.cardGrid) return;

  const reference = insertionReferenceFromPoint(x, y);
  if (reference === dragState.cardElement) return;
  if (!reference && dragState.cardElement === elements.cardGrid.lastElementChild) return;
  if (reference && dragState.cardElement.nextElementSibling === reference) return;

  const previousRects = captureCardRects();
  elements.cardGrid.insertBefore(dragState.cardElement, reference);
  animateCardPush(previousRects);
}

function insertionReferenceFromPoint(x, y) {
  if (!dragState || !elements.cardGrid) return null;

  const items = reorderCandidates();
  if (!items.length) return null;

  const currentSlot = currentInsertionSlot(items);
  const targetSlot = stableInsertionSlotFromPoint(x, y, items, currentSlot);
  if (targetSlot === currentSlot) return dragState.cardElement.nextElementSibling;

  return items[targetSlot]?.cardElement || null;
}

function reorderCandidates() {
  if (!dragState || !elements.cardGrid) return [];

  const items = [...elements.cardGrid.querySelectorAll('.timetable-card[data-card-id]')]
    .filter((cardElement) => cardElement !== dragState.cardElement)
    .map((cardElement) => {
      const rect = cardElement.getBoundingClientRect();
      return {
        cardElement,
        rect,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
      };
    });

  return items.map((item) => ({
    ...item,
    hasRowPeer: items.some((other) => other !== item && verticalOverlap(item.rect, other.rect) > 24),
  }));
}

function currentInsertionSlot(items) {
  if (!dragState) return 0;
  const nextElement = dragState.cardElement.nextElementSibling;
  if (!nextElement) return items.length;
  const index = items.findIndex((item) => item.cardElement === nextElement);
  return index >= 0 ? index : items.length;
}

function stableInsertionSlotFromPoint(x, y, items, currentSlot) {
  let targetSlot = items.length;
  for (let index = 0; index < items.length; index += 1) {
    if (isPointBeforeReorderItem(x, y, items[index])) {
      targetSlot = index;
      break;
    }
  }

  if (targetSlot === currentSlot) return currentSlot;

  const hysteresis = 18;
  if (targetSlot > currentSlot) {
    const previousItem = items[targetSlot - 1];
    if (previousItem && !hasCrossedReorderItem(x, y, previousItem, 1, hysteresis)) {
      return currentSlot;
    }
  } else {
    const nextItem = items[targetSlot];
    if (nextItem && !hasCrossedReorderItem(x, y, nextItem, -1, hysteresis)) {
      return currentSlot;
    }
  }

  return targetSlot;
}

function isPointBeforeReorderItem(x, y, item) {
  const inRow = y >= item.rect.top && y <= item.rect.bottom;
  if (item.hasRowPeer && inRow) return x < item.centerX;
  return y < item.centerY;
}

function hasCrossedReorderItem(x, y, item, direction, hysteresis) {
  const sameRow = item.hasRowPeer && y >= item.rect.top && y <= item.rect.bottom;
  if (direction > 0) {
    return sameRow ? x > item.centerX + hysteresis : y > item.centerY + hysteresis;
  }
  return sameRow ? x < item.centerX - hysteresis : y < item.centerY - hysteresis;
}

function verticalOverlap(a, b) {
  return Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
}

function captureCardRects() {
  if (!elements.cardGrid) return new Map();
  return new Map(
    [...elements.cardGrid.querySelectorAll('.timetable-card[data-card-id]')].map((cardElement) => [
      cardElement,
      cardElement.getBoundingClientRect(),
    ])
  );
}

function animateCardPush(previousRects) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  previousRects.forEach((previousRect, cardElement) => {
    if (cardElement === dragState?.cardElement || !elements.cardGrid?.contains(cardElement)) return;

    const nextRect = cardElement.getBoundingClientRect();
    const deltaX = previousRect.left - nextRect.left;
    const deltaY = previousRect.top - nextRect.top;
    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;

    cardElement.getAnimations().forEach((animation) => animation.cancel());
    cardElement.classList.add('is-pushed');
    const animation = cardElement.animate(
      [
        { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
        { transform: 'translate3d(0, 0, 0)' },
      ],
      {
        duration: 360,
        easing: 'cubic-bezier(0.18, 0.89, 0.32, 1.14)',
      }
    );
    animation.addEventListener('finish', () => {
      cardElement.classList.remove('is-pushed');
    });
    animation.addEventListener('cancel', () => {
      cardElement.classList.remove('is-pushed');
    });
  });
}

function clearPushedCards() {
  document.querySelectorAll('.timetable-card.is-pushed').forEach((cardElement) => {
    cardElement.getAnimations().forEach((animation) => animation.cancel());
    cardElement.classList.remove('is-pushed');
  });
}

function commitDraggedOrder() {
  const visibleOrder = orderedCardIdsFromDom();
  if (!visibleOrder.length) return;

  const visibleIds = new Set(visibleOrder);
  const visibleQueue = [...visibleOrder];
  state.order = ensureOrder().map((id) => (visibleIds.has(id) ? visibleQueue.shift() : id));
  saveState();
}

function orderedCardIdsFromDom() {
  if (!elements.cardGrid) return [];
  return [...elements.cardGrid.querySelectorAll('.timetable-card[data-card-id]')]
    .map((cardElement) => cardElement.dataset.cardId)
    .filter(Boolean);
}

function isInteractiveDragTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('button, a, input, select, textarea, summary, details'));
}

function hasAnimatingDetails(cardElement) {
  return Boolean(cardElement.querySelector('.timetable-all.is-animating'));
}

function setupTimetableDetails(cardElement) {
  cardElement.querySelectorAll('.timetable-all').forEach((details) => {
    const summary = details.querySelector('summary');
    const content = details.querySelector('.timetable-hour-list');
    if (!summary || !content) return;

    summary.addEventListener('click', (event) => {
      event.preventDefault();
      animateTimetableDetails(details, content, !details.open);
    });
  });
}

function animateTimetableDetails(details, content, shouldOpen) {
  if (details.dataset.animating === 'true') return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    details.open = shouldOpen;
    return;
  }

  const targetHeight = getTimetableDetailsHeight(content);
  details.dataset.animating = 'true';
  details.classList.add('is-animating');

  if (shouldOpen) {
    details.open = true;
    content.style.height = '0px';
    content.style.opacity = '0';
    content.style.overflow = 'hidden';
    content.offsetHeight;
    details.classList.add('is-open');
    window.requestAnimationFrame(() => {
      content.style.height = `${targetHeight}px`;
      content.style.opacity = '1';
    });
    finishDetailsAnimation(details, content, true);
    return;
  }

  content.style.height = `${content.getBoundingClientRect().height}px`;
  content.style.opacity = '1';
  content.style.overflow = 'hidden';
  content.offsetHeight;
  details.classList.remove('is-open');
  window.requestAnimationFrame(() => {
    content.style.height = '0px';
    content.style.opacity = '0';
  });
  finishDetailsAnimation(details, content, false);
}

function finishDetailsAnimation(details, content, isOpen) {
  let finished = false;
  const cleanup = () => {
    if (finished) return;
    finished = true;
    details.open = isOpen;
    details.classList.remove('is-animating');
    delete details.dataset.animating;
    content.style.height = '';
    content.style.opacity = '';
    content.style.overflow = '';
    content.removeEventListener('transitionend', onTransitionEnd);
  };
  const onTransitionEnd = (event) => {
    if (event.target === content && event.propertyName === 'height') cleanup();
  };
  content.addEventListener('transitionend', onTransitionEnd);
  window.setTimeout(cleanup, 420);
}

function getTimetableDetailsHeight(content) {
  const maxHeight = Number.parseFloat(window.getComputedStyle(content).maxHeight);
  if (Number.isFinite(maxHeight)) {
    return Math.min(content.scrollHeight, maxHeight);
  }
  return content.scrollHeight;
}

function renderHiddenList() {
  if (!elements.hiddenList || !elements.hiddenCount) return;
  const hiddenCards = orderedCards().filter((card) => state.hidden.includes(card.id));
  elements.hiddenCount.textContent = `${hiddenCards.length}件`;
  if (!hiddenCards.length) {
    elements.hiddenList.innerHTML = '<p class="timetable-empty">非表示にしたカードはありません。</p>';
    return;
  }

  elements.hiddenList.innerHTML = hiddenCards
    .map(
      (card) => `
        <button class="timetable-hidden-item" type="button" data-restore-card="${escapeHtml(card.id)}">
          <span>${escapeHtml(card.railwayNameJa)}</span>
          <strong>${escapeHtml(card.station.nameJa)} / ${escapeHtml(card.direction.labelJa)}</strong>
        </button>
      `
    )
    .join('');

  elements.hiddenList.querySelectorAll('[data-restore-card]').forEach((button) => {
    button.addEventListener('click', () => {
      state.hidden = state.hidden.filter((id) => id !== button.dataset.restoreCard);
      saveState();
      void render();
    });
  });
}

function renderHourList(departures) {
  const groups = new Map();
  departures.forEach((departure) => {
    const label = departure.serviceDayOffset ? `翌 ${departure.hour}時` : `${departure.hour}時`;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(departure);
  });

  return [...groups.entries()]
    .map(
      ([hour, items]) => `
        <div class="timetable-hour-row">
          <span class="timetable-hour-label">${escapeHtml(hour)}</span>
          <div class="timetable-minute-list">
            ${items
              .map(
                (item) => `
                  <span class="timetable-minute-pill">
                    <time>${escapeHtml(String(item.minute).padStart(2, '0'))}</time>
                    <span>${escapeHtml(shortService(item.serviceType))}</span>
                    <span>${escapeHtml(item.destinationJa.replace(/行$/, ''))}</span>
                  </span>
                `
              )
              .join('')}
          </div>
        </div>
      `
    )
    .join('');
}

function renderSourceNote() {
  if (!elements.sourceNote) return;
  const noteItems = (manifest.sourceNotes || []).map((note) => `<p>${escapeHtml(note)}</p>`).join('');
  const referenceGroups = (manifest.sourceReferences || [])
    .map(
      (group) => `
        <div class="timetable-source-reference-group">
          <p class="timetable-source-reference-title">${escapeHtml(group.labelJa)}</p>
          <ul class="timetable-source-reference-items">
            ${(group.items || []).map(renderSourceReferenceItem).join('')}
          </ul>
        </div>
      `
    )
    .join('');

  elements.sourceNote.innerHTML = `
    <div class="timetable-source-note-text">
      ${noteItems}
    </div>
    <div class="timetable-source-references">
      ${referenceGroups}
    </div>
  `;
}

function renderSourceReferenceItem(item) {
  return `
    <li>
      <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
        ${escapeHtml(item.labelJa)}
      </a>
    </li>
  `;
}

function orderedCards() {
  const order = ensureOrder();
  const byId = new Map(manifest.cards.map((card) => [card.id, card]));
  return order.map((id) => byId.get(id)).filter(Boolean);
}

function ensureOrder() {
  const cardIds = manifest.cards.map((card) => card.id);
  const known = state.order.filter((id) => cardIds.includes(id));
  const missing = cardIds.filter((id) => !known.includes(id));
  state.order = [...known, ...missing];
  return [...state.order];
}

async function loadScheduleSet(card) {
  const calendarEntries = await Promise.all(
    Object.keys(card.calendars).map(async (calendarId) => [calendarId, await loadSchedule(card, calendarId)])
  );
  return Object.fromEntries(calendarEntries);
}

async function loadSchedule(card, calendarId) {
  const calendar = card.calendars[calendarId] ? calendarId : card.defaultCalendar;
  const url = card.calendars[calendar].url;
  if (!scheduleCache.has(url)) {
    scheduleCache.set(url, fetchJson(url));
  }
  return scheduleCache.get(url);
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return response.json();
}

function resolveTimetableView(scheduleSet, now = new Date()) {
  const context = currentServiceContext(now);
  const candidates = [];

  for (let dayOffset = 0; dayOffset < 3; dayOffset += 1) {
    const serviceDate = addDays(context.serviceDate, dayOffset);
    const calendarId = timetableCalendarForDate(serviceDate);
    const schedule = scheduleSet[calendarId] || scheduleSet.weekday || Object.values(scheduleSet)[0];
    if (!schedule?.departures?.length) continue;

    schedule.departures.forEach((departure) => {
      const absoluteSeconds = dayOffset * 24 * 60 * 60 + serviceSeconds(departure);
      if (absoluteSeconds >= context.currentSeconds) {
        candidates.push({
          departure,
          schedule,
          secondsUntil: absoluteSeconds - context.currentSeconds,
        });
      }
    });

    if (candidates.length >= 4) break;
  }

  candidates.sort((left, right) => left.secondsUntil - right.secondsUntil);

  const upcoming = candidates.slice(0, 4);
  if (!upcoming.length) {
    const fallbackSchedule = scheduleSet.weekday || scheduleSet.holiday || Object.values(scheduleSet)[0];
    const fallbackDeparture = fallbackSchedule.departures[0];
    return {
      schedule: fallbackSchedule,
      next: {
        departure: fallbackDeparture,
        secondsUntil: 0,
      },
      later: fallbackSchedule.departures.slice(1, 4).map((departure) => ({ departure })),
    };
  }

  return {
    schedule: upcoming[0].schedule,
    next: upcoming[0],
    later: upcoming.slice(1),
  };
}

function currentServiceContext(now) {
  const serviceDate = startOfLocalDate(now);
  const afterMidnightService = now.getHours() < 4;
  if (afterMidnightService) serviceDate.setDate(serviceDate.getDate() - 1);

  return {
    serviceDate,
    currentSeconds:
      (afterMidnightService ? 24 * 60 * 60 : 0) +
      now.getHours() * 60 * 60 +
      now.getMinutes() * 60 +
      now.getSeconds(),
  };
}

function timetableCalendarForDate(date) {
  const day = date.getDay();
  return day === 0 || day === 6 || isJapanesePublicHoliday(date) ? 'holiday' : 'weekday';
}

function isJapanesePublicHoliday(date) {
  return japaneseHolidayDateSet().has(localDateKey(date));
}

function japaneseHolidayDateSet() {
  if (!manifest._japaneseHolidayDateSet) {
    manifest._japaneseHolidayDateSet = new Set(
      (manifest.holidayCalendar?.holidays || []).map((holiday) => holiday.date)
    );
  }
  return manifest._japaneseHolidayDateSet;
}

function startOfLocalDate(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const result = startOfLocalDate(date);
  result.setDate(result.getDate() + days);
  return result;
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function serviceSeconds(departure) {
  return (
    (departure.serviceDayOffset || 0) * 24 * 60 * 60 +
    departure.hour * 60 * 60 +
    departure.minute * 60 +
    (departure.second || 0)
  );
}

function formatCountdownPrecise(seconds) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const restSeconds = totalSeconds % 60;
  return `${minutes}:${String(restSeconds).padStart(2, '0')}`;
}

function serviceClass(serviceType) {
  if (/特急|新快速/.test(serviceType)) return 'is-limited';
  if (/快速|急行/.test(serviceType)) return 'is-fast';
  if (/準急/.test(serviceType)) return 'is-semi';
  return 'is-local';
}

function shortService(serviceType) {
  return String(serviceType)
    .replace('A快速（うれしート連結）', 'A快')
    .replace('快速（島本・山崎・向日町・桂川・西大路通過）', '快')
    .replace('普通', '');
}

function loadState() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}

function saveState() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The page still works without persistence.
  }
}

function normalizeState(saved, cards) {
  const cardIds = cards.map((card) => card.id);
  return {
    order: Array.isArray(saved.order) ? saved.order.filter((id) => cardIds.includes(id)) : cardIds,
    hidden: Array.isArray(saved.hidden) ? saved.hidden.filter((id) => cardIds.includes(id)) : [],
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
