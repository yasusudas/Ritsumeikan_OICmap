import './legal-page.js';
import { mountShuttleBusCard } from './shuttle-bus.js';

const MANIFEST_URL = '/timetable/data/manifest.json';
const LIVE_SERVICE_STATUS_URL = '/api/rail-status';
// Japanese holidays, synced on the server from a public ICS calendar (src/server/holidays.js).
const HOLIDAYS_URL = '/api/holidays';
const HOLIDAYS_TIMEOUT_MS = 5_000;
const LIVE_SERVICE_STATUS_REFRESH_INTERVAL = 15 * 60 * 1000;
const LIVE_SERVICE_STATUS_TIMEOUT_MS = 15_000;
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
  resetLayout: document.querySelector('[data-reset-layout]'),
  showAll: document.querySelector('[data-show-all]'),
  shuttleBus: document.querySelector('[data-shuttle-bus-card]'),
  hideDialog: document.querySelector('[data-hide-dialog]'),
  hideDialogText: document.querySelector('[data-hide-dialog-text]'),
};

let manifest = null;
let state = {
  order: [],
  hidden: [],
};
const scheduleCache = new Map();
const activeSchedulesByCardId = new Map();
let japaneseHolidayDates = new Set();
let dragState = null;
let liveServiceStatusState = {
  payload: null,
  isLoading: false,
  error: null,
  nextRefreshAt: 0,
};

// The shuttle bus card needs no data file, so it shows even when the manifest fails to load.
mountShuttleBusCard(elements.shuttleBus, { lang: 'ja' });
// Service status must not wait for the departure data or holiday request.
setupLiveServiceStatus();

init().catch((error) => {
  console.error(error);
  if (elements.hiddenList?.getAttribute('aria-busy') === 'true') {
    elements.hiddenList.setAttribute('aria-busy', 'false');
    elements.hiddenList.innerHTML = '<p class="timetable-empty">表示設定を読み込めませんでした。</p>';
  }
  if (elements.cardGrid) {
    elements.cardGrid.setAttribute('aria-busy', 'false');
    elements.cardGrid.innerHTML = renderBoardMessage(
      '時刻表を読み込めませんでした',
      '通信状態を確認して、もう一度開き直してください。'
    );
  }
});

async function init() {
  [manifest, japaneseHolidayDates] = await Promise.all([fetchJson(MANIFEST_URL), loadJapaneseHolidays()]);
  state = normalizeState(loadState(), manifest.cards);
  setupEvents();
  await render();
  window.setInterval(() => {
    updateCountdownDisplays();
  }, 1_000);
}

function setupEvents() {
  if (elements.resetLayout) elements.resetLayout.disabled = false;
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
  await renderCards();
}

function setupLiveServiceStatus() {
  if (!elements.liveServiceStatus) return;
  liveServiceStatusState.nextRefreshAt = Date.now() + LIVE_SERVICE_STATUS_REFRESH_INTERVAL;
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

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), LIVE_SERVICE_STATUS_TIMEOUT_MS);
  try {
    const payload = await fetchJson(LIVE_SERVICE_STATUS_URL, { signal: controller.signal });
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
  } finally {
    window.clearTimeout(timeoutId);
  }

  renderLiveServiceStatus();
}

function renderLiveServiceStatus() {
  if (!elements.liveServiceStatus) return;

  const { payload, error, isLoading } = liveServiceStatusState;
  const initialLoading = isLoading && !payload;
  elements.liveServiceStatus.setAttribute('aria-busy', String(isLoading));
  elements.liveServiceStatus.toggleAttribute('data-loading', initialLoading);
  const sources = payload?.sources || [];
  const allFailed = sources.length > 0 && sources.every((item) => item.status === 'error');
  let body;

  if (initialLoading) {
    body = '<p class="visually-hidden">運行情報を読み込んでいます…</p>';
  } else if (sources.length && !allFailed) {
    body = `<ul class="rule-list timetable-status-list">${sources.map(renderLiveServiceStatusRow).join('')}</ul>`;
  } else if (error || allFailed) {
    body = renderLiveServiceStatusUnavailable(allFailed ? sources : []);
  } else {
    body = '<p class="timetable-status-message">運行情報はまだありません。</p>';
  }

  const updatedAt = formatLiveStatusUpdatedAt(payload?.generatedAt);

  elements.liveServiceStatus.querySelector('[data-live-status-updated]').innerHTML = updatedAt
    ? `<time datetime="${escapeHtml(payload.generatedAt)}">${escapeHtml(updatedAt)}</time>`
    : '—';
  elements.liveServiceStatus.querySelector('[data-live-status-content]').innerHTML = body;
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
  // One line of text per row. When the line runs normally the official texts only restate it
  // (Hankyu's 「平常運転」, the monorail's 「現在、平常通り運行しております。」), so the summary is enough;
  // otherwise the official texts are the news, and the state already sits in the label beside them.
  const officialTexts = (item.details || []).filter(Boolean).slice(0, 2);
  const text =
    status === 'error'
      ? '取得できませんでした。公式ページでご確認ください。'
      : status === 'normal' || !officialTexts.length
        ? item.summary
        : officialTexts.join(' ');

  return `
    <li class="timetable-status-row is-${escapeHtml(LIVE_STATUS_TONES[status])}">
      <div class="timetable-status-line">
        <span class="timetable-railway-mark" style="--railway-color: ${escapeHtml(item.color || 'var(--c-ink-3)')};" aria-hidden="true"></span>
        <h3 class="timetable-status-line-name">${escapeHtml(item.line)}</h3>
      </div>
      <p class="timetable-status-state">
        <span class="timetable-status-dot" aria-hidden="true"></span>${escapeHtml(item.statusLabel || '確認中')}
      </p>
      <div class="timetable-status-summary">
        <p>${escapeHtml(text)}</p>
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
    elements.cardGrid.setAttribute('aria-busy', 'false');
    elements.cardGrid.innerHTML = renderBoardMessage(
      '表示中のカードがありません',
      '最下部の「非表示カード」から再表示してください。'
    );
    return;
  }

  const schedules = await Promise.all(cards.map((card) => loadScheduleSet(card)));
  activeSchedulesByCardId.clear();
  cards.forEach((card, index) => {
    activeSchedulesByCardId.set(card.id, schedules[index]);
  });
  elements.cardGrid.setAttribute('aria-busy', 'false');
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
  const sheetId = `timetable-card-all-${card.id}`;

  // Laid out like a departure-board widget: the station and the next train on the left with the
  // time left under them, the trains after it on the right. Both the header and the right-hand
  // head are drag handles (data-drag-handle).
  return `
    <article
      class="timetable-card"
      data-card-id="${escapeHtml(card.id)}"
      data-active-schedule-id="${escapeHtml(schedule.id)}"
      aria-labelledby="${escapeHtml(titleId)}"
    >
      <header class="timetable-card-header" data-drag-handle title="ドラッグで並べ替え">
        <span class="timetable-railway-mark" style="--railway-color: ${escapeHtml(railway?.color || 'var(--c-ink-3)')};" aria-hidden="true"></span>
        <p class="timetable-railway">${escapeHtml(cardLineLabel(railway, schedule.line.nameJa))}</p>
        <h2 id="${escapeHtml(titleId)}" class="timetable-card-title">
          ${escapeHtml(card.station.nameJa)}<span>${escapeHtml(card.direction.labelJa)}</span>
        </h2>
      </header>

      <div class="timetable-card-side">
        <div class="timetable-card-sidehead" data-drag-handle title="ドラッグで並べ替え">
          <p class="timetable-upcoming-label">この後</p>
          <div class="timetable-card-tools">
            <button
              class="timetable-card-hide"
              type="button"
              data-hide-card="${escapeHtml(card.id)}"
              aria-label="${escapeHtml(`${card.station.nameJa} ${card.direction.labelJa}を非表示`)}"
            >非表示</button>
            <span class="timetable-card-grip" aria-hidden="true">${GRIP_ICON}</span>
          </div>
        </div>

        <section class="timetable-upcoming" aria-label="この後の発車">
          <ol class="timetable-upcoming-list" data-upcoming>${renderUpcoming(later)}</ol>
        </section>
      </div>

      <section class="timetable-next" aria-label="次の発車">
        <p class="timetable-next-service">
          <time class="timetable-next-time" data-next-departure-time>${escapeHtml(next.departure.time)}</time>
          <span class="timetable-destination" data-next-destination>${escapeHtml(next.departure.destinationJa)}</span>
        </p>
        <p class="timetable-next-badges">
          <span class="timetable-train-type ${serviceClass(nextService.label)}" data-next-service>${escapeHtml(nextService.label)}</span>
        </p>
        <p class="timetable-train-note" data-next-note${nextService.note ? '' : ' hidden'}>${escapeHtml(nextService.note)}</p>
        <p class="timetable-next-countdown" data-next-countdown role="timer" aria-label="${escapeHtml(formatCountdownLabel(next.secondsUntil))}">${escapeHtml(formatCountdown(next.secondsUntil))}</p>
      </section>

      <button
        class="timetable-all-toggle"
        type="button"
        aria-expanded="false"
        aria-controls="${escapeHtml(sheetId)}"
      >全便を見る<span class="visually-hidden">（${escapeHtml(calendarLabel)} ${schedule.departures.length}本）</span></button>
      <div class="timetable-all-sheet" id="${escapeHtml(sheetId)}" hidden>
        <div class="timetable-hour-list">
          ${renderHourList(schedule.departures)}
        </div>
      </div>
    </article>
  `;
}

function renderUpcoming(later) {
  return later
    .map((entry) => {
      const service = splitServiceType(entry.departure.serviceType);
      return `
        <li class="timetable-upcoming-item">
          <p class="timetable-upcoming-train">
            <time>${escapeHtml(entry.departure.time)}</time>
            <span class="timetable-destination">${escapeHtml(entry.departure.destinationJa)}</span>
          </p>
          <p class="timetable-upcoming-badges">
            <span class="timetable-train-type ${serviceClass(service.label)}">${escapeHtml(service.label)}</span>
          </p>
          ${service.note ? `<p class="timetable-train-note">${escapeHtml(service.note)}</p>` : ''}
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

    if (countdown) {
      setText(countdown, formatCountdown(next.secondsUntil));
      countdown.classList.toggle('is-long', next.secondsUntil >= 3600);
      const spoken = formatCountdownLabel(next.secondsUntil);
      if (countdown.getAttribute('aria-label') !== spoken) countdown.setAttribute('aria-label', spoken);
    }
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

  button.addEventListener('click', async () => {
    const cardId = button.dataset.hideCard;
    if (!cardId) return;
    const card = manifest?.cards.find((item) => item.id === cardId);
    const label = card ? `${card.station.nameJa} ${card.direction.labelJa}` : 'このカード';
    const confirmed = await askToHideCard(label);
    if (!confirmed) return;

    state.hidden = [...new Set([...state.hidden, cardId])];
    saveState();
    await render();
    elements.hiddenList?.querySelector(`[data-restore-card="${CSS.escape(cardId)}"]`)?.focus();
  });
}

function askToHideCard(label) {
  const dialog = elements.hideDialog;
  if (!dialog || dialog.open) return Promise.resolve(false);
  if (elements.hideDialogText) elements.hideDialogText.textContent = label;

  dialog.showModal();
  return new Promise((resolve) => {
    const onBackdrop = (event) => {
      if (event.target === dialog) dialog.close('cancel');
    };
    const onClose = () => {
      dialog.removeEventListener('click', onBackdrop);
      resolve(dialog.returnValue === 'hide');
    };
    dialog.addEventListener('click', onBackdrop);
    dialog.addEventListener('close', onClose, { once: true });
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

  // Touch drags only start on the header areas, so the rest of the card still scrolls the page.
  cardElement.querySelectorAll('[data-drag-handle]').forEach((handle) => {
    handle.addEventListener(
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
  });
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
  return Boolean(target.closest('button, a, input, select, textarea, summary, details, .timetable-all-sheet'));
}

function hasAnimatingDetails(cardElement) {
  return Boolean(cardElement.querySelector('.timetable-all-sheet.is-animating'));
}

// The 全便を見る button sits in the left column, and the sheet it opens spans the card under
// both columns, so they are a button and a separate panel rather than one <details>.
function setupTimetableDetails(cardElement) {
  const toggle = cardElement.querySelector('.timetable-all-toggle');
  const sheet = cardElement.querySelector('.timetable-all-sheet');
  const content = sheet?.querySelector('.timetable-hour-list');
  if (!toggle || !sheet || !content) return;

  toggle.addEventListener('click', () => {
    animateTimetableDetails(toggle, sheet, content, sheet.hidden);
  });
}

function animateTimetableDetails(toggle, sheet, content, shouldOpen) {
  if (sheet.dataset.animating === 'true') return;
  toggle.setAttribute('aria-expanded', String(shouldOpen));

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    sheet.hidden = !shouldOpen;
    return;
  }

  sheet.dataset.animating = 'true';
  sheet.classList.add('is-animating');

  if (shouldOpen) {
    sheet.hidden = false;
    const targetHeight = getTimetableDetailsHeight(content);
    content.style.height = '0px';
    content.style.opacity = '0';
    content.style.overflow = 'hidden';
    content.offsetHeight;
    window.requestAnimationFrame(() => {
      content.style.height = `${targetHeight}px`;
      content.style.opacity = '1';
    });
    finishDetailsAnimation(sheet, content, true);
    return;
  }

  content.style.height = `${content.getBoundingClientRect().height}px`;
  content.style.opacity = '1';
  content.style.overflow = 'hidden';
  content.offsetHeight;
  window.requestAnimationFrame(() => {
    content.style.height = '0px';
    content.style.opacity = '0';
  });
  finishDetailsAnimation(sheet, content, false);
}

function finishDetailsAnimation(sheet, content, isOpen) {
  let finished = false;
  const cleanup = () => {
    if (finished) return;
    finished = true;
    sheet.hidden = !isOpen;
    sheet.classList.remove('is-animating');
    delete sheet.dataset.animating;
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
  elements.hiddenList.setAttribute('aria-busy', 'false');
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

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { cache: 'no-cache', ...options });
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
  return japaneseHolidayDates.has(localDateKey(date));
}

// Without the holiday list only weekends count as holidays, so the board still shows.
// The browser may reuse the response for a few hours (see api/holidays.js).
async function loadJapaneseHolidays() {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), HOLIDAYS_TIMEOUT_MS);
  try {
    const response = await fetch(HOLIDAYS_URL, { signal: controller.signal });
    if (!response.ok) throw new Error(`Failed to load ${HOLIDAYS_URL}: ${response.status}`);
    const payload = await response.json();
    return new Set((payload.holidays || []).map((holiday) => holiday.date));
  } catch (error) {
    console.warn('Japanese holidays unavailable; only weekends use the holiday timetable.', error);
    return new Set();
  } finally {
    window.clearTimeout(timeoutId);
  }
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

// "8:05" / "1:12:05": the time left is the large figure on the card. It has no "あと" in front, so
// the timer's aria-label carries the spoken form below.
function formatCountdown(seconds) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const pad = (value) => String(value).padStart(2, '0');
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(totalSeconds % 60)}`
    : `${minutes}:${pad(totalSeconds % 60)}`;
}

// "あと8分05秒" / "あと1時間12分": the spoken form of the countdown.
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

// "大阪モノレール本線" and "JR京都線" already name their operator; "京都線" alone does not.
function cardLineLabel(railway, lineName) {
  const operator = railway?.shortNameJa;
  return operator && !lineName.includes(operator) ? `${operator} ${lineName}` : lineName;
}

function serviceClass(serviceType) {
  if (/快速/.test(serviceType)) return 'is-rapid';
  if (/特急/.test(serviceType)) return 'is-limited';
  if (/急行/.test(serviceType)) return 'is-fast';
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
