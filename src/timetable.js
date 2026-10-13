import './legal-page.js';

const MANIFEST_URL = '/hidden/timetable/data/manifest.json';
const LIVE_SERVICE_STATUS_URL = '/api/rail-status';
const LIVE_SERVICE_STATUS_REFRESH_INTERVAL = 15 * 60 * 1000;
const STORAGE_KEY = 'rits-oic-map:timetable-layout:v1';

// Status id -> tone used for the small status dot.
const LIVE_STATUS_TONES = {
  normal: 'ok',
  notice: 'warn',
  delay: 'warn',
  suspended: 'danger',
  unknown: 'unknown',
  error: 'unknown',
};

const LIVE_SERVICE_STATUS_FALLBACK_LINKS = [
  { label: '阪急電鉄 運行情報', url: 'https://www.hankyu.co.jp/railinfo/' },
  { label: '大阪モノレール 運行状況', url: 'https://www.osaka-monorail.co.jp/' },
  { label: 'JR西日本 運行情報', url: 'https://trafficinfo.westjr.co.jp/kinki.html' },
];

const GRIP_ICON =
  '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 8h12M4 12h12"/></svg>';

const elements = {
  cardGrid: document.querySelector('[data-card-grid]'),
  hiddenList: document.querySelector('[data-hidden-list]'),
  hiddenCount: document.querySelector('[data-hidden-count]'),
  liveServiceStatus: document.querySelector('[data-live-service-status]'),
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
let liveServiceStatusState = {
  payload: null,
  isLoading: false,
  error: null,
  nextRefreshAt: 0,
};

init().catch((error) => {
  console.error(error);
  if (elements.cardGrid) {
    elements.cardGrid.innerHTML = renderBoardMessage(
      '時刻表を読み込めませんでした',
      '通信状態を確認して、もう一度開き直してください。'
    );
  }
});

async function init() {
  manifest = await fetchJson(MANIFEST_URL);
  state = normalizeState(loadState(), manifest.cards);
  setupEvents();
  await render();
  setupLiveServiceStatus();
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

function setupLiveServiceStatus() {
  if (!elements.liveServiceStatus) return;
  liveServiceStatusState.nextRefreshAt = Date.now() + LIVE_SERVICE_STATUS_REFRESH_INTERVAL;
  renderLiveServiceStatus();
  void refreshLiveServiceStatus();
  window.setInterval(() => {
    void refreshLiveServiceStatus();
  }, LIVE_SERVICE_STATUS_REFRESH_INTERVAL);
}

async function refreshLiveServiceStatus() {
  if (!elements.liveServiceStatus || liveServiceStatusState.isLoading) return;

  liveServiceStatusState.isLoading = true;
  liveServiceStatusState.error = null;
  renderLiveServiceStatus();

  try {
    const payload = await fetchJson(LIVE_SERVICE_STATUS_URL);
    (payload?.sources || [])
      .filter((item) => item.status === 'error')
      .forEach((item) => console.warn(`[rail-status] ${item.id}:`, ...(item.details || [])));
    liveServiceStatusState = {
      payload,
      isLoading: false,
      error: null,
      nextRefreshAt: Date.now() + (payload.refreshIntervalSeconds || 900) * 1000,
    };
  } catch (error) {
    console.warn('[rail-status]', error);
    liveServiceStatusState = {
      ...liveServiceStatusState,
      isLoading: false,
      error: error instanceof Error ? error.message : String(error),
      nextRefreshAt: Date.now() + LIVE_SERVICE_STATUS_REFRESH_INTERVAL,
    };
  }

  renderLiveServiceStatus();
}

function renderLiveServiceStatus() {
  if (!elements.liveServiceStatus) return;

  const { payload, error, isLoading } = liveServiceStatusState;
  const sources = payload?.sources || [];
  const allFailed = sources.length > 0 && sources.every((item) => item.status === 'error');
  let body;

  if (sources.length && !allFailed) {
    body = `<ul class="rule-list timetable-status-list">${sources.map(renderLiveServiceStatusRow).join('')}</ul>`;
  } else if (error || allFailed) {
    body = renderLiveServiceStatusUnavailable(allFailed ? sources : []);
  } else {
    body = `<p class="timetable-status-message">${isLoading ? '運行情報を取得しています…' : '運行情報はまだありません。'}</p>`;
  }

  const updatedAt = formatLiveStatusUpdatedAt(payload?.generatedAt);

  elements.liveServiceStatus.innerHTML = `
    <div class="section-head">
      <p class="section-eyebrow">Service status</p>
      <h2 id="live-status-title" class="section-title">運行情報</h2>
      ${
        updatedAt
          ? `<p class="meta-text timetable-status-updated"><time datetime="${escapeHtml(payload.generatedAt)}">${escapeHtml(updatedAt)}</time></p>`
          : ''
      }
    </div>
    <div class="section-body">${body}</div>
  `;
}

// Shown instead of raw fetch errors. The underlying error is logged to the console.
function renderLiveServiceStatusUnavailable(sources) {
  const links = sources.length
    ? sources.map((item) => ({ label: `${item.railway} 運行情報`, url: item.sourceUrl }))
    : LIVE_SERVICE_STATUS_FALLBACK_LINKS;

  return `
    <div class="timetable-status-message is-unavailable">
      <p>運行情報を取得できませんでした。各社の公式ページでご確認ください。</p>
      <ul class="timetable-inline-links">
        ${links
          .map(
            (link) => `
              <li>
                <a class="timetable-quiet-link external" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a>
              </li>
            `
          )
          .join('')}
      </ul>
    </div>
  `;
}

function renderLiveServiceStatusRow(item) {
  const status = LIVE_STATUS_TONES[item.status] ? item.status : 'unknown';
  const isError = status === 'error';
  const summary = isError ? '取得できませんでした。公式ページでご確認ください。' : item.summary;
  const details = isError
    ? ''
    : (item.details || [])
        .filter((detail) => detail && detail !== item.summary)
        .slice(0, 2)
        .map((detail) => `<p class="timetable-status-detail">${escapeHtml(detail)}</p>`)
        .join('');

  return `
    <li class="timetable-status-row is-${escapeHtml(LIVE_STATUS_TONES[status])}">
      <div class="timetable-status-line">
        <span class="timetable-railway-mark" style="--railway-color: ${escapeHtml(item.color || 'var(--c-ink-3)')};" aria-hidden="true"></span>
        <div>
          <h3 class="timetable-status-line-name">${escapeHtml(item.line)}</h3>
          ${item.railway && item.railway !== item.line ? `<p class="timetable-status-railway">${escapeHtml(item.railway)}</p>` : ''}
        </div>
      </div>
      <p class="timetable-status-state">
        <span class="timetable-status-dot" aria-hidden="true"></span>${escapeHtml(item.statusLabel || '確認中')}
      </p>
      <div class="timetable-status-summary">
        <p>${escapeHtml(summary)}</p>
        ${details}
      </div>
      <div class="timetable-status-links">
        <a class="timetable-quiet-link external" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">公式ページ</a>
      </div>
    </li>
  `;
}

async function renderCards() {
  if (!elements.cardGrid) return;

  const cards = orderedCards().filter((card) => !state.hidden.includes(card.id));

  if (!cards.length) {
    activeSchedulesByCardId.clear();
    elements.cardGrid.innerHTML = renderBoardMessage(
      '表示中のカードがありません',
      '下の「非表示カード」から再表示してください。'
    );
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

function renderBoardMessage(title, text) {
  return `
    <div class="timetable-board-message">
      <p class="timetable-board-message-title">${escapeHtml(title)}</p>
      <p>${escapeHtml(text)}</p>
    </div>
  `;
}

function renderCard(card, scheduleSet) {
  const railway = manifest.railways.find((item) => item.id === card.railwayId);
  const view = resolveTimetableView(scheduleSet);
  const schedule = view.schedule;
  const next = view.next;
  const later = view.later;
  const calendarLabel = schedule.calendar.shortLabelJa || schedule.calendar.labelJa;
  const nextService = splitServiceType(next.departure.serviceType);
  const titleId = `timetable-card-title-${card.id}`;

  return `
    <article
      class="timetable-card"
      data-card-id="${escapeHtml(card.id)}"
      data-active-schedule-id="${escapeHtml(schedule.id)}"
      aria-labelledby="${escapeHtml(titleId)}"
    >
      <header class="timetable-card-header" title="ドラッグで並べ替え">
        <p class="timetable-railway">
          <span class="timetable-railway-mark" style="--railway-color: ${escapeHtml(railway?.color || 'var(--c-ink-3)')};" aria-hidden="true"></span>${escapeHtml(card.railwayNameJa)}<span class="timetable-railway-line">${escapeHtml(schedule.line.nameJa)}</span>
        </p>
        <div class="timetable-card-tools">
          <button
            class="timetable-card-hide"
            type="button"
            data-hide-card="${escapeHtml(card.id)}"
            aria-label="${escapeHtml(`${card.station.nameJa} ${card.direction.labelJa}を非表示`)}"
          >非表示</button>
          <span class="timetable-card-grip" aria-hidden="true">${GRIP_ICON}</span>
        </div>
        <h2 id="${escapeHtml(titleId)}" class="timetable-card-title">
          ${escapeHtml(card.station.nameJa)}<span>${escapeHtml(card.direction.labelJa)}</span>
        </h2>
      </header>

      <section class="timetable-next" aria-label="次の発車">
        <p class="timetable-next-label">次の発車<span>${escapeHtml(calendarLabel)}ダイヤ</span></p>
        <div class="timetable-next-main">
          <time class="timetable-next-time" data-next-departure-time>${escapeHtml(next.departure.time)}</time>
          <div class="timetable-next-train">
            <p class="timetable-next-service">
              <span class="timetable-train-type ${serviceClass(nextService.label)}" data-next-service>${escapeHtml(nextService.label)}</span>
              <span class="timetable-destination" data-next-destination>${escapeHtml(next.departure.destinationJa)}</span>
            </p>
            <p class="timetable-train-note" data-next-note${nextService.note ? '' : ' hidden'}>${escapeHtml(nextService.note)}</p>
          </div>
        </div>
        <p class="timetable-next-countdown" data-next-countdown>${escapeHtml(formatCountdownLabel(next.secondsUntil))}</p>
      </section>

      <section class="timetable-upcoming" aria-label="この後の発車">
        <p class="timetable-upcoming-label">この後</p>
        <ol class="timetable-upcoming-list" data-upcoming>${renderUpcoming(later)}</ol>
      </section>

      <details class="timetable-all">
        <summary>全便を見る<span class="timetable-all-meta">${escapeHtml(calendarLabel)} ${schedule.departures.length}本</span></summary>
        <div class="timetable-hour-list">
          ${renderHourList(schedule.departures)}
        </div>
      </details>
    </article>
  `;
}

function renderUpcoming(later) {
  return later
    .map((entry) => {
      const service = splitServiceType(entry.departure.serviceType);
      return `
        <li class="timetable-upcoming-item">
          <time>${escapeHtml(entry.departure.time)}</time>
          <span class="timetable-upcoming-train">
            <span class="timetable-train-type ${serviceClass(service.label)}">${escapeHtml(service.label)}</span>
            <span class="timetable-destination">${escapeHtml(entry.departure.destinationJa)}</span>
          </span>
          ${service.note ? `<span class="timetable-train-note">${escapeHtml(service.note)}</span>` : ''}
        </li>
      `;
    })
    .join('');
}

function upcomingKey(later) {
  return later.map((entry) => `${entry.departure.time}|${entry.departure.serviceType}|${entry.departure.destinationJa}`).join(',');
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
    const nextService = splitServiceType(next.departure.serviceType);
    const countdown = cardElement.querySelector('[data-next-countdown]');
    const departureTime = cardElement.querySelector('[data-next-departure-time]');
    const service = cardElement.querySelector('[data-next-service]');
    const destination = cardElement.querySelector('[data-next-destination]');
    const note = cardElement.querySelector('[data-next-note]');
    const upcoming = cardElement.querySelector('[data-upcoming]');

    setText(countdown, formatCountdownLabel(next.secondsUntil));
    setText(departureTime, next.departure.time);
    if (service) {
      service.className = `timetable-train-type ${serviceClass(nextService.label)}`;
      setText(service, nextService.label);
    }
    setText(destination, next.departure.destinationJa);
    if (note) {
      setText(note, nextService.note);
      note.hidden = !nextService.note;
    }
    if (upcoming && !dragState?.active) {
      const key = upcomingKey(later);
      if (upcoming.dataset.key !== key) {
        upcoming.innerHTML = renderUpcoming(later);
        upcoming.dataset.key = key;
      }
    }
  });

  if (shouldRerender) void renderCards();
}

function setText(element, value) {
  if (element && element.textContent !== value) {
    element.textContent = value;
  }
}

function bindCardEvents() {
  elements.cardGrid.querySelectorAll('[data-card-id]').forEach((cardElement) => {
    setupCardDrag(cardElement);
    setupTimetableDetails(cardElement);
    setupCardHide(cardElement);
  });
}

function setupCardHide(cardElement) {
  const button = cardElement.querySelector('[data-hide-card]');
  if (!button) return;

  button.addEventListener('click', () => {
    const cardId = button.dataset.hideCard;
    if (!cardId) return;
    state.hidden = [...new Set([...state.hidden, cardId])];
    saveState();
    void render();
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
  dragState.ghost.style.transform = `translate3d(${left}px, ${top}px, 0)`;
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
  ghost.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
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
        duration: 200,
        easing: 'cubic-bezier(0.2, 0, 0, 1)',
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
  if (elements.showAll) elements.showAll.disabled = !hiddenCards.length;
  if (!hiddenCards.length) {
    elements.hiddenList.innerHTML = '<p class="timetable-empty">非表示にしたカードはありません。</p>';
    return;
  }

  elements.hiddenList.innerHTML = `
    <ul class="rule-list timetable-hidden-items">
      ${hiddenCards
        .map((card) => {
          const railway = manifest.railways.find((item) => item.id === card.railwayId);
          return `
            <li class="timetable-hidden-item">
              <div class="timetable-hidden-name">
                <p class="timetable-railway">
                  <span class="timetable-railway-mark" style="--railway-color: ${escapeHtml(railway?.color || 'var(--c-ink-3)')};" aria-hidden="true"></span>${escapeHtml(card.railwayNameJa)}
                </p>
                <p class="timetable-hidden-title">${escapeHtml(card.station.nameJa)}<span>${escapeHtml(card.direction.labelJa)}</span></p>
              </div>
              <button
                class="btn btn-quiet"
                type="button"
                data-restore-card="${escapeHtml(card.id)}"
                aria-label="${escapeHtml(`${card.station.nameJa} ${card.direction.labelJa}を再表示`)}"
              >再表示</button>
            </li>
          `;
        })
        .join('')}
    </ul>
  `;

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
    const label = departure.serviceDayOffset ? `翌${departure.hour}時` : `${departure.hour}時`;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(departure);
  });

  return [...groups.entries()]
    .map(
      ([hour, items]) => `
        <div class="timetable-hour-row">
          <span class="timetable-hour-label">${escapeHtml(hour)}</span>
          <ul class="timetable-minute-list">
            ${items
              .map((item) => {
                const meta = [shortService(item.serviceType), item.destinationJa.replace(/行$/, '')]
                  .filter(Boolean)
                  .join(' ');
                return `
                  <li class="timetable-minute">
                    <time>${escapeHtml(String(item.minute).padStart(2, '0'))}</time>
                    ${meta ? `<span class="timetable-minute-meta">${escapeHtml(meta)}</span>` : ''}
                  </li>
                `;
              })
              .join('')}
          </ul>
        </div>
      `
    )
    .join('');
}

function renderSourceNote() {
  if (!elements.sourceNote) return;
  const noteItems = (manifest.sourceNotes || []).map((note) => `<li>${escapeHtml(note)}</li>`).join('');
  const referenceGroups = (manifest.sourceReferences || [])
    .map(
      (group) => `
        <div class="timetable-reference-group">
          <h3 class="timetable-reference-title">${escapeHtml(group.labelJa)}</h3>
          <ul class="timetable-reference-list">
            ${(group.items || []).map(renderSourceReferenceItem).join('')}
          </ul>
        </div>
      `
    )
    .join('');

  elements.sourceNote.innerHTML = `
    <div class="section-head">
      <p class="section-eyebrow">Sources</p>
      <h2 id="source-note-title" class="section-title">出典・注意事項</h2>
    </div>
    <div class="section-body">
      ${noteItems ? `<ul class="timetable-notes">${noteItems}</ul>` : ''}
      <div class="timetable-source-groups">
        ${referenceGroups}
      </div>
    </div>
  `;
}

function renderSourceReferenceItem(item) {
  return `
    <li>
      <a class="timetable-reference-link external" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.labelJa)}</a>
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

// "あと8分05秒" / "あと1時間12分": the countdown is secondary to the departure time.
function formatCountdownLabel(seconds) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const restSeconds = totalSeconds % 60;
  if (hours > 0) return `あと${hours}時間${String(minutes).padStart(2, '0')}分`;
  if (minutes > 0) return `あと${minutes}分${String(restSeconds).padStart(2, '0')}秒`;
  return restSeconds > 0 ? `あと${restSeconds}秒` : 'まもなく発車';
}

function formatLiveStatusUpdatedAt(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  })} 更新`;
}

// "快速（島本・山崎・向日町・桂川・西大路通過）" -> { label: "快速", note: "島本・山崎・向日町・桂川・西大路通過" }
function splitServiceType(serviceType) {
  const value = String(serviceType ?? '').trim();
  const match = value.match(/^(.+?)\s*[（(](.+)[）)]$/);
  return match ? { label: match[1], note: match[2] } : { label: value, note: '' };
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
