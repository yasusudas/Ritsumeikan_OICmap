import { getLang, t } from './i18n.js';
import {
  hasFoodUsage,
  renderFoodLinkButtons,
  renderFoodLeadStatus,
  renderFoodLinkRows,
  renderFoodStateLabel,
  renderFoodStatus,
  renderFoodTruckPhotos,
  renderFoodUsage,
} from './food-place-cards.js';
import { FACILITY_PLACES, FACILITY_TEXT, facilityAnchor } from './facility-places.js';
import {
  validateFoodPlaces,
  placeFoodMarkers,
  describeFoodServiceHours,
  judgeFoodServiceStatus,
  japaneseDate,
  FOOD_STATUS_MS,
  CoopHoursClient,
  FOOD_GESTURE_DISTANCE,
} from './food-guide-model.js';

const NS = 'http://www.w3.org/2000/svg';
const FOOD_TRUCKS_URL = '/api/food-trucks';
// Today's cars are fetched again after this long, or when the day changes.
const FOOD_TRUCKS_FRESH_MS = 10 * 60 * 1000;
const FOOD_TRUCKS_RETRY_MS = 60 * 1000;
// Handle drag settles into the next height, or slides off the bottom.
const SHEET_GLIDE_MS = 460;
const SHEET_GLIDE_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
const SHEET_DISMISS_EASE = 'cubic-bezier(0.4, 0, 1, 1)';
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ],
  );
const local = (value) => value?.[getLang()] ?? value?.ja ?? '';
const setAttribute = (node, name, value) => {
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
};
const foodIcon =
  '<svg class="search-icon-image" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 2v7m3-7v7M2 2v7c0 2 6 2 6 0M5 11v11M17 2c-4 3-4 9 0 10h3V2h-3Zm3 10v10"/></svg>';

// A 40-unit round head and a 6-unit tail (0.15 of the size, as in
// placeFoodMarkers) joined along the tangents, with a softened tip.
const PIN_SHAPE =
  '<svg class="food-pin-shape" viewBox="0 0 40 46" aria-hidden="true" focusable="false"><path d="M7.22 35.38A20 20 0 1 1 32.78 35.38L21.23 44.98Q20 46 18.77 44.98Z"/></svg>';

export class FoodGuideViewer {
  constructor({ viewer, toolbar, dataUrl, floorUrls, host }) {
    Object.assign(this, {
      viewer,
      toolbar,
      dataUrl,
      floorUrls,
      host,
      ready: false,
      places: [],
      // Facilities that are not food places (the ATM): an area and a card, no pin.
      facilities: [],
      error: null,
      promise: null,
      browse: false,
      selected: null,
      panelMode: null,
      hovered: null,
      blockedHover: null,
      listScroll: 0,
      action: 0,
      nodes: new Map(),
      // Today's food trucks (OIC Lunch Street), shown on the cards that ask for them.
      trucks: { payload: null, error: false, loading: false, fetchedAt: 0 },
      // Last values written to each pin, so a pan frame only moves it.
      drawn: new Map(),
      layout: null,
      pointer: null,
      internalNavigation: false,
      narrow: innerWidth <= 720,
      keyboard: false,
    });
    this.morePanel = document.querySelector('#facility-more-panel');
    this.moreToggle = document.querySelector('#facility-more-toggle');
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className =
      'search-icon-button facility-more-option food-action-button';
    this.button.innerHTML = foodIcon;
    this.morePanel.prepend(this.button);
    this.morePanel.classList.add('has-food-option');
    this.overlay = document.createElement('div');
    this.overlay.className = 'food-pin-layer';
    viewer.append(this.overlay);

    this.panel = document.createElement('section');
    this.panel.className = 'food-panel';
    this.panel.hidden = true;
    this.panel.setAttribute('role', 'region');
    this.panel.setAttribute('aria-labelledby', 'food-panel-title');
    document.body.append(this.panel);
    this.tip = document.createElement('div');
    this.tip.id = 'food-hover-tip';
    this.tip.className = 'food-hover-tip';
    this.tip.hidden = true;
    this.tip.setAttribute('role', 'tooltip');
    document.body.append(this.tip);
    this.hours = new CoopHoursClient({
      changed: () => {
        this.renderHours();
        this.scheduleHours();
      },
    });
    this.button.addEventListener('click', (event) => {
      if (this.browse) this.close();
      else void this.showList({ keyboard: event.detail === 0 });
    });
    // On a phone the opening More menu would sit under the store sheet, so the sheet slides away first.
    this.moreToggle.addEventListener(
      'click',
      () => {
        if (this.narrow && this.panelMode && this.moreToggle.getAttribute('aria-expanded') !== 'true')
          this.dismissSheet();
      },
      true,
    );
    // Same for the floor list: it opens in front of the sheet, and the sheet slides away first.
    const floorToggle = document.querySelector('[data-mobile-floor-toggle]');
    floorToggle?.addEventListener(
      'click',
      () => {
        if (this.narrow && this.panelMode && floorToggle.getAttribute('aria-expanded') !== 'true')
          this.dismissSheet();
      },
      true,
    );
    this.panel.addEventListener('click', (event) => this.panelClick(event));
    this.panel.addEventListener('pointerdown', (event) => this.beginSheetDrag(event));
    viewer.addEventListener(
      'pointerdown',
      (event) => this.pointerDown(event),
      true,
    );
    window.addEventListener(
      'pointermove',
      (event) => {
        if (
          this.pointer &&
          Math.hypot(
            event.clientX - this.pointer.x,
            event.clientY - this.pointer.y,
          ) >= FOOD_GESTURE_DISTANCE
        )
          this.pointer.cancelled = true;
      },
      true,
    );
    window.addEventListener(
      'pointerup',
      (event) => this.pointerUp(event),
      true,
    );
    window.addEventListener('pointercancel', () => this.cancelGesture(), true);
    viewer.addEventListener('pointerover', (event) => this.hoverEvent(event));
    viewer.addEventListener('pointerout', (event) => this.leaveEvent(event));
    viewer.addEventListener('focusin', (event) => {
      const id = event.target.closest('[data-food-place]')?.dataset.foodPlace;
      if (id) this.showHover(id, true);
    });
    viewer.addEventListener('focusout', (event) => {
      if (!event.relatedTarget?.closest('[data-food-place]')) this.leaveHover();
    });
    this.tip.addEventListener('pointerenter', () =>
      clearTimeout(this.leaveTimer),
    );
    this.tip.addEventListener('pointerleave', () => this.leaveHover());
    viewer.addEventListener('click', (event) => {
      const button = event.target.closest('.food-pin');
      if (button && event.detail === 0) {
        event.preventDefault();
        this.activateMarker(button, true);
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (!this.tip.hidden) {
        this.blockedHover = this.hovered;
        this.hideHover();
        event.preventDefault();
      } else if (this.panelMode || this.selected) {
        this.close();
        event.preventDefault();
      }
    });
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && (this.needsHours() || this.needsStatus())) {
        this.renderHours();
        if (this.needsHours()) void this.hours.refresh();
      }
      this.scheduleHours();
    });
    this.resize();
    void this.load();
  }

  async load() {
    if (this.ready) return true;
    if (this.promise) return this.promise;
    this.error = null;
    this.promise = (async () => {
      try {
        const [entries, response] = await Promise.all([
          this.host.entries(),
          fetch(this.dataUrl, { cache: 'no-cache' }),
        ]);
        if (!response.ok) throw Error('Food information unavailable');
        const payload = await response.json();
        this.places = validateFoodPlaces(payload, entries);
        this.sizeReferenceId = payload.pinSizeReferenceEntryId;
        this.entries = new Map(entries.map((entry) => [entry.id, entry]));
        this.facilities = FACILITY_PLACES.filter(
          (facility) => this.entries.get(facility.entryId)?.polygons?.length,
        ).map((facility) => {
          const anchor = facilityAnchor(this.entries.get(facility.entryId));
          return { ...facility, anchor: { ja: anchor, en: anchor } };
        });
        this.ready = true;
        this.error = null;
        await this.host.refreshMap();
        this.renderPanel();
        this.render();
        return true;
      } catch (error) {
        this.error = error;
        this.ready = false;
        this.renderPanel();
        return false;
      } finally {
        this.promise = null;
      }
    })();
    return this.promise;
  }
  // A place the map cards handle (a food place or a facility), so search selects it here.
  isStore(id) {
    return Boolean(this.getPlace(id) || this.getFacility(id));
  }
  derivedUrl(floorId, lang) {
    return this.ready && floorId === '1F' ? this.floorUrls[lang] : null;
  }
  getPlace(id) {
    return this.places.find((place) => place.entryId === id);
  }
  getFacility(id) {
    return this.facilities?.find((facility) => facility.entryId === id);
  }
  active() {
    return Boolean(this.panelMode);
  }

  async prepare() {
    this.internalNavigation = true;
    try {
      await this.host.prepare();
    } finally {
      this.internalNavigation = false;
    }
  }
  async showList({ keyboard = false } = {}) {
    const token = ++this.action;
    this.keyboard = keyboard;
    if (this.keyboard) this.opener = this.button;
    this.selected = null;
    this.browse = true;
    this.panelMode = 'list';
    this.hideHover();
    this.host.clearSelection();
    this.renderPanel();
    this.render();
    await this.prepare();
    await this.load();
    if (token !== this.action) return;
    this.renderPanel();
    this.renderAreas();
    this.render();
    if (this.needsHours() && this.hours.needsRefresh()) void this.hours.refresh();
    this.scheduleHours();
    if (this.keyboard) this.panel.querySelector('h2')?.focus();
  }
  async select(id, { keyboard = false, fromSearch = false } = {}) {
    if (
      !fromSearch &&
      this.selected === id &&
      this.panelMode &&
      this.panelMode !== 'list'
    )
      return true;
    const token = ++this.action;
    if (!(await this.load()) || token !== this.action) return false;
    const place = this.getPlace(id) ?? this.getFacility(id);
    if (!place) return false;
    if (this.panelMode === 'list') {
      this.listScroll =
        this.panel.querySelector('.food-panel-body')?.scrollTop || 0;
    }
    this.keyboard = keyboard;
    if (keyboard) this.opener = document.activeElement;
    this.selected = id;
    this.minimumCompactHeight = 0;
    this.panel.scrollTop = 0;
    this.panelMode = this.narrow ? 'compact' : 'detail';
    this.hideHover();
    this.panel.querySelector('.food-panel-body')?.scrollTo(0, 0);
    this.internalNavigation = true;
    try {
      await this.host.select(
        this.entries.get(id),
        fromSearch,
        () => token === this.action,
      );
    } finally {
      this.internalNavigation = false;
    }
    if (token !== this.action) return true;
    this.renderPanel();
    this.panel.scrollTop = 0;
    this.renderAreas();
    this.render();
    this.reveal();
    if (keyboard) this.panel.querySelector('h2')?.focus();
    if (this.needsHours() && this.hours.needsRefresh())
      void this.hours.refresh();
    this.scheduleHours();
    return true;
  }
  async search(entry) {
    if (!(await this.load())) return false;
    if (!this.isStore(entry.id)) {
      this.close({ clearHash: false });
      return false;
    }
    return this.select(entry.id, {
      fromSearch: true,
      keyboard: document.activeElement?.closest('#search-panel') !== null,
    });
  }
  close({ clearHash = true, sheet = false } = {}) {
    const token = ++this.action;
    this.selected = null;
    this.browse = false;
    this.panelMode = null;
    this.swipe = null;
    if (this.dragMove) {
      window.removeEventListener('pointermove', this.dragMove);
      window.removeEventListener('pointerup', this.dragEnd);
      window.removeEventListener('pointercancel', this.dragEnd);
      this.dragMove = null;
      this.dragEnd = null;
    }
    if (!sheet) this.sheetMotion?.cancel();
    this.hideHover();
    clearTimeout(this.closeTimer);
    this.closing = !this.panel.hidden;
    this.panel.inert = true;
    this.panel.setAttribute('aria-hidden', 'true');
    const finish = () => {
      if (this.action !== token || this.panelMode) return;
      this.closing = false;
      this.panel.hidden = true;
      this.sheetMotion?.cancel();
      this.sheetMotion = null;
      this.panel.classList.remove('is-closing', 'is-dismissing', 'is-dragging');
    };
    if (
      this.closing &&
      sheet &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      this.closeTimer = setTimeout(finish, 420);
    } else if (
      this.closing &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      this.panel.classList.add('is-closing');
      this.closeTimer = setTimeout(finish, 120);
    } else finish();
    this.host.clearSelection(clearHash);
    this.renderAreas();
    this.render();
    this.scheduleHours();
    if (this.keyboard) {
      const origin =
        this.opener?.isConnected &&
        !this.opener.closest('[hidden]') &&
        this.opener.getClientRects().length
          ? this.opener
          : this.moreToggle;
      origin.focus();
    }
    this.keyboard = false;
  }
  externalChange() {
    if (!this.internalNavigation) this.close();
  }

  // Pins draw the head and the tail as one shape so the edge and shadow run
  // around both; the card and the list show the mark in a plain circle.
  markerVisual(place, { heading = false } = {}) {
    const shape = heading ? '' : PIN_SHAPE;
    // A mark may fill more of the head than the usual 72% (a tall text logo).
    const size = place.mark.size ? ` style="--food-mark-size:${Math.round(place.mark.size * 100)}%"` : '';
    return `<span class="food-badge${heading ? ' is-heading' : ''}"${size}>${shape}<img src="${escape(place.mark.src)}" alt="" draggable="false"/></span>`;
  }
  wireImageFallback(root) {
    root.querySelectorAll('.food-badge img').forEach((img) =>
      img.addEventListener(
        'error',
        () => {
          const place = this.getPlace(
            img.closest('[data-food-place]')?.dataset.foodPlace ||
              this.selected,
          );
          if (place) img.src = place.mark.fallbackSrc;
        },
        { once: true },
      ),
    );
  }

  languageChanged() {
    this.hideHover();
    this.layoutButton();
    this.renderPanel();
    this.renderAreas();
    this.render();
  }
  resize() {
    this.minimumCompactHeight = 0;
    const narrow = innerWidth <= 720;
    if (narrow !== this.narrow && this.selected && this.panelMode)
      this.panelMode = narrow ? 'compact' : 'detail';
    this.narrow = narrow;
    cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = requestAnimationFrame(() => {
      this.layoutButton();
      this.positionPanel();
      this.renderPanel();
      this.renderAreas();
      this.render();
    });
  }
  layoutButton() {
    this.button.setAttribute('aria-label', t('food.find'));
    this.button.title = t('food.title');
    const vertical = innerWidth >= 1240 && innerHeight >= 700;
    if (vertical)
      this.toolbar.style.setProperty(
        '--facility-button-size',
        `${Math.max(40, Math.min(48, (innerHeight - 300) / 11))}px`,
      );
    else this.toolbar.style.removeProperty('--facility-button-size');
    const bottom = this.moreToggle.getBoundingClientRect().bottom;
    const available = Math.max(
      48,
      innerHeight - this.host.map().insets.bottom - bottom - 24,
    );
    this.morePanel.style.setProperty('--food-more-available', `${available}px`);
  }
  panelGeometry() {
    const insets = this.host.map().insets,
      rect = this.viewer.getBoundingClientRect();
    const h = window.visualViewport?.height || innerHeight;
    const top = rect.top + insets.top + 8;
    const safe = parseFloat(getComputedStyle(this.panel).paddingBottom) || 0;
    // On a phone the sheet covers the legal footer: the footer's strip is part of the sheet's own area.
    const footer = this.narrow ? 0 : insets.bottom;
    const available = Math.max(0, h - top - footer - safe);
    this.shortScreen =
      available < 340 ||
      (this.minimumCompactHeight || 0) - 32 > Math.min(320, available - 120);
    if (this.narrow) {
      if (this.shortScreen && this.panelMode === 'compact')
        this.panelMode = 'detail';
      // A facility card has no details button, so its compact sheet is as tall as the card
      // (measured in renderPanel), up to the screen less the room kept for the map.
      // `available` stops at the home indicator. The sheet's own padding already
      // keeps the buttons above it, so the grey has to include that padding and
      // run to the screen edge. Stopping the box at `available` left a strip of
      // map under the card.
      const height =
        this.panelMode === 'compact' && this.facilityHeight
          ? Math.min(this.detailOnly(this.selected) ? 320 : this.facilityHeight, available - 120)
          : this.panelMode === 'compact'
          ? Math.min(
              Math.max(
                Math.round(h * 0.33),
                220,
                this.minimumCompactHeight || 0,
              ),
              320,
              available - 120,
            )
          : available + safe;
      return {
        left: 0,
        top: h - footer - height,
        width: innerWidth,
        height,
        bottom: footer,
      };
    }
    const rail = this.toolbar.getBoundingClientRect();
    const right =
      innerWidth >= 1240 && innerHeight >= 700
        ? rail.left - 12
        : rect.right - 12;
    return {
      left: right - 320,
      top: top + 4,
      width: 320,
      maxHeight: Math.max(0, h - insets.bottom - top - 16),
    };
  }
  positionPanel() {
    if (!this.panelMode) return;
    const g = this.panelGeometry();
    this.panel.classList.toggle('is-narrow', this.narrow);
    this.panel.classList.toggle('is-compact', this.panelMode === 'compact');
    this.panel.classList.toggle('has-short-space', this.shortScreen);
    // A handle drag owns top/height until the pointer is released.
    if (this.swipe) return;
    Object.assign(this.panel.style, {
      left: `${g.left}px`,
      top: `${g.top}px`,
      width: `${g.width}px`,
      height: g.height !== undefined ? `${g.height}px` : 'auto',
      maxHeight: g.maxHeight !== undefined ? `${g.maxHeight}px` : 'none',
    });
  }
  renderPanel() {
    this.button.setAttribute('aria-pressed', String(this.browse));
    this.button.classList.toggle('is-active', this.browse);
    this.host.refreshMore?.();
    if (!this.panelMode) {
      if (!this.closing) this.panel.hidden = true;
      return;
    }
    clearTimeout(this.closeTimer);
    this.closing = false;
    this.panel.classList.remove('is-closing');
    if (this.panel.classList.contains('is-dismissing')) {
      this.sheetMotion?.cancel();
      this.sheetMotion = null;
      this.panel.classList.remove('is-dismissing');
    }
    this.panel.inert = false;
    this.panel.removeAttribute('aria-hidden');
    this.panel.hidden = false;
    this.positionPanel();
    const oldScroll =
      this.panel.querySelector('.food-panel-body')?.scrollTop || 0;
    const previousMode = this.renderedMode;
    const focused = this.panel.contains(document.activeElement)
      ? document.activeElement
      : null;
    const focusAction = focused?.dataset.foodAction;
    const focusStore = focused?.dataset.foodSelect;
    const focusHeading = focused?.id === 'food-panel-title';
    const handle = this.narrow
      ? `<div class="food-sheet-handle" aria-hidden="true"><span></span></div>`
      : '';
    const close = `<button type="button" class="food-close" data-food-action="close" aria-label="${escape(t('food.close'))}">×</button>`;
    let header,
      body,
      footer = '';
    if (!this.ready) {
      header = `<h2 id="food-panel-title" tabindex="-1">${escape(t('food.title'))}</h2>${close}`;
      body = `<p>${escape(t(this.error ? 'food.loadError' : 'food.loading'))}</p>${this.error ? `<button class="food-control" data-food-action="retry">${escape(t('food.retry'))}</button>` : ''}`;
    } else if (this.panelMode === 'list') {
      header = `<h2 id="food-panel-title" tabindex="-1">${escape(t('food.listTitle'))}</h2>${close}`;
      const items = this.places;
      body = `<div class="food-store-list">${items.map((place) => `<button class="food-store-row" type="button" data-food-select="${escape(place.entryId)}" data-food-place="${escape(place.entryId)}">${this.markerVisual(place, { heading: true })}<span><strong>${escape(local(place.name))}</strong><span class="food-meta">${escape(local(place.building))} · 1F</span><span class="food-list-status" data-food-list-status="${escape(place.entryId)}"></span></span></button>`).join('')}</div>`;
    } else if (this.getFacility(this.selected)) {
      // A facility card: the icon, the name and place, the banks and the hours.
      const facility = this.getFacility(this.selected);
      const bullets = (items) =>
        `<ul class="food-bank-list">${items.map((item) => `<li>${escape(local(item))}</li>`).join('')}</ul>`;
      header = `<div class="food-card-brand" data-food-place="${escape(facility.entryId)}"><span class="food-badge is-heading is-facility"><img src="${escape(facility.icon)}" alt="" draggable="false"/></span><div><h2 id="food-panel-title" tabindex="-1">${escape(local(facility.name))}</h2><p class="food-meta">${escape(local(facility.building))} · 1F</p></div></div>${close}`;
      body = facility.institutions?.length
        ? `<section class="food-hours"><h3 class="food-heading">${escape(local(FACILITY_TEXT.institutions))}</h3>${bullets(facility.institutions)}</section>`
        : `<p class="food-description">${escape(local(facility.summary))}</p>`;
      if (facility.hours)
        body += `<section class="food-hours"><h3 class="food-heading">${escape(local(FACILITY_TEXT.hours))}</h3><div class="food-hours-list"><p>${escape(local(facility.hours)).replace(/–/g, '\u2060–\u2060')}</p></div></section>`;
      if (facility.hours || facility.institutions?.length)
        body += `<p class="food-meta">${escape(local(FACILITY_TEXT.note))}</p>`;
    } else {
      const place = this.getPlace(this.selected);
      if (!place) return;
      header = `<div class="food-card-brand" data-food-place="${escape(place.entryId)}">${this.markerVisual(place, { heading: true })}<div><h2 id="food-panel-title" tabindex="-1">${escape(local(place.name))}</h2><p class="food-meta">${escape(local(place.building))} · 1F</p></div></div>${close}`;
      // The description lives on the OIC Food page; the map card starts with the hours.
      body = `<section class="food-hours"><div class="food-lead-status" data-food-lead-status></div><h3 class="food-heading">${escape(t('food.hours'))}</h3><div class="food-hours-list" data-food-hours></div></section>`;
      if (place.todayTrucks) {
        body += this.renderTrucksSection(place.todayTrucks);
        this.ensureTrucks();
      }
      if (this.panelMode !== 'compact') {
        if (hasFoodUsage(place))
          body += `<section class="food-usage"><h3 class="food-heading">${escape(t('food.usage'))}</h3>${renderFoodUsage(place, { translate: t, text: local, headingTag: 'h4' })}</section>`;
        const linkButtons = renderFoodLinkButtons(place, { translate: t, className: 'food-control external' });
        if (linkButtons) body += `<div class="food-links">${linkButtons}</div>`;
        const hoursLink = renderFoodLinkRows(place, { translate: t });
        if (hoursLink) body += `<div class="food-sources">${hoursLink}</div>`;
      }
      const truckCard = this.detailOnly(this.selected);
      footer = `${this.panelMode === 'compact' && !truckCard ? `<button class="food-control is-primary" data-food-action="expand">${escape(t('food.details'))}</button>` : ''}${this.narrow && this.panelMode === 'detail' && !this.shortScreen && !this.detailOnly(this.selected) ? `<button class="food-text-control" data-food-action="collapse">${escape(t('food.collapse'))}</button>` : ''}<button class="food-text-control" data-food-action="list">${escape(this.browse ? t('food.backList') : t('food.listTitle'))}</button>`;
      // The Lunch Street summary sheet has no button at all: it is pulled up to open fully.
      if (this.panelMode === 'compact' && truckCard) footer = '';
    }
    this.panel.innerHTML = `${handle}<header class="food-panel-header">${header}</header><div class="food-panel-body">${body}</div>${footer ? `<footer class="food-panel-footer">${footer}</footer>` : ''}`;
    this.wireImageFallback(this.panel);
    this.wireTruckPhotos(this.panel);
    if (this.panelMode === 'list') this.renderListStatus();
    const scroller = this.panel.querySelector('.food-panel-body');
    scroller.scrollTop =
      this.panelMode === 'list' && previousMode !== 'list'
        ? this.listScroll
        : oldScroll;
    this.renderedMode = this.panelMode;
    this.renderHours();
    if (this.panelMode === 'compact') {
      this.measureCompactHeight();
      this.minimumCompactHeight =
        this.panel.querySelector('.food-sheet-handle').offsetHeight +
        this.panel.querySelector('.food-panel-header').offsetHeight +
        (this.panel.querySelector('.food-panel-footer')?.offsetHeight ?? 0) +
        64;
      this.positionPanel();
      if (this.panelMode !== 'compact') {
        this.renderPanel();
        return;
      }
    }
    const nextFocus = focusAction
      ? this.panel.querySelector(`[data-food-action="${focusAction}"]`)
      : focusStore
        ? this.panel.querySelector(`[data-food-select="${focusStore}"]`)
        : focusHeading
          ? this.panel.querySelector('h2')
          : null;
    nextFocus?.focus({ preventScroll: true });
  }
  panelClick(event) {
    const selected = event.target.closest('[data-food-select]');
    if (selected) {
      void this.select(selected.dataset.foodSelect, {
        keyboard: event.detail === 0,
      });
      return;
    }
    const action =
      event.target.closest('[data-food-action]')?.dataset.foodAction;
    if (action === 'close') this.close();
    if (action === 'retry') {
      void this.load();
      this.renderPanel();
    }
    if (action === 'expand' || action === 'collapse') {
      // The buttons glide the sheet the same way a swipe does.
      const from = this.narrow ? this.sheetBox() : null;
      this.setDetails(action === 'expand');
      if (from) this.glideSheet(from);
    }
    if (action === 'list') {
      if (this.browse) {
        this.selected = null;
        this.panelMode = 'list';
        this.host.clearSelection();
        this.renderPanel();
        this.renderAreas();
        this.render();
        if (this.needsHours() && this.hours.needsRefresh()) void this.hours.refresh();
        this.scheduleHours();
      } else void this.showList();
    }
  }
  // "Today's food trucks": the vendor names for this card's own spot, from the same API as the food page.
  trucksFresh() {
    const { payload, fetchedAt } = this.trucks;
    return Boolean(payload) && Date.now() - fetchedAt < FOOD_TRUCKS_FRESH_MS && payload.date === japaneseDate();
  }
  ensureTrucks() {
    const state = this.trucks;
    if (state.loading || this.trucksFresh()) return;
    if (state.error && Date.now() - state.fetchedAt < FOOD_TRUCKS_RETRY_MS) return;
    this.trucks = { ...state, loading: true };
    fetch(FOOD_TRUCKS_URL, { cache: 'no-cache' })
      .then((response) => {
        if (!response.ok) throw new Error(`${FOOD_TRUCKS_URL} returned ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        this.trucks = { payload, error: false, loading: false, fetchedAt: Date.now() };
      })
      .catch(() => {
        this.trucks = { payload: state.payload, error: true, loading: false, fetchedAt: Date.now() };
      })
      .finally(() => {
        // Only the list changes, so the panel's scroll and focus stay as they are.
        const node = this.panel.querySelector('[data-food-trucks]');
        if (!node) return;
        node.innerHTML = this.renderTrucksBody(node.dataset.foodTrucks);
        this.wireTruckPhotos(node);
      });
  }
  renderTrucksSection(spot) {
    return `<section class="food-today"><h3 class="food-heading">${escape(t('food.trucks'))}</h3><div data-food-trucks="${escape(spot)}">${this.renderTrucksBody(spot)}</div></section>`;
  }
  renderTrucksBody(spot) {
    const { payload, error } = this.trucks;
    if (!payload)
      return `<p class="food-muted">${escape(t(error ? 'food.trucks.error' : 'food.trucks.loading'))}</p>`;
    const trucks = Array.isArray(payload.trucks) ? payload.trucks : [];
    if (payload.outOfPeriod && !trucks.length)
      return `<p class="food-muted">${escape(t('food.trucks.outOfPeriod'))}</p>`;
    const here = trucks.filter((truck) => truck.spot === spot);
    if (!here.length) return `<p class="food-muted">${escape(t('food.trucks.none'))}</p>`;
    // The letter on the shop's photo (A and a differ) follows the name, so a name can be matched to its photo.
    const label = (truck) => `${escape(truck.name)}${truck.tag ? ` (${escape(truck.tag)})` : ''}`;
    const names = `<ul class="food-truck-names">${here.map((truck) => `<li>${label(truck)}</li>`).join('')}</ul>`;
    return names + renderFoodTruckPhotos(here);
  }
  // A photo that fails to load becomes a tile with the shop's name, so the grid keeps its shape.
  wireTruckPhotos(root) {
    const fallBack = (img) => {
      const tile = img.closest('.food-truck-photo');
      if (!tile || tile.classList.contains('is-fallback')) return;
      tile.classList.add('is-fallback');
      tile.replaceChildren(Object.assign(document.createElement('span'), { textContent: img.alt }));
    };
    root.querySelectorAll('.food-truck-photo img').forEach((img) => {
      if (img.complete && img.naturalWidth === 0 && img.currentSrc) fallBack(img);
      else img.addEventListener('error', () => fallBack(img), { once: true });
    });
  }
  // The Lunch Street cards have no "details" or "back to summary" button: the sheet is pulled up and down.
  detailOnly(id) {
    return Boolean(this.getPlace(id)?.todayTrucks);
  }
  setDetails(detail) {
    if (!this.selected) return;
    this.panelMode = detail
      ? 'detail'
      : this.shortScreen
        ? 'detail'
        : 'compact';
    this.renderPanel();
    this.render();
    if (!detail) this.reveal();
  }
  // The narrow sheet follows the handle, then eases into the next height
  // (or slides off the bottom). A short drag returns to where it started.
  beginSheetDrag(event) {
    const handle = event.target.closest('.food-sheet-handle');
    if (!handle || !this.narrow || !this.panelMode || event.button) return;
    if (this.sheetMotion) {
      const rect = this.panel.getBoundingClientRect();
      this.sheetMotion.cancel();
      this.sheetMotion = null;
      this.panel.style.top = `${rect.top}px`;
      this.panel.style.height = `${rect.height}px`;
    }
    const box = this.sheetBox();
    this.swipe = {
      id: event.pointerId,
      y: event.clientY,
      top: box.top,
      height: box.height,
      bottom: box.top + box.height,
      mode: this.panelMode,
      max: this.sheetLimit(),
      revealed: this.panelMode === 'detail',
      moved: false,
    };
    this.panel.classList.add('is-dragging');
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      /* A pointer that has already ended cannot be captured. */
    }
    this.dragMove = (pointer) => this.dragSheet(pointer);
    this.dragEnd = (pointer) => this.endSheetDrag(pointer);
    window.addEventListener('pointermove', this.dragMove, { passive: false });
    window.addEventListener('pointerup', this.dragEnd);
    window.addEventListener('pointercancel', this.dragEnd);
  }
  dragSheet(event) {
    const swipe = this.swipe;
    if (!swipe || swipe.id !== event.pointerId) return;
    const dy = event.clientY - swipe.y;
    if (!swipe.moved && Math.abs(dy) < 1) return;
    swipe.moved = true;
    if (event.cancelable) event.preventDefault();
    // Pulling the summary up reveals the full card under the moving edge.
    if (
      dy < -12 &&
      !swipe.revealed &&
      swipe.mode === 'compact' &&
      this.selected &&
      !this.shortScreen
    ) {
      swipe.revealed = true;
      this.panelMode = 'detail';
      this.renderPanel();
      this.panel.classList.add('is-dragging');
      const handle = this.panel.querySelector('.food-sheet-handle');
      try {
        handle?.setPointerCapture(swipe.id);
      } catch {
        /* The pointer can end between the render and the capture. */
      }
    }
    let height = swipe.height - dy;
    if (height > swipe.max) height = swipe.max + (height - swipe.max) * 0.2;
    if (height < 80) height = 80 + (height - 80) * 0.28;
    this.panel.style.height = `${height}px`;
    this.panel.style.top = `${swipe.bottom - height}px`;
  }
  endSheetDrag(event) {
    const swipe = this.swipe;
    if (!swipe || swipe.id !== event.pointerId) return;
    const dy = event.clientY - swipe.y;
    const from = this.sheetBox();
    this.swipe = null;
    if (this.dragMove) {
      window.removeEventListener('pointermove', this.dragMove);
      window.removeEventListener('pointerup', this.dragEnd);
      window.removeEventListener('pointercancel', this.dragEnd);
      this.dragMove = null;
      this.dragEnd = null;
    }
    this.panel.classList.remove('is-dragging');
    if (!swipe.moved) return;
    if (Math.abs(dy) < 48) {
      this.restoreSheet(swipe);
      this.glideSheet(from);
      return;
    }
    if (dy < 0 && swipe.mode !== 'detail' && this.selected && !this.shortScreen) {
      if (this.panelMode !== 'detail') this.setDetails(true);
      else this.positionPanel();
      this.glideSheet(from);
      return;
    }
    if (dy > 0 && swipe.mode === 'detail' && !this.shortScreen && this.selected) {
      this.setDetails(false);
      this.glideSheet(from);
      return;
    }
    if (dy > 0) {
      this.dismissSheet();
      return;
    }
    this.restoreSheet(swipe);
    this.glideSheet(from);
  }
  restoreSheet(swipe) {
    if (this.panelMode !== swipe.mode) {
      this.panelMode = swipe.mode;
      this.renderPanel();
      return;
    }
    this.positionPanel();
  }
  // Tallest the open sheet is allowed to be (the detail / list height).
  sheetLimit() {
    const mode = this.panelMode;
    const short = this.shortScreen;
    this.panelMode = mode === 'compact' ? 'detail' : mode;
    const height = this.panelGeometry().height;
    this.panelMode = mode;
    this.shortScreen = short;
    return height;
  }
  sheetBox() {
    const top = parseFloat(this.panel.style.top);
    const height = parseFloat(this.panel.style.height);
    if (Number.isFinite(top) && Number.isFinite(height)) return { top, height };
    const rect = this.panel.getBoundingClientRect();
    return { top: rect.top, height: rect.height };
  }
  glideSheet(from) {
    const next = this.sheetBox();
    if (
      matchMedia('(prefers-reduced-motion: reduce)').matches ||
      (Math.abs(next.top - from.top) < 0.5 &&
        Math.abs(next.height - from.height) < 0.5)
    )
      return;
    this.sheetMotion?.cancel();
    const motion = this.panel.animate(
      [
        { top: `${from.top}px`, height: `${from.height}px` },
        { top: `${next.top}px`, height: `${next.height}px` },
      ],
      { duration: SHEET_GLIDE_MS, easing: SHEET_GLIDE_EASE },
    );
    this.sheetMotion = motion;
    motion.onfinish = () => {
      if (this.sheetMotion === motion) this.sheetMotion = null;
    };
  }
  dismissSheet() {
    if (
      !this.narrow ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      this.close();
      return;
    }
    this.sheetMotion?.cancel();
    this.panel.classList.add('is-dismissing');
    this.sheetMotion = this.panel.animate(
      [{ transform: 'translateY(0)' }, { transform: 'translateY(110%)' }],
      { duration: 420, easing: SHEET_DISMISS_EASE, fill: 'forwards' },
    );
    this.close({ sheet: true });
  }

  // Places whose hours or status are on screen: the hover tip, selected card, or list.
  shownPlaces() {
    if (!this.panelMode) return [this.getPlace(this.hovered)].filter(Boolean);
    if (this.selected) return [this.getPlace(this.selected)].filter(Boolean);
    return this.panelMode === 'list' ? this.places : [];
  }
  needsHours() {
    return this.shownPlaces().some((place) => place.services.some((s) => s.coopScheduleName));
  }
  needsStatus() {
    return this.shownPlaces().some((place) => place.services.some((service) => service.status?.assignee));
  }
  // The list shows only an open/closed label per place, where the description used to be. A place with
  // a service that has no status (the 24-hour unstaffed store next to its bento sales) gets no label.
  listStatus(place) {
    const states = place.services.map(
      (service) =>
        judgeFoodServiceStatus(service, {
          payload: this.hours.payload,
          fetchFailed: Boolean(service.coopScheduleName && this.hours.error),
        }).state,
    );
    if (!states.length || states.includes('disabled')) return '';
    const state = states.includes('within') ? 'within' : states.includes('unknown') ? 'unknown' : 'outside';
    return renderFoodStateLabel(state, t);
  }
  renderListStatus() {
    for (const node of this.panel.querySelectorAll('[data-food-list-status]')) {
      const place = this.getPlace(node.dataset.foodListStatus);
      const html = place ? this.listStatus(place) : '';
      if (node.innerHTML !== html) node.innerHTML = html;
    }
  }
  // The compact sheet is as tall as its content (up to the screen less the room kept for the map),
  // so the hours are never cut off. Measured again when the hours change after loading.
  measureCompactHeight() {
    if (this.panelMode !== 'compact' || !this.selected) return;
    const style = this.panel.style,
      kept = [style.height, style.maxHeight];
    style.height = 'auto';
    style.maxHeight = 'none';
    this.facilityHeight = this.panel.offsetHeight;
    [style.height, style.maxHeight] = kept;
  }

  renderHours() {
    this.renderHover();
    if (this.panelMode === 'list') {
      this.renderListStatus();
      return;
    }
    const root = this.panel.querySelector('[data-food-hours]'),
      place = this.getPlace(this.selected);
    if (!root || !place) return;
    const compact = this.panelMode === 'compact';
    const loading = Boolean(this.hours.pending) && !this.hours.error;
    root.innerHTML = place.services
      .map((service) => {
        const heading =
          place.services.length > 1
            ? `<h4 class="food-service-name">${escape(local(service.name))}</h4>`
            : '';
        const block = describeFoodServiceHours(service, {
          text: local,
          translate: t,
          lang: getLang(),
          payload: this.hours.payload,
          loading,
          compact,
        });
        const status =
          place.services.length > 1
            ? renderFoodStatus(service, {
                translate: t,
                payload: this.hours.payload,
                fetchFailed: Boolean(service.coopScheduleName && this.hours.error),
              })
            : '';
        // With several services, each label comes right under its service name (as on the food page).
        if (block.kind === 'message') return `${heading}${status}<p>${escape(block.text)}</p>`;
        if (block.kind === 'coop') {
          const source = compact
            ? ''
            : `<a class="food-source-link external" href="${escape(block.sourceUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escape(t('food.coopSource') + ' ' + t('food.external'))}">${escape(t('food.coopSource'))}</a>`;
          return `${heading}${status}<p>${escape(block.dateLabel)}\n${escape(block.text)}</p>${source}`;
        }
        return (
          heading +
          status +
          block.versions
            .map((version) => {
              if (compact) {
                const prefix =
                  version.kind === 'temporary'
                    ? `<span class="food-chip is-accent">${escape(t('food.temporary'))}</span> `
                    : '';
                return `<p>${prefix}${escape(version.todayText)}</p>`;
              }
              const text = block.dateLabel ? `${block.dateLabel}\n${version.text}` : version.text;
              return `${version.title ? `<h4 class="food-version-title">${escape(version.title)}</h4>` : ''}<p>${escape(text)}</p>`;
            })
            .join('')
        );
      })
      .join('');
    const lead = this.panel.querySelector('[data-food-lead-status]');
    if (lead)
      lead.innerHTML = renderFoodLeadStatus(place, {
        translate: t,
        payload: this.hours.payload,
        fetchFailed: Boolean(this.hours.error),
      });
    // Hours that arrive or change after the first draw can make the card taller or shorter.
    if (compact && this.narrow) {
      const before = this.facilityHeight;
      this.measureCompactHeight();
      if (this.facilityHeight !== before) this.positionPanel();
    }
  }
  scheduleHours() {
    clearTimeout(this.hoursTimer);
    const hours = this.needsHours();
    const status = this.needsStatus();
    if ((!hours && !status) || document.visibilityState !== 'visible') return;
    const currentDay = japaneseDate();
    const wait = Math.min(hours ? this.hours.nextCheck() : FOOD_STATUS_MS, status ? FOOD_STATUS_MS : Infinity);
    this.hoursTimer = setTimeout(
      () => {
        this.renderHours();
        if (hours && (japaneseDate() !== currentDay || this.hours.needsRefresh()))
          void this.hours.refresh();
        else this.scheduleHours();
      },
      Math.min(wait, 2_147_483_647),
    );
  }

  renderAreas() {
    const map = this.host.map(),
      layer = map.areaLayer;
    if (!this.ready || !layer) return;
    if (map.floorId !== '1F') {
      layer.replaceChildren();
      return;
    }
    const lang = getLang();
    let svg = layer.querySelector('.food-area-svg');
    if (!svg || svg.dataset.lang !== lang) {
      svg = this.areaSvg(['facility-area-svg', 'food-area-svg'], lang);
      // A place that shares another's area (OIC Café) adds no outline of its own.
      const areas = this.places
        .filter((place) => !place.areaEntryId)
        .flatMap((place) =>
          this.entries
            .get(place.entryId)
            .polygons.map((polygon, index) => ({
              place,
              polygon,
              // A place sharing this area may claim one polygon as its own (areaPolygon):
              // hover and highlight stay joined, but a click selects that place.
              target:
                this.places.find(
                  (other) =>
                    other.areaEntryId === place.entryId &&
                    other.areaPolygon === index,
                ) ?? place,
            })),
        );
      this.appendAreas(svg, areas, lang);
      layer.replaceChildren(svg);
    }
    // Facility areas (the ATMs) sit on the pin layer, above the pins, so a pin
    // standing on one (7-Eleven's over its ATM) does not take its hover and
    // click. render() places this SVG over the map on every frame.
    let front = this.overlay.querySelector('.food-front-svg');
    if (!front || front.dataset.lang !== lang) {
      front?.remove();
      front = this.areaSvg(['food-front-svg'], lang);
      this.appendAreas(
        front,
        (this.facilities ?? []).flatMap((facility) =>
          this.entries
            .get(facility.entryId)
            .polygons.map((polygon) => ({ place: facility, polygon, target: facility })),
        ),
        lang,
      );
      this.overlay.append(front);
      this.frontBox = null;
      this.placeFrontAreas(map);
    }
    // Keep pointer targets mounted while hover/selection styles change.
    const areaOf = (id) => {
      const place = id ? (this.getPlace(id) ?? this.getFacility(id)) : null;
      return place ? (place.areaEntryId ?? place.entryId) : null;
    };
    const hoveredArea = areaOf(this.hovered),
      selectedArea = areaOf(this.selected);
    for (const group of [
      ...svg.querySelectorAll('.food-area'),
      ...front.querySelectorAll('.food-area'),
    ]) {
      const id = group.dataset.foodArea;
      // The food list outlines the food places only.
      group.classList.toggle('is-browsing', this.browse && !group.dataset.facility);
      group.classList.toggle('is-hovered', hoveredArea === id);
      group.classList.toggle('is-selected', selectedArea === id);
    }
  }
  areaSvg(classes, lang) {
    const svg = document.createElementNS(NS, 'svg');
    svg.classList.add(...classes);
    svg.dataset.lang = lang;
    svg.setAttribute('viewBox', '0 0 1000 1000');
    svg.setAttribute('preserveAspectRatio', 'none');
    return svg;
  }
  // One group per polygon: a white halo, the green outline and the hit target.
  appendAreas(svg, areas, lang) {
    const area = (polygon) =>
      Math.abs(
        polygon.reduce((sum, p, i) => {
          const q = polygon[(i + 1) % polygon.length];
          return sum + p.xRatio * q.yRatio - q.xRatio * p.yRatio;
        }, 0),
      );
    // Smaller overlapping store areas receive the hit, as specified.
    areas.sort(
      (a, b) =>
        area(b.polygon) - area(a.polygon) ||
        (b.place.order ?? 0) - (a.place.order ?? 0),
    );
    for (const { place, polygon, target } of areas) {
      const offset = place.areaOffset?.[lang] ?? { xRatio: 0, yRatio: 0 };
      const group = document.createElementNS(NS, 'g');
      group.classList.add('food-area');
      group.dataset.foodPlace = target.entryId;
      group.dataset.foodArea = place.entryId;
      if (place.kind) group.dataset.facility = place.kind;
      for (const cls of [
        'food-area-halo',
        'food-area-outline',
        'food-area-hit',
      ]) {
        const p = document.createElementNS(NS, 'polygon');
        p.setAttribute(
          'points',
          polygon
            .map(
              (p) =>
                `${(p.xRatio + offset.xRatio) * 1000},${(p.yRatio + offset.yRatio) * 1000}`,
            )
            .join(' '),
        );
        p.setAttribute('vector-effect', 'non-scaling-stroke');
        p.classList.add(cls);
        p.setAttribute('aria-hidden', 'true');
        group.append(p);
      }
      svg.append(group);
    }
  }
  // Lays the facility-area SVG over the map; on a pan only its transform changes.
  placeFrontAreas(map) {
    const front = this.overlay.querySelector('.food-front-svg');
    if (!front) return;
    const size = `${map.width}|${map.height}`,
      transform = `translate3d(${map.x}px, ${map.y}px, 0)`;
    const box = this.frontBox ?? (this.frontBox = {});
    if (box.size !== size) {
      box.size = size;
      front.style.width = `${map.width}px`;
      front.style.height = `${map.height}px`;
    }
    if (box.transform !== transform) front.style.transform = box.transform = transform;
  }

  // Runs on every pan and zoom frame, so it writes only what changed.
  render() {
    const map = this.host.map();
    setAttribute(this.button, 'aria-pressed', String(this.browse));
    this.button.classList.toggle('is-active', this.browse);
    if (this.moreBrowse !== this.browse) {
      this.moreBrowse = this.browse;
      this.host.refreshMore?.();
    }
    const imageSrc = map.image?.src ?? null;
    if (imageSrc !== this.imageSrc) {
      const imagePath = imageSrc ? new URL(imageSrc).pathname : null;
      this.imageSrc = imageSrc;
      this.displayLang = ['ja', 'en'].find(
        (lang) =>
          imagePath === new URL(this.floorUrls[lang], location.href).pathname,
      );
    }
    const displayLang = this.displayLang;
    const available = this.ready && map.floorId === '1F' && displayLang;
    this.overlay.hidden = !available;
    if (!available) {
      this.overlay
        .querySelectorAll('.food-pin')
        .forEach((n) => (n.hidden = true));
      return;
    }
    this.placeFrontAreas(map);
    const points = this.places.map((place) => ({
      id: place.entryId,
      order: place.order,
      x: map.x + map.width * place.anchor[displayLang].xRatio,
      y: map.y + map.height * place.anchor[displayLang].yRatio,
    }));
    this.layout = placeFoodMarkers(points, map.width, this.sizeReferenceId);
    const used = new Set();
    for (const marker of this.layout.markers) {
      used.add(marker.id);
      let button = this.nodes.get(marker.id);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'food-pin';
        this.nodes.set(marker.id, button);
        this.overlay.append(button);
      }
      if (button.hidden) button.hidden = false;
      // The tip sits at the anchor: the pin box is moved, never laid out
      // again, while the map is only panned.
      const drawn = this.drawn.get(marker.id) ?? {};
      const transform = `translate3d(${marker.x - marker.hit / 2}px, ${marker.y - marker.hit}px, 0)`;
      if (drawn.transform !== transform)
        button.style.transform = drawn.transform = transform;
      const geometry = `${marker.size}|${marker.hit}|${marker.clip}`;
      if (drawn.geometry !== geometry) {
        drawn.geometry = geometry;
        button.style.setProperty('--food-pin-size', `${marker.size}px`);
        button.style.setProperty('--food-tail', `${marker.tail}px`);
        button.style.setProperty('--food-pin-hit', `${marker.hit}px`);
        button.style.clipPath = `polygon(${marker.clip})`;
      }
      this.drawn.set(marker.id, drawn);
      {
        const place = this.getPlace(marker.id);
        if (button.dataset.foodPlace !== marker.id)
          button.dataset.foodPlace = marker.id;
        const lang = button.dataset.lang;
        if (lang !== getLang() || !button.firstChild) {
          button.innerHTML = this.markerVisual(place);
          button.dataset.lang = getLang();
          this.wireImageFallback(button);
        }
        setAttribute(
          button,
          'aria-label',
          t('food.pin', {
            name: local(place.name),
            building: local(place.building),
          }),
        );
        setAttribute(
          button,
          'aria-pressed',
          String(this.selected === marker.id),
        );
      }
      button.classList.toggle('is-selected', this.selected === marker.id);
      button.classList.toggle('is-hovered', this.hoverPins().includes(marker.id));
      const previous = [...used].slice(-2, -1)[0];
      const sibling = previous ? this.nodes.get(previous) : null;
      if (sibling && sibling.nextElementSibling !== button)
        sibling.after(button);
      else if (!sibling && this.overlay.firstElementChild !== button)
        this.overlay.prepend(button);
    }
    for (const [id, node] of this.nodes) if (!used.has(id)) node.hidden = true;
  }
  reveal() {
    if (!this.selected) return;
    this.render();
    const map = this.host.map(),
      point = (this.getPlace(this.selected) ?? this.getFacility(this.selected))?.anchor[getLang()];
    if (!point) return;
    const x = map.x + map.width * point.xRatio,
      y = map.y + map.height * point.yRatio;
    const frame = this.viewer.getBoundingClientRect(),
      insets = map.insets;
    let left = 16,
      right = frame.width - 16,
      top = insets.top + 68,
      bottom = frame.height - insets.bottom - 16;
    if (this.panelMode) {
      const r = this.panel.getBoundingClientRect();
      if (this.narrow) bottom = Math.min(bottom, r.top - frame.top - 16);
      else right = Math.min(right, r.left - frame.left - 16);
    }
    if (right - left < 80 || bottom - top < 80) return;
    const dx =
      x < left + 32 ? left + 32 - x : x > right - 32 ? right - 32 - x : 0;
    const dy = y < top ? top - y : y > bottom ? bottom - y : 0;
    if (dx || dy) this.host.pan(map.x + dx, map.y + dy);
  }
  async activateMarker(button, keyboard = false) {
    if (button.dataset.foodPlace) {
      await this.select(button.dataset.foodPlace, { keyboard });
      return;
    }
  }
  pointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest('.food-action-button')) return;
    if (this.pointer) {
      this.pointer.cancelled = true;
      return;
    }
    const marker = event.target.closest('.food-pin'),
      area = event.target.closest('.food-area');
    this.pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      marker,
      place: area?.dataset.foodPlace,
      cancelled: false,
    };
    this.hideHover();
  }
  pointerUp(event) {
    const pointer = this.pointer;
    if (!pointer || pointer.id !== event.pointerId) return;
    this.pointer = null;
    if (
      pointer.cancelled ||
      Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) >=
        FOOD_GESTURE_DISTANCE
    )
      return;
    if (!this.viewer.contains(event.target)) return;
    if (pointer.marker) {
      void this.activateMarker(pointer.marker);
      return;
    }
    if (pointer.place) {
      void this.select(pointer.place);
      return;
    }
    if (!event.target.closest('.food-action-button,.map-load-feedback'))
      this.close();
  }
  cancelGesture() {
    this.pointer = null;
    this.hideHover();
  }
  hasPointerTarget() {
    return Boolean(this.pointer?.marker || this.pointer?.place);
  }
  hoverEvent(event) {
    if (event.pointerType !== 'mouse' || this.panelMode || this.pointer) return;
    const id = event.target.closest('[data-food-place]')?.dataset.foodPlace;
    if (id) {
      this.hoverPosition = { x: event.clientX, y: event.clientY };
      this.showHover(id, false, Boolean(event.target.closest('.food-area')));
    }
  }
  // Pins lifted by the current hover: the hovered pin, or every pin that
  // shares the hovered store area (OIC Cafeteria and OIC Café).
  hoverPins() {
    const place = this.hovered ? this.getPlace(this.hovered) : null;
    if (!place || this.hoverKeyboard) return [];
    if (!this.hoverFromArea) return [place.entryId];
    const area = place.areaEntryId ?? place.entryId;
    return this.places
      .filter((other) => (other.areaEntryId ?? other.entryId) === area)
      .map((other) => other.entryId);
  }
  markHoverPins() {
    const lifted = new Set(this.hoverPins());
    for (const [id, node] of this.nodes)
      node.classList.toggle('is-hovered', lifted.has(id));
  }
  leaveEvent(event) {
    const old = event.target.closest('[data-food-place]')?.dataset.foodPlace,
      next =
        event.relatedTarget?.closest?.('[data-food-place]')?.dataset.foodPlace;
    if (old && old !== next && !this.tip.contains(event.relatedTarget)) {
      if (this.blockedHover === old) this.blockedHover = null;
      this.leaveHover();
    }
  }
  showHover(id, keyboard = false, fromArea = false) {
    if (
      this.panelMode ||
      this.blockedHover === id ||
      !(this.getPlace(id) ?? this.getFacility(id))
    )
      return;
    clearTimeout(this.leaveTimer);
    if (this.hovered === id && !this.tip.hidden) {
      // Moving between a pin and its own area keeps the tip but updates the lift.
      this.hoverFromArea = fromArea;
      this.markHoverPins();
      return;
    }
    clearTimeout(this.hoverTimer);
    this.hideHover();
    this.hovered = id;
    this.hoverKeyboard = keyboard;
    this.hoverFromArea = fromArea;
    this.renderAreas();
    this.markHoverPins();
    this.hoverTimer = setTimeout(
      () => {
        if (this.panelMode || this.hovered !== id) return;
        this.tip.hidden = false;
        if (this.needsHours() && this.hours.needsRefresh()) void this.hours.refresh();
        this.renderHover();
        this.scheduleHours();
      },
      keyboard ? 0 : 200,
    );
  }
  renderHover() {
    if (this.tip.hidden || !this.hovered) return;
    const place = this.getPlace(this.hovered) ?? this.getFacility(this.hovered);
    if (!place) return;
    let body = `<p>${escape(local(place.summary))}</p>`;
    if (place.services) {
      const hours = place.services.map((service) => {
        const block = describeFoodServiceHours(service, {
          text: local,
          translate: t,
          lang: getLang(),
          payload: this.hours.payload,
          loading: Boolean(this.hours.pending) && !this.hours.error,
          compact: true,
        });
        const text = block.kind === 'versions'
          ? block.versions.map((version) => version.todayText).join('\n')
          : block.text;
        return `${place.services.length > 1 ? `${local(service.name)}: ` : ''}${text}`;
      }).join('\n');
      const status = place.entryId === 'manual-1F-1775168091518-86hkqm'
        ? ''
        : this.listStatus(place) || renderFoodStateLabel('unknown', t);
      body = `${status ? `<p class="food-hover-status">${status}</p>` : ''}<p class="food-hover-hours">${escape(hours)}</p>`;
    }
    this.tip.innerHTML = `<strong>${escape(local(place.name))}</strong>${body}`;
    const button = this.nodes.get(this.hovered);
    const r =
      button && !button.hidden
        ? button.getBoundingClientRect()
        : {
            left: this.hoverPosition?.x || 8,
            top: this.hoverPosition?.y || 8,
            width: 0,
            height: 0,
          };
    const box = this.tip.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(
        innerWidth - box.width - 8,
        r.left + r.width / 2 - box.width / 2,
      ),
    );
    const above = r.top - box.height - 8;
    this.tip.style.left = `${left}px`;
    this.tip.style.top = `${above >= 8 ? above : Math.min(innerHeight - box.height - 8, r.top + r.height + 8)}px`;
    button?.setAttribute('aria-describedby', this.tip.id);
  }
  leaveHover() {
    clearTimeout(this.hoverTimer);
    clearTimeout(this.leaveTimer);
    this.leaveTimer = setTimeout(() => {
      if (!document.activeElement?.closest('[data-food-place]'))
        this.hideHover();
    }, 120);
  }
  hideHover() {
    clearTimeout(this.hoverTimer);
    clearTimeout(this.leaveTimer);
    this.tip.hidden = true;
    const old = this.hovered;
    this.hovered = null;
    this.hoverFromArea = false;
    this.nodes.get(old)?.removeAttribute('aria-describedby');
    this.markHoverPins();
    if (old) {
      this.renderAreas();
    }
    this.scheduleHours();
  }
}
