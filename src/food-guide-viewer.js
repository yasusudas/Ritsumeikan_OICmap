import { getLang, getLocale, t } from './i18n.js';
import {
  validateFoodPlaces,
  placeFoodMarkers,
  selectHoursVersions,
  calendarDay,
  japaneseDate,
  CoopHoursClient,
  FOOD_GESTURE_DISTANCE,
} from './food-guide-model.js';

const NS = 'http://www.w3.org/2000/svg';
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ],
  );
const local = (value) => value?.[getLang()] ?? value?.ja ?? '';
const foodIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 2v7m3-7v7M2 2v7c0 2 6 2 6 0M5 11v11M17 2c-4 3-4 9 0 10h3V2h-3Zm3 10v10"/></svg>';

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
      layout: null,
      pointer: null,
      internalNavigation: false,
      narrow: innerWidth <= 720,
      keyboard: false,
    });
    this.placeholder = document.createComment('Food button position');
    toolbar.prepend(this.placeholder);
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'search-icon-button food-action-button';
    this.button.innerHTML =
      foodIcon + '<span class="food-button-label"></span>';
    toolbar.insertBefore(this.button, this.placeholder.nextSibling);
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
    this.panel.addEventListener('click', (event) => this.panelClick(event));
    this.panel.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.food-sheet-handle'))
        this.swipe = { id: event.pointerId, y: event.clientY };
    });
    this.panel.addEventListener('pointerup', (event) => {
      if (!this.swipe || this.swipe.id !== event.pointerId) return;
      const dy = event.clientY - this.swipe.y;
      this.swipe = null;
      if (Math.abs(dy) < 48) return;
      if (dy < 0) this.setDetails(true);
      else if (this.panelMode === 'detail' && !this.shortScreen)
        this.setDetails(false);
      else this.close();
    });
    this.panel.addEventListener('pointercancel', () => {
      this.swipe = null;
    });
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
      if (document.visibilityState === 'visible' && this.needsHours()) {
        this.renderHours();
        void this.hours.refresh();
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
        this.places = validateFoodPlaces(await response.json(), entries);
        this.entries = new Map(entries.map((entry) => [entry.id, entry]));
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
  isStore(id) {
    return this.places.some((place) => place.entryId === id);
  }
  derivedUrl(floorId, lang) {
    return this.ready && floorId === '1F' ? this.floorUrls[lang] : null;
  }
  getPlace(id) {
    return this.places.find((place) => place.entryId === id);
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
    if (this.keyboard) this.panel.querySelector('h2')?.focus();
  }
  async select(id, { keyboard = false, fromSearch = false } = {}) {
    const token = ++this.action;
    if (!(await this.load()) || token !== this.action) return false;
    const place = this.getPlace(id);
    if (!place) return false;
    if (this.panelMode === 'list') {
      this.listScroll =
        this.panel.querySelector('.food-panel-body')?.scrollTop || 0;
    }
    this.keyboard = keyboard;
    if (keyboard) this.opener = document.activeElement;
    this.selected = id;
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
  close({ clearHash = true } = {}) {
    ++this.action;
    this.selected = null;
    this.browse = false;
    this.panelMode = null;
    this.hideHover();
    this.panel.hidden = true;
    this.host.clearSelection(clearHash);
    this.renderAreas();
    this.render();
    this.scheduleHours();
    if (this.keyboard) {
      const origin =
        this.opener?.isConnected && !this.opener.hidden
          ? this.opener
          : this.button;
      origin.focus();
    }
    this.keyboard = false;
  }
  externalChange() {
    if (!this.internalNavigation) this.close();
  }

  markerVisual(place, { heading = false } = {}) {
    return `<span class="food-badge ${heading ? 'is-heading' : ''}"><img src="${escape(place.mark.src)}" alt="" draggable="false"/></span>`;
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
    // Measure the original six-control layout, not the layout after inserting Food.
    this.button.remove();
    this.toolbar.classList.remove('has-food-button');
    this.toolbar.style.removeProperty('--facility-button-size');
    const width = innerWidth,
      height = innerHeight,
      rect = this.toolbar.getBoundingClientRect();
    const vertical = width >= 1240 && height >= 700;
    let fits = false;
    if (width <= 720) fits = rect.width >= 346;
    else if (vertical) {
      const size = Math.max(40, Math.min(48, (height - 300) / 11));
      const insets = this.host.map().insets;
      fits = size * 11 + 10 * 10 <= height - insets.top - insets.bottom - 32;
      if (fits)
        this.toolbar.style.setProperty('--facility-button-size', `${size}px`);
    } else {
      const controls = [...this.toolbar.children].filter((n) =>
        n.matches('.search-icon-button,.facility-more'),
      );
      const size = controls[0]?.getBoundingClientRect().width || 44;
      const gap = parseFloat(getComputedStyle(this.toolbar).gap) || 8;
      const row = this.toolbar.parentElement.getBoundingClientRect();
      const search = document
        .querySelector('#search-panel')
        .getBoundingClientRect();
      fits = 7 * size + 6 * gap <= row.right - search.right - 16;
    }
    this.button.classList.toggle('is-independent', !fits);
    document.body.classList.toggle('food-button-independent', !fits);
    if (fits) {
      this.toolbar.insertBefore(this.button, this.placeholder.nextSibling);
      this.toolbar.classList.add('has-food-button');
    } else {
      this.viewer.append(this.button);
      this.button.style.top = `${this.host.map().insets.top + 8}px`;
    }
    if (fits) this.button.style.removeProperty('top');
    this.button.setAttribute('aria-label', t('food.find'));
    this.button.title = t('food.title');
    this.button.querySelector('.food-button-label').textContent =
      t('food.title');
  }
  panelGeometry() {
    const map = this.host.map(),
      rect = this.viewer.getBoundingClientRect();
    const h = window.visualViewport?.height || innerHeight;
    const top = rect.top + map.insets.top + 8;
    const safe = parseFloat(getComputedStyle(this.panel).paddingBottom) || 0;
    const available = Math.max(0, h - top - map.insets.bottom - safe);
    this.shortScreen = available < 340;
    if (this.narrow) {
      if (this.shortScreen && this.panelMode === 'compact')
        this.panelMode = 'detail';
      const height =
        this.panelMode === 'compact'
          ? Math.min(Math.max(Math.round(h * 0.33), 220), 320, available - 120)
          : available;
      return {
        left: 0,
        top: h - map.insets.bottom - safe - height,
        width: innerWidth,
        height,
        bottom: map.insets.bottom + safe,
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
      maxHeight: Math.max(0, h - map.insets.bottom - top - 16),
    };
  }
  positionPanel() {
    if (!this.panelMode) return;
    const g = this.panelGeometry();
    this.panel.classList.toggle('is-narrow', this.narrow);
    this.panel.classList.toggle('is-compact', this.panelMode === 'compact');
    this.panel.classList.toggle('has-short-space', this.shortScreen);
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
    if (!this.panelMode) {
      this.panel.hidden = true;
      return;
    }
    this.panel.hidden = false;
    this.positionPanel();
    const oldScroll =
      this.panel.querySelector('.food-panel-body')?.scrollTop || 0;
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
      body = `<div class="food-store-list">${items.map((place) => `<button class="food-store-row" type="button" data-food-select="${escape(place.entryId)}" data-food-place="${escape(place.entryId)}">${this.markerVisual(place, { heading: true })}<span><strong>${escape(local(place.name))}</strong><span class="food-meta">${escape(local(place.building))} · 1F</span><span class="food-list-summary">${escape(local(place.summary))}</span></span></button>`).join('')}</div>`;
    } else {
      const place = this.getPlace(this.selected);
      if (!place) return;
      header = `<div class="food-card-brand" data-food-place="${escape(place.entryId)}">${this.markerVisual(place, { heading: true })}<div><h2 id="food-panel-title" tabindex="-1">${escape(local(place.name))}</h2><p class="food-meta">${escape(local(place.building))} · 1F</p></div></div>${close}`;
      body = `<p class="food-description">${escape(local(place.summary))}</p><section class="food-hours"><h3>${escape(t('food.hours'))}</h3><div data-food-hours></div></section>`;
      if (this.panelMode !== 'compact') {
        body += `<section class="food-usage"><h3>${escape(t('food.usage'))}</h3>${place.services
          .map(
            (service) =>
              `${place.services.length > 1 ? `<h4>${escape(local(service.name))}</h4>` : ''}<dl>${Object.entries(
                service.usage,
              )
                .map(
                  ([key, value]) =>
                    `<div><dt>${escape(t('food.usage.' + key))}</dt><dd>${escape(t('food.value.' + value))}${service.usageNotes[key] ? `<span>${escape(local(service.usageNotes[key]))}</span>` : ''}</dd></div>`,
                )
                .join('')}</dl>`,
          )
          .join('')}</section>`;
        const seen = new Set();
        body += `<div class="food-links">${['menu', 'hours', 'official']
          .filter(
            (key) =>
              place.links[key] &&
              !seen.has(place.links[key]) &&
              seen.add(place.links[key]),
          )
          .map(
            (key) =>
              `<a class="food-control" href="${escape(place.links[key])}" target="_blank" rel="noopener noreferrer" aria-label="${escape(t('food.link.' + key) + ' ' + t('food.external'))}">${escape(t('food.link.' + key))}<span aria-hidden="true">↗</span></a>`,
          )
          .join('')}</div>`;
        body += `<div class="food-sources">${place.sources.map((source) => `<p><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.title)}</a> · ${escape(source.checkedAt)}</p>`).join('')}<p>${escape(t('food.markNotice'))}</p></div>`;
      }
      const primary =
        this.panelMode === 'compact'
          ? ['expand', t('food.details')]
          : ['reveal', t('food.reveal')];
      footer = `<button class="food-control is-primary" data-food-action="${primary[0]}">${escape(primary[1])}</button>${this.narrow && this.panelMode === 'detail' && !this.shortScreen ? `<button class="food-text-control" data-food-action="collapse">${escape(t('food.collapse'))}</button>` : ''}<button class="food-text-control" data-food-action="list">${escape(this.browse ? t('food.backList') : t('food.listTitle'))}</button>`;
    }
    this.panel.innerHTML = `${handle}<header class="food-panel-header">${header}</header><div class="food-panel-body">${body}</div>${footer ? `<footer class="food-panel-footer">${footer}</footer>` : ''}`;
    this.wireImageFallback(this.panel);
    const scroller = this.panel.querySelector('.food-panel-body');
    scroller.scrollTop =
      this.panelMode === 'list' ? this.listScroll : oldScroll;
    this.renderHours();
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
    if (action === 'expand') this.setDetails(true);
    if (action === 'collapse') this.setDetails(false);
    if (action === 'reveal') {
      if (this.narrow && this.shortScreen) {
        this.panelMode = null;
        this.panel.hidden = true;
        this.render();
        this.reveal();
      } else {
        if (this.narrow) this.setDetails(false);
        this.reveal();
      }
    }
    if (action === 'list') {
      if (this.browse) {
        this.selected = null;
        this.panelMode = 'list';
        this.host.clearSelection();
        this.renderPanel();
        this.renderAreas();
        this.render();
        this.scheduleHours();
      } else void this.showList();
    }
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

  needsHours() {
    return Boolean(
      this.panelMode &&
        this.selected &&
        this.getPlace(this.selected)?.services.some((s) => s.coopScheduleName),
    );
  }
  renderHours() {
    const root = this.panel.querySelector('[data-food-hours]'),
      place = this.getPlace(this.selected);
    if (!root || !place) return;
    const compact = this.panelMode === 'compact';
    root.innerHTML = place.services
      .slice(0, compact ? 1 : undefined)
      .map((service) => {
        const heading =
          place.services.length > 1 && !compact
            ? `<h4>${escape(local(service.name))}</h4>`
            : '';
        if (service.coopScheduleName) {
          const day = calendarDay(this.hours.payload, service.coopScheduleName);
          if (!day)
            return (
              heading +
              `<p>${escape(t(this.hours.pending && !this.hours.error ? 'food.hoursLoading' : 'food.hoursUnknown'))}</p>`
            );
          const date = new Intl.DateTimeFormat(getLocale(), {
            timeZone: 'Asia/Tokyo',
            month: 'numeric',
            day: 'numeric',
            weekday: 'short',
          }).format(new Date(day.date + 'T00:00:00+09:00'));
          let copy = day.closed
            ? t('food.closedDay')
            : day.allDay
              ? t('food.allDay')
              : day.periods
                  .map((period) =>
                    `${period.label ? (t('food.period.' + period.label) === 'food.period.' + period.label ? period.label : t('food.period.' + period.label)) : ''} ${period.start}–${period.end}`.trim(),
                  )
                  .join('、');
          if (!copy) copy = day.text;
          const month = this.hours.payload.months.find(
            (m) => m.month === day.date.slice(0, 7),
          );
          return (
            heading +
            `<p>${escape(date)} ${escape(copy)}</p><a class="food-hours-source" href="${escape(month?.url || this.hours.payload.source.url)}" target="_blank" rel="noopener noreferrer">${escape(t('food.coopSource'))} ↗</a>`
          );
        }
        const versions = selectHoursVersions(service.hours);
        if (!versions.length)
          return heading + `<p>${escape(t('food.hoursUnknown'))}</p>`;
        return (
          heading +
          versions
            .map((version) => {
              const period = [version.validFrom, version.validThrough]
                .filter(Boolean)
                .join('〜');
              const title =
                version.kind === 'temporary'
                  ? t('food.temporary') + (period ? ` (${period})` : '')
                  : versions.some((v) => v.kind === 'temporary')
                    ? t('food.regular')
                    : period
                      ? period
                      : '';
              return `${title ? `<h4>${escape(title)}</h4>` : ''}<p>${escape(local(version.text))}</p>`;
            })
            .join('')
        );
      })
      .join('');
  }
  scheduleHours() {
    clearTimeout(this.hoursTimer);
    if (!this.needsHours() || document.visibilityState !== 'visible') return;
    const currentDay = japaneseDate();
    this.hoursTimer = setTimeout(
      () => {
        this.renderHours();
        if (japaneseDate() !== currentDay || this.hours.needsRefresh())
          void this.hours.refresh();
        else this.scheduleHours();
      },
      Math.min(this.hours.nextCheck(), 2_147_483_647),
    );
  }

  obstacles() {
    const origin = this.viewer.getBoundingClientRect(),
      result = [];
    const add = (element) => {
      if (!element || element.hidden || !element.getClientRects().length)
        return;
      const r = element.getBoundingClientRect();
      if (r.width && r.height)
        result.push({
          x: r.left - origin.left,
          y: r.top - origin.top,
          width: r.width,
          height: r.height,
        });
    };
    if (this.panelMode && !this.narrow) add(this.panel);
    if (this.button.classList.contains('is-independent')) add(this.button);
    if (innerWidth >= 1240 && innerHeight >= 700) {
      add(this.toolbar);
      add(document.querySelector('.floor-tab-stack'));
    }
    document.querySelectorAll('.search-highlight-pin').forEach(add);
    return result;
  }
  renderAreas() {
    const map = this.host.map(),
      layer = map.areaLayer;
    if (!this.ready || !layer) return;
    layer.replaceChildren();
    if (map.floorId !== '1F') return;
    const svg = document.createElementNS(NS, 'svg');
    svg.classList.add('facility-area-svg', 'food-area-svg');
    svg.setAttribute('viewBox', '0 0 1000 1000');
    svg.setAttribute('preserveAspectRatio', 'none');
    for (const place of this.places) {
      const entry = this.entries.get(place.entryId),
        offset = place.areaOffset[getLang()];
      for (const polygon of entry.polygons) {
        const group = document.createElementNS(NS, 'g');
        group.classList.add('food-area');
        group.dataset.foodPlace = place.entryId;
        if (this.browse) group.classList.add('is-browsing');
        if (this.hovered === place.entryId) group.classList.add('is-hovered');
        if (this.selected === place.entryId) group.classList.add('is-selected');
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
    layer.append(svg);
  }
  render() {
    const map = this.host.map();
    this.button.setAttribute('aria-pressed', String(this.browse));
    this.button.classList.toggle('is-active', this.browse);
    const derived = this.derivedUrl(map.floorId, getLang());
    const available =
      this.ready &&
      derived &&
      map.image &&
      new URL(map.image.src).pathname ===
        new URL(derived, location.href).pathname;
    this.overlay.hidden = !available;
    if (!available) {
      this.overlay
        .querySelectorAll('.food-pin')
        .forEach((n) => (n.hidden = true));
      return;
    }
    const points = this.places.map((place) => ({
      id: place.entryId,
      order: place.order,
      x: map.x + map.width * place.anchor[getLang()].xRatio,
      y: map.y + map.height * place.anchor[getLang()].yRatio,
    }));
    this.layout = placeFoodMarkers(points, map.width);
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
      button.hidden = false;
      button.style.left = `${marker.x}px`;
      button.style.top = `${marker.y}px`;
      button.style.setProperty('--food-pin-size', `${marker.size}px`);
      button.style.setProperty('--food-tail', `${marker.tail}px`);
      button.style.clipPath = `polygon(${marker.clip})`;
      {
        const place = this.getPlace(marker.id);
        button.dataset.foodPlace = marker.id;
        const lang = button.dataset.lang;
        if (lang !== getLang() || !button.firstChild) {
          button.innerHTML = this.markerVisual(place);
          button.dataset.lang = getLang();
          this.wireImageFallback(button);
        }
        button.setAttribute(
          'aria-label',
          t('food.pin', {
            name: local(place.name),
            building: local(place.building),
          }),
        );
        button.setAttribute(
          'aria-pressed',
          String(this.selected === marker.id),
        );
      }
      button.classList.toggle('is-selected', this.selected === marker.id);
      button.classList.toggle('is-hovered', this.hovered === marker.id);
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
      point = this.getPlace(this.selected).anchor[getLang()];
    const x = map.x + map.width * point.xRatio,
      y = map.y + map.height * point.yRatio;
    const frame = this.viewer.getBoundingClientRect();
    let left = 16,
      right = frame.width - 16,
      top = map.insets.top + 68,
      bottom = frame.height - map.insets.bottom - 16;
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
    if (this.pointer) this.pointer.cancelled = true;
    this.hideHover();
  }
  hasPointerTarget() {
    return Boolean(this.pointer?.marker || this.pointer?.place);
  }
  hoverEvent(event) {
    if (event.pointerType !== 'mouse' || this.panelMode) return;
    const id = event.target.closest('[data-food-place]')?.dataset.foodPlace;
    if (id) {
      this.hoverPosition = { x: event.clientX, y: event.clientY };
      this.showHover(id);
    }
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
  showHover(id, keyboard = false) {
    if (this.panelMode || this.blockedHover === id || !this.getPlace(id))
      return;
    clearTimeout(this.leaveTimer);
    if (this.hovered === id && !this.tip.hidden) return;
    clearTimeout(this.hoverTimer);
    this.hideHover();
    this.hovered = id;
    this.renderAreas();
    if (!keyboard) this.nodes.get(id)?.classList.add('is-hovered');
    this.hoverTimer = setTimeout(
      () => {
        if (this.panelMode || this.hovered !== id) return;
        const place = this.getPlace(id),
          button = this.nodes.get(id);
        this.tip.innerHTML = `<strong>${escape(local(place.name))}</strong><p>${escape(local(place.summary))}</p>`;
        this.tip.hidden = false;
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
      },
      keyboard ? 0 : 200,
    );
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
    this.nodes.get(old)?.removeAttribute('aria-describedby');
    this.nodes.get(old)?.classList.remove('is-hovered');
    if (old) {
      this.renderAreas();
    }
  }
}
