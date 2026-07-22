import './style.css';
import './domain-migration-notice.js';
import { inject } from '@vercel/analytics';
import { applyI18n, getLang, getLocale, onLanguageChange, t } from './i18n.js';

if (window.__FILE_MODE__) {
  console.warn('This app must be opened through a local server, not file://');
} else {
  inject({
    mode: import.meta.env.DEV ? 'development' : 'production'
  });

  const FLOOR_FILES = [
    {
      id: '1F',
      label: '1F',
      labelKey: 'floor.1F',
      dimensions: {
        ja: { width: 1587.4, height: 1122.52 },
        en: { width: 1190.55, height: 841.89 }
      },
      svgUrls: {
        ja: new URL('./assets/floors/ja/1F.svg', import.meta.url).href,
        en: new URL('./assets/floors/en/1F.svg', import.meta.url).href
      }
    },
    {
      id: '2F',
      label: '2F',
      labelKey: 'floor.2F',
      dimensions: {
        ja: { width: 1587.4, height: 1122.52 },
        en: { width: 1190.55, height: 841.89 }
      },
      svgUrls: {
        ja: new URL('./assets/floors/ja/2F.svg', import.meta.url).href,
        en: new URL('./assets/floors/en/2F.svg', import.meta.url).href
      }
    },
    {
      id: '3F',
      label: '3F',
      labelKey: 'floor.3F',
      dimensions: {
        ja: { width: 1587.4, height: 1122.52 },
        en: { width: 1190.55, height: 841.89 }
      },
      svgUrls: {
        ja: new URL('./assets/floors/ja/3F.svg', import.meta.url).href,
        en: new URL('./assets/floors/en/3F.svg', import.meta.url).href
      }
    },
    {
      id: '4F',
      label: '4F',
      labelKey: 'floor.4F',
      dimensions: {
        ja: { width: 1587.4, height: 1122.52 },
        en: { width: 1190.55, height: 841.89 }
      },
      svgUrls: {
        ja: new URL('./assets/floors/ja/4F.svg', import.meta.url).href,
        en: new URL('./assets/floors/en/4F.svg', import.meta.url).href
      }
    },
    {
      id: '5F',
      label: '5F',
      labelKey: 'floor.5F',
      dimensions: {
        ja: { width: 1587.4, height: 1122.52 },
        en: { width: 1190.55, height: 841.89 }
      },
      svgUrls: {
        ja: new URL('./assets/floors/ja/5F.svg', import.meta.url).href,
        en: new URL('./assets/floors/en/5F.svg', import.meta.url).href
      }
    },
    {
      id: 'A-6-9F',
      label: 'A棟6,7,8,9F',
      labelKey: 'floor.A-6-9F',
      dimensions: {
        ja: { width: 1587.4, height: 1122.52 },
        en: { width: 1190.55, height: 841.89 }
      },
      svgUrls: {
        ja: new URL('./assets/floors/ja/6F7F8F9F_BldgA.svg', import.meta.url).href,
        en: new URL('./assets/floors/en/6F7F8F9F_BldgA.svg', import.meta.url).href
      }
    },
    {
      id: 'H-6-9F',
      label: 'H棟6,7,8,9F',
      labelKey: 'floor.H-6-9F',
      dimensions: {
        ja: { width: 1587.4, height: 1122.52 },
        en: { width: 1190.55, height: 841.89 }
      },
      svgUrls: {
        ja: new URL('./assets/floors/ja/6F7F8F9F_BldgH.svg', import.meta.url).href,
        en: new URL('./assets/floors/en/6F7F8F9F_BldgH.svg', import.meta.url).href
      }
    }
  ];
  const SPECIAL_FLOOR_FILES_BY_FACILITY = {
    printer: {
      id: 'print-station',
      label: 'プリンター',
      labelKey: 'floor.printerMap',
      dimensions: {
        ja: { width: 1207.8, height: 858.96 },
        en: { width: 1208, height: 859 }
      },
      svgUrls: {
        ja: new URL('./assets/floors/ja/print-station.svg', import.meta.url).href,
        en: new URL('./assets/floors/en/print-station.svg', import.meta.url).href
      }
    }
  };
  const PDF_SUPPORT_ASSET_BASE = import.meta.env.BASE_URL;
  const MANUAL_SEARCH_INDEX_FILENAME = 'manual-search-index.json';
  const SEARCH_INDEX_URL = `${PDF_SUPPORT_ASSET_BASE}${MANUAL_SEARCH_INDEX_FILENAME}`;
  const DEFAULT_CONTACT_FORM_EMBED_URL =
    'https://docs.google.com/forms/d/e/1FAIpQLSdRZNEfH7hRLTylhvTLKUIJjXszWI8i3bq2VelAp7sfmH8fhQ/viewform?usp=dialog';
  const CONTACT_FORM_EMBED_URL =
    (import.meta.env.VITE_CONTACT_FORM_EMBED_URL || DEFAULT_CONTACT_FORM_EMBED_URL).trim();
  const MAP_PADDING = 32;
  const MOBILE_MAP_VIEWPORT_MAX_WIDTH = 720;
  const MOBILE_MIN_MAP_WIDTH_RATIO = 0.9;
  const VIEWER_MIN_ZOOM = 0.5;
  const SEARCH_RESULT_LIMIT = 18;
  const SEARCH_FOCUS_ZOOM = 6;
  const VIEW_ANIMATION_MS = 480;
  const SEARCH_PIN_VERTICAL_OFFSET_RATIO = 0.01;
  const EDITOR_GUIDE_PIN_VERTICAL_OFFSET_RATIO = 0.01;
  const DEFAULT_FACILITY_RING_DIAMETER_WIDTH_PERCENT = 0.8;
  const DOUBLE_TAP_SUPPRESSION_WINDOW_MS = 320;
  const MANUAL_POINT_RECT_RATIO = 0.001;
  const LEGACY_MANUAL_STORAGE_KEY = 'campus-map-manual-entries-v4';
  const MANUAL_DRAFT_STORAGE_KEY = 'campus-map-manual-draft-v5';
  const MANUAL_PUBLISHED_STORAGE_KEY = 'campus-map-manual-published-v5';
  const MANUAL_EXPORT_FILENAME = MANUAL_SEARCH_INDEX_FILENAME;
  const ROOM_CODE_PATTERN = /[A-Z]{1,3}\s*-?\s*\d{2,4}[A-Z]?/g;
  const SEARCHABLE_CHAR_PATTERN = /[\p{L}\p{N}]/u;
  const LETTER_PATTERN = /\p{L}/u;
  const STATIC_HASH_ROUTES = new Set(['about', 'contact']);
  let roomCodeCollator = new Intl.Collator(getLocale(), { numeric: true, sensitivity: 'base' });
  const svgCache = new Map();
  const appMode = document.body?.dataset.appMode === 'editor' ? 'editor' : 'viewer';
  const isEditorSite = appMode === 'editor';
  const viewer = document.querySelector('#viewer');
  const canvasLayer = document.querySelector('#canvas-layer');
  const statusElement = document.querySelector('#status');
  const appShell = document.querySelector('.app-shell');
  const topbar = document.querySelector('.topbar');
  const tabButtons = Array.from(document.querySelectorAll('.floor-tab'));
  const mobileFloorSelect = document.querySelector('[data-mobile-floor-select]');
  const mobileFloorToggle = document.querySelector('[data-mobile-floor-toggle]');
  const mobileFloorCurrent = document.querySelector('[data-mobile-floor-current]');
  const mobileFloorList = document.querySelector('[data-mobile-floor-list]');
  const mobileFloorOptions = Array.from(document.querySelectorAll('[data-mobile-floor-option]'));
  const searchPanel = document.querySelector('#search-panel');
  const searchInput = document.querySelector('#search-input');
  const searchClearButton = document.querySelector('#search-clear');
  const searchFeedback = document.querySelector('#search-feedback');
  const searchResults = document.querySelector('#search-results');
  const toiletRingLegend = document.querySelector('#toilet-ring-legend');
  const searchIconButtons = Array.from(document.querySelectorAll('.search-icon-button'));
  const siteMenu = document.querySelector('#site-menu');
  const siteMenuToggle = document.querySelector('#site-menu-toggle');
  const siteMenuPanel = document.querySelector('#site-menu-panel');
  const aboutMenuButton = document.querySelector('#about-menu-button');
  const aboutDialog = document.querySelector('#about-dialog');
  const aboutDialogCloseButton = document.querySelector('#about-dialog-close');
  const contactFormMenuButton = document.querySelector('#contact-form-menu-button');
  const contactFormDialog = document.querySelector('#contact-form-dialog');
  const contactFormDialogCloseButton = document.querySelector('#contact-form-dialog-close');
  const contactFormFrame = document.querySelector('#contact-form-frame');
  const contactFormFallback = document.querySelector('#contact-form-fallback');
  const editorToggleButton = document.querySelector('#editor-toggle');
  const editorPanel = document.querySelector('#editor-panel');
  const editorFloor = document.querySelector('#editor-floor');
  const editorCoords = document.querySelector('#editor-coords');
  const editorLabelInput = document.querySelector('#editor-label');
  const editorSaveButton = document.querySelector('#editor-save');
  const editorClearPointButton = document.querySelector('#editor-clear-point');
  const editorCopyButton = document.querySelector('#editor-copy');
  const editorExportButton = document.querySelector('#editor-export');
  const editorImportButton = document.querySelector('#editor-import');
  const editorImportInput = document.querySelector('#editor-import-input');
  const editorPublishButton = document.querySelector('#editor-publish');
  const editorFeedback = document.querySelector('#editor-feedback');
  const editorList = document.querySelector('#editor-list');
  const editorRingModeButtons = Array.from(document.querySelectorAll('.editor-ring-mode-button'));
  const editorToiletRingColorTools = document.querySelector('#editor-toilet-ring-color-tools');
  const editorRingColorButtons = Array.from(document.querySelectorAll('.editor-ring-color-button'));
  const editorRingClearButton = document.querySelector('#editor-ring-clear');
  const editorRingList = document.querySelector('#editor-ring-list');
  const editorJson = document.querySelector('#editor-json');
  const knownFacilityDefinitions = [
    { facilityKey: 'toilet', labelKey: 'facility.toilet' },
    { facilityKey: 'waterServer', labelKey: 'facility.waterServer' },
    { facilityKey: 'vendingMachine', labelKey: 'facility.vendingMachine' },
    { facilityKey: 'printer', labelKey: 'facility.printer' },
    { facilityKey: 'stairs', labelKey: 'facility.stairs' },
    { facilityKey: 'escalator', labelKey: 'facility.escalator' },
    { facilityKey: 'elevator', labelKey: 'facility.elevator' }
  ];
  const facilityButtonDefinitions = searchIconButtons
    .map((button) => {
      const facilityKey = button.dataset.facilityKey?.trim();
      if (!facilityKey) {
        return null;
      }

      return {
        facilityKey,
        labelKey: `facility.${facilityKey}`
      };
    })
    .filter((definition) => definition !== null);
  const facilityLabelByKey = Object.fromEntries(
    [...knownFacilityDefinitions, ...facilityButtonDefinitions].map((definition) => [
      definition.facilityKey,
      definition.labelKey
    ])
  );
  const FACILITY_RING_DIAMETER_WIDTH_PERCENT_BY_FACILITY = Object.fromEntries(
    knownFacilityDefinitions.map((definition) => [
      definition.facilityKey,
      DEFAULT_FACILITY_RING_DIAMETER_WIDTH_PERCENT
    ])
  );
  const editorRingFacilityKeys = new Set(
    editorRingModeButtons
      .map((button) => button.dataset.facilityKey?.trim())
      .filter((facilityKey) => Boolean(facilityKey && facilityKey in facilityLabelByKey))
  );
  const TOILET_RING_COLOR_VARIANT_OPTIONS = [
    { value: 'red', labelKey: 'color.red' },
    { value: 'blue', labelKey: 'color.blue' },
    { value: 'yellow', labelKey: 'color.yellow' }
  ];
  const DEFAULT_TOILET_RING_COLOR_VARIANT = 'red';
  const ringColorLabelByVariant = Object.fromEntries(
    TOILET_RING_COLOR_VARIANT_OPTIONS.map((option) => [option.value, option.labelKey])
  );
  const contactFormEmbedUrl = normalizeGoogleFormEmbedUrl(CONTACT_FORM_EMBED_URL);

  const state = {
    floorIndex: 0,
    zoom: 1,
    minZoom: 1,
    maxZoom: 10,
    x: 0,
    y: 0,
    baseWidth: 0,
    baseHeight: 0,
    intrinsicWidth: 0,
    intrinsicHeight: 0,
    isDragging: false,
    isPinching: false,
    dragStartX: 0,
    dragStartY: 0,
    startX: 0,
    startY: 0,
    pinchStartDistance: 0,
    pinchStartZoom: 1,
    pinchStartX: 0,
    pinchStartY: 0,
    pinchStartCenterX: 0,
    pinchStartCenterY: 0,
    floorLoadToken: 0,
    highlightLayer: null,
    ringLayer: null,
    editorLayer: null,
    searchReady: false,
    searchLoading: false,
    searchPromise: null,
    baseSearchEntries: [],
    baseFacilityRings: [],
    searchEntries: [],
    searchRouteIndex: new Map(),
    searchSuggestions: [],
    activeSuggestionIndex: -1,
    activeSearchEntryId: null,
    manualEntries: [],
    facilityRings: [],
    activeEditorPinKey: null,
    activeEditorRingId: null,
    activeRingEditorFacilityKey: null,
    activeToiletRingColorVariant: DEFAULT_TOILET_RING_COLOR_VARIANT,
    editMode: false,
    pendingEditorPoint: null,
    dragMoved: false,
    lastTouchEndAt: -Infinity,
    viewRenderFrame: 0,
    viewAnimationFrame: 0,
    mapRelayoutFrame: 0,
    initialZoom: 1,
    safeInsetTop: 0,
    safeInsetBottom: 0,
    facilityToggleState: Object.fromEntries(
      searchIconButtons
        .map((button) => button.dataset.facilityKey?.trim())
        .filter(Boolean)
        .map((facilityKey) => [facilityKey, 0])
    )
  };

  function registerViewerServiceWorker() {
    if (appMode !== 'viewer' || !('serviceWorker' in navigator) || !window.isSecureContext) {
      return;
    }

    if (import.meta.env.DEV) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
          .then(() => {
            if (!('caches' in window)) {
              return undefined;
            }

            return caches
              .keys()
              .then((cacheNames) =>
                Promise.all(
                  cacheNames
                    .filter((cacheName) => cacheName.startsWith('rits-oic-map-'))
                    .map((cacheName) => caches.delete(cacheName))
                )
              );
          })
          .catch((error) => {
            console.warn('Failed to clear development service worker.', error);
          });
      });
      return;
    }

    const swUrl = new URL('/sw.js', window.location.origin);
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(swUrl, { updateViaCache: 'none' }).catch((error) => {
        console.warn('Failed to register service worker.', error);
      });
    });
  }

  function normalizeGoogleFormEmbedUrl(value) {
    const url = String(value ?? '').trim();

    if (!url) {
      return '';
    }

    try {
      const parsedUrl = new URL(url, window.location.href);

      if (parsedUrl.hostname === 'docs.google.com' && parsedUrl.pathname.includes('/forms/')) {
        parsedUrl.searchParams.set('embedded', 'true');
      }

      return parsedUrl.toString();
    } catch {
      return url;
    }
  }

  function setStatus(message) {
    if (!statusElement) {
      return;
    }
    statusElement.textContent = message;
  }

  function setSearchFeedback(message) {
    if (searchFeedback) {
      searchFeedback.textContent = message;
    }
  }

  function renderFacilityToggleButtons() {
    searchIconButtons.forEach((button) => {
      const facilityKey = button.dataset.facilityKey?.trim();
      if (!facilityKey) {
        return;
      }

      const isActive = state.facilityToggleState[facilityKey] === 1;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });

    if (toiletRingLegend) {
      const isToiletActive = state.facilityToggleState.toilet === 1;
      toiletRingLegend.hidden = !isToiletActive;
    }
  }

  function setFacilityToggleState(facilityKey, nextValue) {
    if (!facilityKey || !(facilityKey in state.facilityToggleState)) {
      return;
    }

    const wasSpecialFloorActive = isSpecialFloorActive();
    const normalizedNextValue = nextValue === 1 ? 1 : 0;

    Object.keys(state.facilityToggleState).forEach((key) => {
      state.facilityToggleState[key] = normalizedNextValue === 1 && key === facilityKey ? 1 : 0;
    });

    const isNextSpecialFloorActive = isSpecialFloorActive();

    if (isNextSpecialFloorActive) {
      clearMapSelectionsForSpecialFloor();
      searchResults.hidden = true;
    }

    renderFacilityToggleButtons();
    updateMobileFloorSelection();

    if (wasSpecialFloorActive !== isNextSpecialFloorActive) {
      void renderFloor({ resetZoom: true });
      return;
    }

    renderFacilityRings();
  }

  function toggleFacilityToggleState(facilityKey) {
    if (!facilityKey || !(facilityKey in state.facilityToggleState)) {
      return;
    }

    const nextValue = state.facilityToggleState[facilityKey] === 1 ? 0 : 1;
    setFacilityToggleState(facilityKey, nextValue);
  }

  window.__facilityToggleState = state.facilityToggleState;
  window.__setFacilityToggleState = setFacilityToggleState;
  window.__toggleFacilityToggleState = toggleFacilityToggleState;
  window.__facilityRingDiameterWidthPercentByFacility = FACILITY_RING_DIAMETER_WIDTH_PERCENT_BY_FACILITY;
  window.__toiletRingColorVariantOptions = TOILET_RING_COLOR_VARIANT_OPTIONS;

  function getFacilityRingDiameterSize(facilityKey) {
    const widthPercent = Number(FACILITY_RING_DIAMETER_WIDTH_PERCENT_BY_FACILITY[facilityKey]);

    const normalizedWidthPercent =
      Number.isFinite(widthPercent) && widthPercent > 0 ? widthPercent : DEFAULT_FACILITY_RING_DIAMETER_WIDTH_PERCENT;
    const aspectRatio =
      state.baseWidth > 0 && state.baseHeight > 0 ? state.baseWidth / state.baseHeight : 1;

    return {
      widthPercent: normalizedWidthPercent,
      heightPercent: normalizedWidthPercent * aspectRatio
    };
  }

  function getCurrentFloorFacilityRings() {
    const currentFloorId = getFloorDefinition().id;
    return state.facilityRings.filter((ring) => ring.floorId === currentFloorId);
  }

  function getFacilityRingById(ringId) {
    return state.facilityRings.find((ring) => ring.id === ringId) ?? null;
  }

  function renderFacilityRings() {
    if (!state.ringLayer) {
      return;
    }

    state.ringLayer.replaceChildren();

    if (isSpecialFloorActive()) {
      return;
    }

    const currentFloorRings = getCurrentFloorFacilityRings().filter(
      (ring) => state.facilityToggleState[ring.facilityKey] === 1
    );

    if (currentFloorRings.length === 0) {
      return;
    }

    const fragment = document.createDocumentFragment();

    currentFloorRings.forEach((ring) => {
      const ringNode = document.createElement('div');
      const diameterSize = getFacilityRingDiameterSize(ring.facilityKey);
      ringNode.className = 'facility-ring';
      ringNode.classList.add(`color-${getFacilityRingVisualVariant(ring.facilityKey, ring.colorVariant)}`);
      ringNode.style.left = `${ring.xRatio * 100}%`;
      ringNode.style.top = `${ring.yRatio * 100}%`;
      ringNode.style.width = `${diameterSize.widthPercent}%`;
      ringNode.style.height = `${diameterSize.heightPercent}%`;
      ringNode.setAttribute('aria-hidden', 'true');
      fragment.append(ringNode);
    });

    state.ringLayer.append(fragment);
  }

  function getViewportSize() {
    return {
      width: viewer.clientWidth,
      height: viewer.clientHeight
    };
  }

  function getViewportHeight() {
    return Math.round(window.visualViewport?.height ?? window.innerHeight);
  }

  function updateMapStageHeight() {
    if (!appShell || !topbar) {
      return;
    }

    const topbarHeight = Math.ceil(topbar.getBoundingClientRect().height);
    const stageHeight = Math.max(getViewportHeight() - topbarHeight, 0);
    appShell.style.setProperty('--map-stage-height', `${stageHeight}px`);
  }

  function clamp(number, min, max) {
    return Math.min(Math.max(number, min), max);
  }

  function shouldAllowNativeDoubleTap(target) {
    return (
      target instanceof HTMLElement &&
      Boolean(target.closest('input, textarea, select, option, [contenteditable="true"], [contenteditable="plaintext-only"]'))
    );
  }

  function normalizeSearchValue(value) {
    return value.normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]+/gu, '');
  }

  function normalizeHashRouteId(value) {
    return String(value ?? '')
      .normalize('NFKC')
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '');
  }

  function createHashSlugPart(value, fallback = '') {
    return normalizeHashRouteId(value) || normalizeHashRouteId(fallback) || 'location';
  }

  function getDecodedLocationHash() {
    const rawHash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;

    if (!rawHash) {
      return '';
    }

    try {
      return decodeURIComponent(rawHash);
    } catch {
      return rawHash;
    }
  }

  function clearLocationHash() {
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }

  function replaceLocationHash(hashId) {
    if (!hashId) {
      return;
    }

    const nextUrl = `${window.location.pathname}${window.location.search}#${encodeURIComponent(hashId)}`;

    if (window.location.href !== new URL(nextUrl, window.location.href).href) {
      history.replaceState(null, '', nextUrl);
    }
  }

  function normalizeMatchSource(value) {
    return value.normalize('NFKC').toUpperCase();
  }

  function getFloorDefinition() {
    return FLOOR_FILES[state.floorIndex];
  }

  function getFloorLabel(floorOrId) {
    const floor =
      typeof floorOrId === 'string'
        ? FLOOR_FILES.find((candidate) => candidate.id === floorOrId) ??
          Object.values(SPECIAL_FLOOR_FILES_BY_FACILITY).find((candidate) => candidate.id === floorOrId)
        : floorOrId;

    if (!floor) {
      return String(floorOrId ?? '');
    }

    return floor.labelKey ? t(floor.labelKey) : floor.label;
  }

  function getEntryFloorLabel(entry) {
    return getFloorLabel(entry.floorId);
  }

  function getLocalizedEntryLabel(entry) {
    const englishLabel = String(entry?.labelEn ?? '').trim();
    return getLang() === 'en' && englishLabel ? englishLabel : entry.label;
  }

  function getActiveSpecialFloorFacilityKey() {
    return Object.keys(SPECIAL_FLOOR_FILES_BY_FACILITY).find(
      (facilityKey) => state.facilityToggleState[facilityKey] === 1
    ) ?? null;
  }

  function getActiveSpecialFloorDefinition() {
    const facilityKey = getActiveSpecialFloorFacilityKey();
    return facilityKey ? SPECIAL_FLOOR_FILES_BY_FACILITY[facilityKey] ?? null : null;
  }

  function getRenderedFloorDefinition() {
    return getActiveSpecialFloorDefinition() ?? getFloorDefinition();
  }

  function getFloorSvgUrl(floor) {
    const urls = floor?.svgUrls ?? {};
    return (getLang() === 'en' ? urls.en : urls.ja) ?? floor?.svgUrl ?? urls.ja ?? urls.en;
  }

  function getFloorSvgDimensions(floor) {
    const dimensions = floor?.dimensions ?? {};
    const localizedDimensions = (getLang() === 'en' ? dimensions.en : dimensions.ja) ?? dimensions.ja ?? dimensions.en;
    const width = Number(localizedDimensions?.width);
    const height = Number(localizedDimensions?.height);
    return width > 0 && height > 0 ? { width, height } : null;
  }

  function isSpecialFloorActive() {
    return getActiveSpecialFloorDefinition() !== null;
  }

  function deactivateSpecialFloorToggle() {
    const facilityKey = getActiveSpecialFloorFacilityKey();

    if (!facilityKey) {
      return false;
    }

    state.facilityToggleState[facilityKey] = 0;
    renderFacilityToggleButtons();
    return true;
  }

  function clearMapSelectionsForSpecialFloor() {
    state.activeSearchEntryId = null;

    if (isEditorSite) {
      state.activeEditorPinKey = null;
      state.activeEditorRingId = null;
      state.pendingEditorPoint = null;
    }
  }

  function getFloorOrder(floorId) {
    return FLOOR_FILES.findIndex((floor) => floor.id === floorId);
  }

  function setEditorFeedback(message) {
    if (editorFeedback) {
      editorFeedback.textContent = message;
    }
  }

  function getCurrentFloorLabel() {
    return getFloorLabel(getFloorDefinition());
  }

  function getMobileFloorDisplayLabel() {
    if (getActiveSpecialFloorFacilityKey() === 'printer') {
      return t('facility.printer');
    }

    return getCurrentFloorLabel();
  }

  function createManualEntryId(floorId) {
    return `manual-${floorId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function createFacilityRingId(facilityKey, floorId) {
    return `ring-${facilityKey}-${floorId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function getFacilityLabel(facilityKey) {
    const labelKey = facilityLabelByKey[facilityKey];
    return labelKey ? t(labelKey) : facilityKey;
  }

  function normalizeFacilityRingColorVariant(facilityKey, colorVariant) {
    if (facilityKey !== 'toilet') {
      return DEFAULT_TOILET_RING_COLOR_VARIANT;
    }

    const normalizedVariant = String(colorVariant ?? '').trim().toLowerCase();
    const resolvedVariant = normalizedVariant === 'white' ? 'yellow' : normalizedVariant;
    return ringColorLabelByVariant[resolvedVariant] ? resolvedVariant : DEFAULT_TOILET_RING_COLOR_VARIANT;
  }

  function getFacilityRingColorLabel(facilityKey, colorVariant) {
    if (facilityKey !== 'toilet') {
      return '';
    }

    const labelKey = ringColorLabelByVariant[normalizeFacilityRingColorVariant(facilityKey, colorVariant)];
    return labelKey ? t(labelKey) : '';
  }

  function getFacilityRingVisualVariant(facilityKey, colorVariant) {
    if (facilityKey === 'waterServer') {
      return 'water-server';
    }

    if (facilityKey !== 'toilet') {
      return 'other';
    }

    return normalizeFacilityRingColorVariant(facilityKey, colorVariant);
  }

  function sanitizeAliases(value) {
    if (Array.isArray(value)) {
      return value.map((item) => String(item).trim()).filter(Boolean);
    }

    return String(value)
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function normalizeRect(rect) {
    const widthRatio = clamp(Number(rect?.widthRatio) || 0, 0.001, 1);
    const heightRatio = clamp(Number(rect?.heightRatio) || 0, 0.001, 1);
    const xRatio = clamp(Number(rect?.xRatio) || 0, 0, 1 - widthRatio);
    const yRatio = clamp(Number(rect?.yRatio) || 0, 0, 1 - heightRatio);

    return {
      xRatio,
      yRatio,
      widthRatio,
      heightRatio
    };
  }

  function createEntrySearchTerms(label, aliases = []) {
    return [...new Set([label, ...aliases].map((value) => normalizeSearchValue(value)).filter(Boolean))];
  }

  function normalizeFacilityRingPoint(point) {
    const xRatio = Number(point?.xRatio);
    const yRatio = Number(point?.yRatio);

    if (!Number.isFinite(xRatio) || !Number.isFinite(yRatio)) {
      return null;
    }

    return {
      xRatio: clamp(xRatio, 0, 1),
      yRatio: clamp(yRatio, 0, 1)
    };
  }

  function hydrateManualEntry(entry, fallbackFloorId = getFloorDefinition().id) {
    const floorId =
      FLOOR_FILES.find((floor) => floor.id === entry?.floorId)?.id ??
      FLOOR_FILES.find((floor) => floor.label === fallbackFloorId)?.id ??
      getFloorDefinition().id;
    const label = String(entry?.label ?? '').trim();
    const labelEn = String(entry?.labelEn ?? '').trim();
    const rects = Array.isArray(entry?.rects) ? entry.rects.map((rect) => normalizeRect(rect)) : [];

    if (!label || rects.length === 0) {
      return null;
    }

    const aliases = sanitizeAliases(entry?.aliases ?? []);

    return {
      id: String(entry?.id ?? createManualEntryId(floorId)),
      label,
      labelEn,
      normalized: normalizeSearchValue(label),
      aliases,
      floorId,
      floorOrder: getFloorOrder(floorId),
      rects,
      source: 'manual'
    };
  }

  function hydrateManualEntriesCollection(source) {
    const sourceEntries = Array.isArray(source) ? source : source?.entries;

    if (!Array.isArray(sourceEntries)) {
      return [];
    }

    return sourceEntries
      .map((entry) => hydrateManualEntry(entry))
      .filter((entry) => entry !== null);
  }

  function hydrateFacilityRing(ring, fallbackFloorId = getFloorDefinition().id) {
    const facilityKey = String(ring?.facilityKey ?? '').trim();
    const floorId =
      FLOOR_FILES.find((floor) => floor.id === ring?.floorId)?.id ??
      FLOOR_FILES.find((floor) => floor.label === fallbackFloorId)?.id ??
      getFloorDefinition().id;
    const point = normalizeFacilityRingPoint(ring);

    if (!facilityKey || !(facilityKey in facilityLabelByKey) || !point) {
      return null;
    }

    const colorVariant = normalizeFacilityRingColorVariant(facilityKey, ring?.colorVariant);

    return {
      id: String(ring?.id ?? createFacilityRingId(facilityKey, floorId)),
      facilityKey,
      facilityLabel: getFacilityLabel(facilityKey),
      colorVariant,
      colorLabel: getFacilityRingColorLabel(facilityKey, colorVariant),
      floorId,
      floorOrder: getFloorOrder(floorId),
      xRatio: point.xRatio,
      yRatio: point.yRatio
    };
  }

  function hydrateFacilityRingsCollection(source) {
    const sourceRings = Array.isArray(source) ? source : source?.facilityRings;

    if (!Array.isArray(sourceRings)) {
      return [];
    }

    return sourceRings
      .map((ring) => hydrateFacilityRing(ring))
      .filter((ring) => ring !== null);
  }

  function getActiveManualStorageKey() {
    return isEditorSite ? MANUAL_DRAFT_STORAGE_KEY : MANUAL_PUBLISHED_STORAGE_KEY;
  }

  function readStoredEditorData(storageKey) {
    try {
      const raw = window.localStorage.getItem(storageKey);

      if (!raw) {
        return {
          exists: false,
          entries: [],
          facilityRings: []
        };
      }

      const parsed = JSON.parse(raw);
      return {
        exists: true,
        entries: hydrateManualEntriesCollection(parsed),
        facilityRings: hydrateFacilityRingsCollection(parsed)
      };
    } catch (error) {
      console.warn(`Failed to load editor data from ${storageKey}.`, error);
      return {
        exists: false,
        entries: [],
        facilityRings: []
      };
    }
  }

  function readStoredManualEntries(storageKey) {
    const snapshot = readStoredEditorData(storageKey);

    return {
      exists: snapshot.exists,
      entries: snapshot.entries
    };
  }

  function loadManualEntries(storageKey = getActiveManualStorageKey()) {
    return readStoredManualEntries(storageKey).entries;
  }

  function cloneFacilityRings(rings) {
    return hydrateFacilityRingsCollection({
      facilityRings: serializeFacilityRings(rings)
    });
  }

  function shouldPreferStoredEditorData(snapshot, fallbackEntries = [], fallbackFacilityRings = []) {
    if (!snapshot?.exists) {
      return false;
    }

    const storedEntryCount = snapshot.entries.length;
    const storedRingCount = snapshot.facilityRings.length;
    const fallbackEntryCount = fallbackEntries.length;
    const fallbackRingCount = fallbackFacilityRings.length;

    if (storedEntryCount === 0 && storedRingCount === 0) {
      return false;
    }

    if (fallbackEntryCount > 0 && storedEntryCount === 0) {
      return false;
    }

    if (fallbackRingCount > 0 && storedRingCount === 0) {
      return false;
    }

    return true;
  }

  function getCurrentPublishedEditorData(deployedEntries = [], deployedFacilityRings = []) {
    if (!isEditorSite) {
      return {
        entries: cloneManualEntries(deployedEntries),
        facilityRings: cloneFacilityRings(deployedFacilityRings)
      };
    }

    const legacySnapshot = readStoredEditorData(LEGACY_MANUAL_STORAGE_KEY);
    const publishedSnapshot = readStoredEditorData(MANUAL_PUBLISHED_STORAGE_KEY);
    const deployedSnapshot = {
      exists: false,
      entries: deployedEntries,
      facilityRings: deployedFacilityRings
    };
    const sourceSnapshot = shouldPreferStoredEditorData(publishedSnapshot, deployedEntries, deployedFacilityRings)
      ? publishedSnapshot
      : shouldPreferStoredEditorData(legacySnapshot, deployedEntries, deployedFacilityRings)
        ? legacySnapshot
        : deployedSnapshot;

    return {
      entries: cloneManualEntries(sourceSnapshot.entries),
      facilityRings: cloneFacilityRings(sourceSnapshot.facilityRings)
    };
  }

  function resolveCurrentEditorData(deployedEntries = [], deployedFacilityRings = []) {
    const currentPublishedData = getCurrentPublishedEditorData(deployedEntries, deployedFacilityRings);

    if (!isEditorSite) {
      return currentPublishedData;
    }

    const draftSnapshot = readStoredEditorData(MANUAL_DRAFT_STORAGE_KEY);
    return shouldPreferStoredEditorData(
      draftSnapshot,
      currentPublishedData.entries,
      currentPublishedData.facilityRings
    )
      ? draftSnapshot
      : currentPublishedData;
  }

  function resolveInitialEditorData(deployedEntries = [], deployedFacilityRings = []) {
    const publishedSnapshot = readStoredEditorData(MANUAL_PUBLISHED_STORAGE_KEY);
    const initialPublishedData = getCurrentPublishedEditorData(deployedEntries, deployedFacilityRings);

    if (
      !shouldPreferStoredEditorData(publishedSnapshot, deployedEntries, deployedFacilityRings) &&
      (initialPublishedData.entries.length > 0 || initialPublishedData.facilityRings.length > 0)
    ) {
      persistEditorData(MANUAL_PUBLISHED_STORAGE_KEY, initialPublishedData);
    }

    if (!isEditorSite) {
      return initialPublishedData;
    }

    const draftSnapshot = readStoredEditorData(MANUAL_DRAFT_STORAGE_KEY);

    if (shouldPreferStoredEditorData(draftSnapshot, initialPublishedData.entries, initialPublishedData.facilityRings)) {
      return draftSnapshot;
    }

    persistEditorData(MANUAL_DRAFT_STORAGE_KEY, initialPublishedData);
    return initialPublishedData;
  }

  async function fetchBundledEditorData() {
    const response = await fetch(SEARCH_INDEX_URL, { cache: 'no-store' });

    if (!response.ok) {
      throw new Error(`Failed to load search index: ${response.status}`);
    }

    const payload = await response.json();
    return {
      entries: hydrateManualEntriesCollection(payload),
      facilityRings: hydrateFacilityRingsCollection(payload)
    };
  }

  function serializeEntries(entries) {
    return entries.map((entry) => ({
      id: entry.id,
      floorId: entry.floorId,
      label: entry.label,
      ...(entry.labelEn ? { labelEn: entry.labelEn } : {}),
      aliases: entry.aliases,
      rects: entry.rects.map((rect) => ({
        xRatio: Number(rect.xRatio.toFixed(6)),
        yRatio: Number(rect.yRatio.toFixed(6)),
        widthRatio: Number(rect.widthRatio.toFixed(6)),
        heightRatio: Number(rect.heightRatio.toFixed(6))
      }))
    }));
  }

  function cloneManualEntries(entries) {
    return hydrateManualEntriesCollection({
      entries: serializeEntries(entries)
    });
  }

  function serializeFacilityRings(rings = state.facilityRings) {
    return [...rings]
      .sort((left, right) => {
        const floorOrder = left.floorOrder - right.floorOrder;

        if (floorOrder !== 0) {
          return floorOrder;
        }

        const facilityOrder = roomCodeCollator.compare(getFacilityLabel(left.facilityKey), getFacilityLabel(right.facilityKey));

        if (facilityOrder !== 0) {
          return facilityOrder;
        }

        if (left.yRatio !== right.yRatio) {
          return left.yRatio - right.yRatio;
        }

        return left.xRatio - right.xRatio;
      })
      .map((ring) => ({
        id: ring.id,
        facilityKey: ring.facilityKey,
        colorVariant: normalizeFacilityRingColorVariant(ring.facilityKey, ring.colorVariant),
        floorId: ring.floorId,
        xRatio: Number(ring.xRatio.toFixed(6)),
        yRatio: Number(ring.yRatio.toFixed(6))
      }));
  }

  function serializeManualEntries(entries = state.manualEntries, facilityRings = state.facilityRings) {
    const sortedEntries = [...entries].sort((left, right) => {
      const floorOrder = left.floorOrder - right.floorOrder;

      if (floorOrder !== 0) {
        return floorOrder;
      }

      return roomCodeCollator.compare(getLocalizedEntryLabel(left), getLocalizedEntryLabel(right));
    });

    return {
      version: 2,
      entries: serializeEntries(sortedEntries),
      facilityRings: serializeFacilityRings(facilityRings)
    };
  }

  function persistEditorData(
    storageKey = getActiveManualStorageKey(),
    { entries = state.manualEntries, facilityRings = state.facilityRings } = {}
  ) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(serializeManualEntries(entries, facilityRings)));
    } catch (error) {
      console.warn(`Failed to persist editor data to ${storageKey}.`, error);
    }
  }

  function persistManualEntries(storageKey = getActiveManualStorageKey(), entries = state.manualEntries) {
    persistEditorData(storageKey, { entries });
  }

  function getEntrySearchTerms(entry) {
    return createEntrySearchTerms(getLocalizedEntryLabel(entry), entry.aliases);
  }

  function getEntryHashBase(entry) {
    const floorSlug = createHashSlugPart(entry.floorId, getEntryFloorLabel(entry));
    const labelSlug = createHashSlugPart(entry.label, entry.id);
    return `${floorSlug}-${labelSlug}`;
  }

  function addEntryHashRoute(index, hashId, entry) {
    const normalizedHashId = normalizeHashRouteId(hashId);

    if (!normalizedHashId || STATIC_HASH_ROUTES.has(normalizedHashId)) {
      return;
    }

    if (!index.has(normalizedHashId)) {
      index.set(normalizedHashId, entry);
    }
  }

  function assignSearchEntryHashRoutes(entries) {
    const baseCounts = new Map();
    entries.forEach((entry) => {
      const base = getEntryHashBase(entry);
      baseCounts.set(base, (baseCounts.get(base) ?? 0) + 1);
    });

    const baseSeenCounts = new Map();
    const labelIndex = new Map();

    entries.forEach((entry) => {
      const base = getEntryHashBase(entry);
      const seenCount = (baseSeenCounts.get(base) ?? 0) + 1;
      baseSeenCounts.set(base, seenCount);

      entry.hashId = baseCounts.get(base) > 1 ? `${base}-${seenCount}` : base;

      [entry.label, entry.labelEn, ...entry.aliases].forEach((value) => {
        const labelHashId = normalizeHashRouteId(value);

        if (!labelHashId || STATIC_HASH_ROUTES.has(labelHashId)) {
          return;
        }

        const current = labelIndex.get(labelHashId);
        if (current === undefined) {
          labelIndex.set(labelHashId, entry);
        } else if (current !== entry) {
          labelIndex.set(labelHashId, null);
        }
      });
    });

    const routeIndex = new Map();
    entries.forEach((entry) => {
      addEntryHashRoute(routeIndex, entry.hashId, entry);
      addEntryHashRoute(routeIndex, entry.id, entry);
    });

    labelIndex.forEach((entry, labelHashId) => {
      if (entry) {
        addEntryHashRoute(routeIndex, labelHashId, entry);
      }
    });

    state.searchRouteIndex = routeIndex;
  }

  function refreshSearchEntries() {
    const combinedEntries = [...state.manualEntries];

    combinedEntries.sort((left, right) => {
      const labelOrder = roomCodeCollator.compare(getLocalizedEntryLabel(left), getLocalizedEntryLabel(right));

      if (labelOrder !== 0) {
        return labelOrder;
      }

      return left.floorOrder - right.floorOrder;
    });

    state.searchEntries = combinedEntries;
    assignSearchEntryHashRoutes(state.searchEntries);
  }

  function parseSvgLength(value) {
    if (!value) {
      return 0;
    }

    const parsed = Number.parseFloat(String(value).replace(/[^\d.+-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function extractSvgMetricsFromText(svgText) {
    const viewBoxMatch = svgText.match(/\bviewBox=(['"])([^'"]+)\1/i);

    if (viewBoxMatch?.[2]) {
      const values = viewBoxMatch[2]
        .trim()
        .split(/[\s,]+/)
        .map((value) => Number.parseFloat(value));

      if (values.length === 4 && values[2] > 0 && values[3] > 0) {
        return { width: values[2], height: values[3] };
      }
    }

    const widthMatch = svgText.match(/\bwidth=(['"])([^'"]+)\1/i);
    const heightMatch = svgText.match(/\bheight=(['"])([^'"]+)\1/i);
    const width = parseSvgLength(widthMatch?.[2]);
    const height = parseSvgLength(heightMatch?.[2]);

    if (width > 0 && height > 0) {
      return { width, height };
    }

    throw new Error('SVG size could not be determined.');
  }

  async function fetchSvgAsset(floor) {
    const svgUrl = getFloorSvgUrl(floor);
    const cacheKey = `${floor.id}:${svgUrl}`;

    if (svgCache.has(cacheKey)) {
      return svgCache.get(cacheKey);
    }

    const dimensions = getFloorSvgDimensions(floor);
    if (dimensions) {
      const asset = { url: svgUrl, width: dimensions.width, height: dimensions.height };
      svgCache.set(cacheKey, asset);
      return asset;
    }

    const response = await fetch(svgUrl);

    if (!response.ok) {
      throw new Error(`Failed to load SVG for ${floor.id}`);
    }

    const text = await response.text();
    if (!/<svg\b/i.test(text)) {
      throw new Error(`Invalid SVG for ${floor.id}`);
    }

    const metrics = extractSvgMetricsFromText(text);
    const asset = { url: svgUrl, width: metrics.width, height: metrics.height };
    svgCache.set(cacheKey, asset);
    return asset;
  }

  let isFirstFloorImage = true;

  function createFloorImageNode(floor) {
    const image = document.createElement('img');
    image.className = 'floor-svg';
    image.src = getFloorSvgUrl(floor);
    image.alt = '';
    image.draggable = false;
    image.setAttribute('aria-hidden', 'true');

    if (isFirstFloorImage) {
      image.fetchPriority = 'high';
      image.decoding = 'auto';
      isFirstFloorImage = false;
    } else {
      image.decoding = 'async';
    }

    return image;
  }

  // Height of the floating top bar / footer that overlay the full-bleed map,
  // so the map can be fitted/positioned into the readable area between them.
  function computeViewerSafeInsets() {
    if (isEditorSite) {
      return { top: 0, bottom: 0 };
    }
    const top = topbar ? Math.ceil(topbar.getBoundingClientRect().height) : 0;
    const footerEl = document.querySelector('.site-footer');
    const bottom = footerEl ? Math.ceil(footerEl.getBoundingClientRect().height) : 0;
    return { top, bottom };
  }

  function getMapFit(intrinsicWidth, intrinsicHeight) {
    const viewport = getViewportSize();
    const insets = computeViewerSafeInsets();
    const availableWidth = Math.max(viewport.width - MAP_PADDING, 80);
    const availableHeight = Math.max(viewport.height - MAP_PADDING, 80);
    // Safe height excludes the floating top bar / footer so the whole floor can
    // open inside the readable zone (not hidden behind the menu).
    const safeHeight = Math.max(viewport.height - insets.top - insets.bottom - MAP_PADDING, 80);
    // Contain = whole floor visible. Cover = map fills the frame edge-to-edge.
    const containScale = Math.min(availableWidth / intrinsicWidth, availableHeight / intrinsicHeight);
    const coverScale = Math.max(viewport.width / intrinsicWidth, viewport.height / intrinsicHeight);
    const safeContainScale = Math.min(availableWidth / intrinsicWidth, safeHeight / intrinsicHeight);

    return { containScale, coverScale, safeContainScale, insetTop: insets.top, insetBottom: insets.bottom };
  }

  function getViewerMinZoom(baseWidth) {
    const { width } = getViewportSize();
    if (width <= MOBILE_MAP_VIEWPORT_MAX_WIDTH && baseWidth > 0) {
      return clamp((width * MOBILE_MIN_MAP_WIDTH_RATIO) / baseWidth, 0.01, 1);
    }

    return VIEWER_MIN_ZOOM;
  }

  function updateCanvasLayerBaseSize() {
    canvasLayer.style.width = `${state.baseWidth}px`;
    canvasLayer.style.height = `${state.baseHeight}px`;
  }

  function flushViewRender() {
    state.viewRenderFrame = 0;
    canvasLayer.style.width = `${state.baseWidth * state.zoom}px`;
    canvasLayer.style.height = `${state.baseHeight * state.zoom}px`;
    canvasLayer.style.transform = `translate3d(${state.x}px, ${state.y}px, 0)`;

    const percent = Math.round(state.zoom * 100);
    setStatus(`${getFloorLabel(getRenderedFloorDefinition())} | ${percent}%`);
  }

  function scheduleViewRender() {
    if (state.viewRenderFrame) {
      return;
    }

    state.viewRenderFrame = window.requestAnimationFrame(() => {
      flushViewRender();
    });
  }

  function getPrefersReducedMotion() {
    return Boolean(
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function clampTranslate(x, y, zoom) {
    const { width: viewportWidth, height: viewportHeight } = getViewportSize();
    const top = state.safeInsetTop || 0;
    const bottom = state.safeInsetBottom || 0;
    const safeHeight = Math.max(viewportHeight - top - bottom, 0);
    const scaledWidth = state.baseWidth * zoom;
    const scaledHeight = state.baseHeight * zoom;
    const next = { x, y };

    if (scaledWidth <= viewportWidth) {
      next.x = (viewportWidth - scaledWidth) / 2;
    } else {
      next.x = clamp(x, viewportWidth - scaledWidth, 0);
    }

    if (scaledHeight <= safeHeight) {
      // Whole map fits the readable area → center it there (below the menu).
      next.y = top + (safeHeight - scaledHeight) / 2;
    } else {
      // Taller than the readable area → pan freely but keep it covering the area.
      next.y = clamp(y, viewportHeight - bottom - scaledHeight, top);
    }

    return next;
  }

  function clampPosition() {
    const clamped = clampTranslate(state.x, state.y, state.zoom);
    state.x = clamped.x;
    state.y = clamped.y;
  }

  function cancelViewAnimation() {
    if (state.viewAnimationFrame) {
      window.cancelAnimationFrame(state.viewAnimationFrame);
      state.viewAnimationFrame = 0;
    }
  }

  function updateView() {
    cancelViewAnimation();
    clampPosition();
    scheduleViewRender();
  }

  // Smoothly fly the viewport to a target zoom/translate. The destination is
  // pre-clamped so the motion settles exactly where it lands (no end-jump),
  // and any in-flight animation or user gesture cancels it cleanly.
  function animateView(targetZoom, targetX, targetY, duration = VIEW_ANIMATION_MS) {
    cancelViewAnimation();

    const clampedZoom = clamp(targetZoom, state.minZoom, state.maxZoom);
    const settled = clampTranslate(targetX, targetY, clampedZoom);
    const startZoom = state.zoom;
    const startX = state.x;
    const startY = state.y;
    const dz = clampedZoom - startZoom;
    const dx = settled.x - startX;
    const dy = settled.y - startY;

    const finish = () => {
      state.viewAnimationFrame = 0;
      state.zoom = clampedZoom;
      state.x = settled.x;
      state.y = settled.y;
      flushViewRender();
    };

    if (
      duration <= 0 ||
      getPrefersReducedMotion() ||
      (Math.abs(dz) < 0.001 && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5)
    ) {
      finish();
      return;
    }

    const startedAt = performance.now();
    const ease = (progress) => 1 - Math.pow(1 - progress, 3);

    const step = (now) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = ease(progress);
      state.zoom = startZoom + dz * eased;
      state.x = startX + dx * eased;
      state.y = startY + dy * eased;
      flushViewRender();

      if (progress < 1) {
        state.viewAnimationFrame = window.requestAnimationFrame(step);
      } else {
        finish();
      }
    };

    state.viewAnimationFrame = window.requestAnimationFrame(step);
  }

  function applyMapLayout(asset, { resetZoom = false, preserveView = false, centerRatios = null } = {}) {
    const preservedCenterRatios = centerRatios ?? (preserveView ? captureViewportCenterRatios() : null);
    const fit = getMapFit(asset.width, asset.height);
    const useFillFit = !isEditorSite;
    const baseScale = useFillFit ? fit.coverScale : fit.containScale;
    const hadDimensions = state.baseWidth > 0 && state.baseHeight > 0;
    state.intrinsicWidth = asset.width;
    state.intrinsicHeight = asset.height;
    state.baseWidth = asset.width * baseScale;
    state.baseHeight = asset.height * baseScale;
    state.safeInsetTop = fit.insetTop;
    state.safeInsetBottom = fit.insetBottom;

    if (useFillFit) {
      state.minZoom = getViewerMinZoom(state.baseWidth);
      state.initialZoom = clamp(fit.safeContainScale / baseScale, state.minZoom, 1);
    } else {
      state.initialZoom = 1;
      state.minZoom = 1;
    }

    state.zoom = clamp(state.zoom, state.minZoom, state.maxZoom);
    updateCanvasLayerBaseSize();

    if (resetZoom || !hadDimensions) {
      resetView();
    } else if (preservedCenterRatios) {
      restoreViewportCenterRatios(preservedCenterRatios);
    } else {
      updateView();
    }
  }

  function relayoutRenderedFloor({ preserveView = true } = {}) {
    if (!state.intrinsicWidth || !state.intrinsicHeight || !canvasLayer.childElementCount) {
      return;
    }

    applyMapLayout(
      { width: state.intrinsicWidth, height: state.intrinsicHeight },
      { resetZoom: false, preserveView }
    );

    renderSearchHighlights();
    renderFacilityRings();
    if (isEditorSite) {
      renderEditorOverlay();
    }
  }

  function scheduleMapRelayout() {
    updateMapStageHeight();

    if (!state.intrinsicWidth || !state.intrinsicHeight) {
      return;
    }

    if (state.mapRelayoutFrame) {
      return;
    }

    state.mapRelayoutFrame = window.requestAnimationFrame(() => {
      state.mapRelayoutFrame = 0;
      relayoutRenderedFloor({ preserveView: true });
    });
  }

  function isMobileFloorListOpen() {
    return Boolean(mobileFloorSelect?.classList.contains('is-open'));
  }

  function setMobileFloorListOpen(isOpen, { focusToggle = false } = {}) {
    if (!mobileFloorSelect || !mobileFloorToggle || !mobileFloorList) {
      return;
    }

    const nextOpen = Boolean(isOpen);

    if (mobileFloorList.hidden) {
      mobileFloorList.hidden = false;
    }

    mobileFloorSelect.classList.toggle('is-open', nextOpen);
    mobileFloorList.setAttribute('aria-hidden', String(!nextOpen));
    mobileFloorToggle.setAttribute('aria-expanded', String(nextOpen));
    mobileFloorToggle.setAttribute(
      'aria-label',
      t(nextOpen ? 'floor.dropdownClose' : 'floor.dropdownOpen', { floor: getMobileFloorDisplayLabel() })
    );
    mobileFloorOptions.forEach((button) => {
      button.tabIndex = nextOpen ? 0 : -1;
    });

    if (!nextOpen && focusToggle) {
      mobileFloorToggle.focus();
    }
  }

  function updateMobileFloorSelection() {
    const activeFloorId = getFloorDefinition().id;
    const displayLabel = getMobileFloorDisplayLabel();

    if (mobileFloorCurrent) {
      mobileFloorCurrent.textContent = displayLabel;
    }

    mobileFloorOptions.forEach((button) => {
      const isActive = button.dataset.floor === activeFloorId;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    });

    if (mobileFloorToggle) {
      mobileFloorToggle.setAttribute(
        'aria-label',
        t(isMobileFloorListOpen() ? 'floor.dropdownClose' : 'floor.dropdownOpen', { floor: displayLabel })
      );
    }
  }

  function updateTabSelection() {
    const activeFloorId = getFloorDefinition().id;
    tabButtons.forEach((button) => {
      const isActive = button.dataset.floor === activeFloorId;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
    updateMobileFloorSelection();
  }

  function getActiveSearchEntry() {
    return state.searchEntries.find((entry) => entry.id === state.activeSearchEntryId) ?? null;
  }

  function resetView() {
    state.zoom = state.initialZoom || 1;
    const { width, height } = getViewportSize();
    const top = state.safeInsetTop || 0;
    const bottom = state.safeInsetBottom || 0;
    const scaledWidth = state.baseWidth * state.zoom;
    const scaledHeight = state.baseHeight * state.zoom;
    state.x = (width - scaledWidth) / 2;
    state.y = top + (height - top - bottom - scaledHeight) / 2;
    updateView();
  }

  function captureViewportCenterRatios() {
    const { width, height } = getViewportSize();

    if (!state.baseWidth || !state.baseHeight || !state.zoom) {
      return { xRatio: 0.5, yRatio: 0.5 };
    }

    const mapX = (width / 2 - state.x) / state.zoom;
    const mapY = (height / 2 - state.y) / state.zoom;

    return {
      xRatio: clamp(mapX / state.baseWidth, 0, 1),
      yRatio: clamp(mapY / state.baseHeight, 0, 1)
    };
  }

  function restoreViewportCenterRatios(centerRatios) {
    const { width, height } = getViewportSize();
    const targetX = state.baseWidth * centerRatios.xRatio;
    const targetY = state.baseHeight * centerRatios.yRatio;
    state.x = width / 2 - targetX * state.zoom;
    state.y = height / 2 - targetY * state.zoom;
    updateView();
  }

  function renderSearchHighlights() {
    if (!state.highlightLayer) {
      return;
    }

    state.highlightLayer.replaceChildren();

    if (isSpecialFloorActive()) {
      return;
    }

    const activeEntry = getActiveSearchEntry();

    if (!activeEntry || activeEntry.floorId !== getFloorDefinition().id) {
      return;
    }

    const fragment = document.createDocumentFragment();
    activeEntry.rects.forEach((rect, index) => {
      const center = getRectCenter(rect);
      const pin = document.createElement('div');
      pin.className = 'search-highlight-pin';
      pin.style.left = `${center.xRatio * 100}%`;
      pin.style.top = `${clamp(center.yRatio - SEARCH_PIN_VERTICAL_OFFSET_RATIO, 0, 1) * 100}%`;
      pin.style.animationDelay = `${index * 120}ms`;
      fragment.append(pin);
    });

    state.highlightLayer.append(fragment);
  }

  function createEditorPinKey(entryId, rectIndex = 0) {
    return `${entryId}:${rectIndex}`;
  }

  function getRectCenter(rect) {
    return {
      xRatio: rect.xRatio + rect.widthRatio / 2,
      yRatio: rect.yRatio + rect.heightRatio / 2
    };
  }

  function getEditorGuidePinCenter(point) {
    return {
      xRatio: point.xRatio,
      yRatio: clamp(point.yRatio - EDITOR_GUIDE_PIN_VERTICAL_OFFSET_RATIO, 0, 1)
    };
  }

  function createEditorGuidePin(point, { isActive = false, isPending = false } = {}) {
    const guideCenter = getEditorGuidePinCenter(point);
    const guidePin = document.createElement('div');
    guidePin.className = 'editor-guide-pin';
    guidePin.style.left = `${guideCenter.xRatio * 100}%`;
    guidePin.style.top = `${guideCenter.yRatio * 100}%`;
    guidePin.setAttribute('aria-hidden', 'true');

    if (isActive) {
      guidePin.classList.add('is-active');
    }

    if (isPending) {
      guidePin.classList.add('is-pending');
    }

    return guidePin;
  }

  function renderEditorRingModeButtons() {
    if (!isEditorSite || editorRingModeButtons.length === 0) {
      return;
    }

    editorRingModeButtons.forEach((button) => {
      const facilityKey = button.dataset.facilityKey?.trim();
      const isActive = facilityKey && state.activeRingEditorFacilityKey === facilityKey;
      button.classList.toggle('is-active', Boolean(isActive));
      button.setAttribute('aria-pressed', String(Boolean(isActive)));
    });
  }

  function renderEditorRingColorButtons() {
    if (!isEditorSite || !editorToiletRingColorTools) {
      return;
    }

    const shouldShowToiletColors = state.activeRingEditorFacilityKey === 'toilet';
    editorToiletRingColorTools.hidden = !shouldShowToiletColors;

    editorRingColorButtons.forEach((button) => {
      const colorVariant = button.dataset.ringColorVariant?.trim();
      const isActive = shouldShowToiletColors && colorVariant === state.activeToiletRingColorVariant;
      button.classList.toggle('is-active', Boolean(isActive));
      button.setAttribute('aria-pressed', String(Boolean(isActive)));
    });
  }

  function setActiveToiletRingColorVariant(colorVariant) {
    state.activeToiletRingColorVariant = normalizeFacilityRingColorVariant('toilet', colorVariant);

    if (state.activeRingEditorFacilityKey === 'toilet') {
      setEditorFeedback(
        t('editor.ringModeToilet', {
          color: getFacilityRingColorLabel('toilet', state.activeToiletRingColorVariant)
        })
      );
    }

    refreshEditorUi();
  }

  function getCurrentFloorEditorRings() {
    const currentFloorId = getFloorDefinition().id;
    return state.facilityRings.filter((ring) => ring.floorId === currentFloorId);
  }

  function getEditorVisibleRings() {
    if (!state.activeRingEditorFacilityKey) {
      return [];
    }

    return getCurrentFloorEditorRings().filter((ring) => ring.facilityKey === state.activeRingEditorFacilityKey);
  }

  function updateEditorRingClearButtonState() {
    if (!editorRingClearButton) {
      return;
    }

    const isDisabled = !state.activeRingEditorFacilityKey || getEditorVisibleRings().length === 0;
    editorRingClearButton.disabled = isDisabled;
  }

  function setActiveRingEditorFacilityKey(facilityKey = null) {
    const normalizedFacilityKey =
      facilityKey && editorRingFacilityKeys.has(facilityKey) ? facilityKey : null;
    const nextFacilityKey =
      state.activeRingEditorFacilityKey === normalizedFacilityKey ? null : normalizedFacilityKey;

    state.activeRingEditorFacilityKey = nextFacilityKey;
    state.activeEditorRingId = null;

    if (nextFacilityKey) {
      state.pendingEditorPoint = null;
      state.activeEditorPinKey = null;
      if (nextFacilityKey === 'toilet') {
        setEditorFeedback(
          t('editor.ringModeToilet', {
            color: getFacilityRingColorLabel('toilet', state.activeToiletRingColorVariant)
          })
        );
      } else {
        setEditorFeedback(
          t('editor.ringModeFacility', {
            facility: getFacilityLabel(nextFacilityKey)
          })
        );
      }
    } else if (state.editMode) {
      setEditorFeedback(t('editor.ringModeOff'));
    }

    refreshEditorUi();
  }

  function createEditorRingHandle(ring, { isActive = false } = {}) {
    const diameterSize = getFacilityRingDiameterSize(ring.facilityKey);
    const ringButton = document.createElement('button');
    ringButton.type = 'button';
    ringButton.className = 'editor-ring-button';
    ringButton.classList.add(`color-${getFacilityRingVisualVariant(ring.facilityKey, ring.colorVariant)}`);
    ringButton.dataset.ringId = ring.id;
    ringButton.dataset.facilityKey = ring.facilityKey;
    ringButton.setAttribute(
      'aria-label',
      ring.facilityKey === 'toilet' && ring.colorLabel
        ? t('editor.ringHandleAriaWithColor', {
            facility: getFacilityLabel(ring.facilityKey),
            color: getFacilityRingColorLabel(ring.facilityKey, ring.colorVariant)
          })
        : t('editor.ringHandleAria', {
            facility: getFacilityLabel(ring.facilityKey)
          })
    );
    ringButton.style.left = `${ring.xRatio * 100}%`;
    ringButton.style.top = `${ring.yRatio * 100}%`;
    ringButton.style.width = `${diameterSize.widthPercent}%`;
    ringButton.style.height = `${diameterSize.heightPercent}%`;

    if (isActive) {
      ringButton.classList.add('is-active');
    }

    return ringButton;
  }

  function renderEditorRingList() {
    if (!isEditorSite || !editorRingList) {
      return;
    }

    const facilityKey = state.activeRingEditorFacilityKey;

    if (!facilityKey) {
      const empty = document.createElement('div');
      empty.className = 'editor-empty';
      empty.textContent = t('editor.noRingTool');
      editorRingList.replaceChildren(empty);
      updateEditorRingClearButtonState();
      return;
    }

    const rings = getEditorVisibleRings();

    if (rings.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'editor-empty';
      empty.textContent = t('editor.noRings', {
        floor: getCurrentFloorLabel(),
        facility: getFacilityLabel(facilityKey)
      });
      editorRingList.replaceChildren(empty);
      updateEditorRingClearButtonState();
      return;
    }

    const fragment = document.createDocumentFragment();

    rings.forEach((ring, index) => {
      const row = document.createElement('div');
      row.className = 'editor-entry';

      const body = document.createElement('div');
      body.className = 'editor-entry-body';

      const label = document.createElement('div');
      label.className = 'editor-entry-label';
      label.textContent =
        ring.facilityKey === 'toilet' && ring.colorLabel
          ? t('editor.ringLabelWithColor', {
              facility: getFacilityLabel(ring.facilityKey),
              color: getFacilityRingColorLabel(ring.facilityKey, ring.colorVariant),
              index: index + 1
            })
          : t('editor.ringLabel', {
              facility: getFacilityLabel(ring.facilityKey),
              index: index + 1
            });

      const meta = document.createElement('div');
      meta.className = 'editor-entry-meta';
      meta.textContent =
        ring.facilityKey === 'toilet' && ring.colorLabel
          ? `${getFacilityRingColorLabel(ring.facilityKey, ring.colorVariant)} / x ${ring.xRatio.toFixed(4)} / y ${ring.yRatio.toFixed(4)}`
          : `x ${ring.xRatio.toFixed(4)} / y ${ring.yRatio.toFixed(4)}`;

      body.append(label, meta);

      const actions = document.createElement('div');
      actions.className = 'editor-entry-actions';

      const focusButton = document.createElement('button');
      focusButton.type = 'button';
      focusButton.className = 'editor-entry-button';
      focusButton.dataset.action = 'focus-ring';
      focusButton.dataset.ringId = ring.id;
      focusButton.textContent = t('editor.move');

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'editor-entry-button';
      deleteButton.dataset.action = 'delete-ring';
      deleteButton.dataset.ringId = ring.id;
      deleteButton.textContent = t('editor.delete');

      actions.append(focusButton, deleteButton);
      row.append(body, actions);
      fragment.append(row);
    });

    editorRingList.replaceChildren(fragment);
    updateEditorRingClearButtonState();
  }

  function getManualEntryById(entryId) {
    return state.manualEntries.find((entry) => entry.id === entryId) ?? null;
  }

  function setActiveEditorPin(entryId = null, rectIndex = 0) {
    state.activeEditorPinKey = entryId ? createEditorPinKey(entryId, rectIndex) : null;

    if (entryId) {
      const entry = getManualEntryById(entryId);

      if (entry) {
        const aliasText = entry.aliases.length ? t('editor.aliasMeta', { aliases: entry.aliases.join(', ') }) : '';
        setEditorFeedback(`${getLocalizedEntryLabel(entry)}${aliasText}`);
      }
    }

    renderEditorOverlay();
  }

  function createPointRect(point) {
    if (!point) {
      return null;
    }

    const widthRatio = MANUAL_POINT_RECT_RATIO;
    const heightRatio = MANUAL_POINT_RECT_RATIO;

    return {
      xRatio: clamp(point.xRatio - widthRatio / 2, 0, 1 - widthRatio),
      yRatio: clamp(point.yRatio - heightRatio / 2, 0, 1 - heightRatio),
      widthRatio,
      heightRatio
    };
  }

  function getActiveEditorPoint() {
    if (!state.activeEditorPinKey) {
      return null;
    }

    const [entryId, rectIndexText] = state.activeEditorPinKey.split(':');
    const entry = getManualEntryById(entryId);
    const rect = entry?.rects[Number(rectIndexText ?? 0)];

    if (!rect) {
      return null;
    }

    return getRectCenter(rect);
  }

  function updateEditorCoords() {
    if (!isEditorSite || !editorCoords) {
      return;
    }

    const activeRing = state.activeEditorRingId ? getFacilityRingById(state.activeEditorRingId) : null;

    if (activeRing) {
      editorCoords.textContent = `x ${activeRing.xRatio.toFixed(4)} / y ${activeRing.yRatio.toFixed(4)}`;
      return;
    }

    if (state.pendingEditorPoint) {
      editorCoords.textContent = `x ${state.pendingEditorPoint.xRatio.toFixed(4)} / y ${state.pendingEditorPoint.yRatio.toFixed(4)}`;
      return;
    }

    const activePoint = getActiveEditorPoint();

    if (activePoint) {
      editorCoords.textContent = `x ${activePoint.xRatio.toFixed(4)} / y ${activePoint.yRatio.toFixed(4)}`;
      return;
    }

    editorCoords.textContent = t('editor.noCoords');
  }

  function updateEditorJsonOutput() {
    if (!isEditorSite || !editorJson) {
      return;
    }

    editorJson.value = JSON.stringify(serializeManualEntries(), null, 2);
  }

  function renderEditorList() {
    if (!isEditorSite || !editorList) {
      return;
    }

    const currentFloorId = getFloorDefinition().id;
    const currentFloorEntries = state.manualEntries.filter((entry) => entry.floorId === currentFloorId);

    if (currentFloorEntries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'editor-empty';
      empty.textContent = t('editor.noEntries', { floor: getCurrentFloorLabel() });
      editorList.replaceChildren(empty);
      return;
    }

    const fragment = document.createDocumentFragment();

    currentFloorEntries.forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'editor-entry';

      const body = document.createElement('div');
      body.className = 'editor-entry-body';

      const label = document.createElement('div');
      label.className = 'editor-entry-label';
      label.textContent = getLocalizedEntryLabel(entry);

      const meta = document.createElement('div');
      meta.className = 'editor-entry-meta';
      meta.textContent = t('editor.rectMeta', {
        count: entry.rects.length,
        rectSuffix: entry.rects.length > 1 ? 's' : '',
        aliases: entry.aliases.length ? t('editor.aliasMeta', { aliases: entry.aliases.join(', ') }) : ''
      });

      body.append(label, meta);

      const actions = document.createElement('div');
      actions.className = 'editor-entry-actions';

      const focusButton = document.createElement('button');
      focusButton.type = 'button';
      focusButton.className = 'editor-entry-button';
      focusButton.dataset.action = 'focus';
      focusButton.dataset.entryId = entry.id;
      focusButton.textContent = t('editor.move');

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'editor-entry-button';
      deleteButton.dataset.action = 'delete';
      deleteButton.dataset.entryId = entry.id;
      deleteButton.textContent = t('editor.delete');

      actions.append(focusButton, deleteButton);
      row.append(body, actions);
      fragment.append(row);
    });

    editorList.replaceChildren(fragment);
  }

  function renderEditorOverlay() {
    if (!isEditorSite || !state.editorLayer) {
      return;
    }

    state.editorLayer.replaceChildren();

    if (!state.editMode || isSpecialFloorActive()) {
      return;
    }

    const currentFloorId = getFloorDefinition().id;
    const fragment = document.createDocumentFragment();
    const activeRingFacilityKey = state.activeRingEditorFacilityKey;
    const floorEntries = state.manualEntries.filter((entry) => entry.floorId === currentFloorId);
    const floorRings = activeRingFacilityKey
      ? state.facilityRings.filter(
          (ring) => ring.floorId === currentFloorId && ring.facilityKey === activeRingFacilityKey
        )
      : [];

    floorEntries.forEach((entry) => {
      entry.rects.forEach((rect, rectIndex) => {
        const pinKey = createEditorPinKey(entry.id, rectIndex);
        const isActive = state.activeEditorPinKey === pinKey;
        const center = getRectCenter(rect);
        const guidePin = createEditorGuidePin(center, { isActive });

        fragment.append(guidePin);

        const pin = document.createElement('button');
        pin.type = 'button';
        pin.className = 'editor-pin-button';
        pin.dataset.entryId = entry.id;
        pin.dataset.rectIndex = String(rectIndex);
        pin.setAttribute('aria-label', t('editor.pinAria', { label: getLocalizedEntryLabel(entry) }));
        pin.style.left = `${center.xRatio * 100}%`;
        pin.style.top = `${center.yRatio * 100}%`;

        if (isActive) {
          pin.classList.add('is-active');
        }

        fragment.append(pin);

        if (isActive) {
          const popover = document.createElement('div');
          popover.className = 'editor-pin-popover';
          popover.style.left = `${center.xRatio * 100}%`;
          popover.style.top = `${center.yRatio * 100}%`;

          const label = document.createElement('div');
          label.className = 'editor-pin-popover-label';
          label.textContent = getLocalizedEntryLabel(entry);

          const meta = document.createElement('div');
          meta.className = 'editor-pin-popover-meta';
          meta.textContent = entry.aliases.length
            ? `${getEntryFloorLabel(entry)}${t('editor.aliasMeta', { aliases: entry.aliases.join(', ') })}`
            : `${getEntryFloorLabel(entry)}`;

          popover.append(label, meta);
          fragment.append(popover);
        }
      });
    });

    floorRings.forEach((ring) => {
      const isActive = state.activeEditorRingId === ring.id;
      const ringButton = createEditorRingHandle(ring, { isActive });
      fragment.append(ringButton);
    });

    if (state.pendingEditorPoint) {
      const guidePin = createEditorGuidePin(state.pendingEditorPoint, { isPending: true });
      const dot = document.createElement('div');
      dot.className = 'editor-pending-dot';
      dot.style.left = `${state.pendingEditorPoint.xRatio * 100}%`;
      dot.style.top = `${state.pendingEditorPoint.yRatio * 100}%`;

      fragment.append(guidePin, dot);
    }

    state.editorLayer.append(fragment);
  }

  function refreshEditorUi() {
    if (!isEditorSite) {
      return;
    }

    if (editorFloor) {
      editorFloor.textContent = getCurrentFloorLabel();
    }
    renderEditorRingModeButtons();
    renderEditorRingColorButtons();
    updateEditorCoords();
    updateEditorJsonOutput();
    renderEditorList();
    renderEditorRingList();
    renderEditorOverlay();
  }

  function focusSearchEntry(entry, targetZoom = SEARCH_FOCUS_ZOOM) {
    if (!entry || entry.floorId !== getFloorDefinition().id || entry.rects.length === 0) {
      return;
    }

    const focusRect = entry.rects[0];
    const nextZoom = clamp(targetZoom, state.minZoom, state.maxZoom);
    const targetX = state.baseWidth * (focusRect.xRatio + focusRect.widthRatio / 2);
    const targetY = state.baseHeight * (focusRect.yRatio + focusRect.heightRatio / 2);
    const { width: viewportWidth, height: viewportHeight } = getViewportSize();
    const top = state.safeInsetTop || 0;
    const focusCenterY = top + (viewportHeight - top - (state.safeInsetBottom || 0)) / 2;

    animateView(nextZoom, viewportWidth / 2 - targetX * nextZoom, focusCenterY - targetY * nextZoom);
  }

  function focusMapPoint(point, targetZoom = SEARCH_FOCUS_ZOOM) {
    if (!point) {
      return;
    }

    const nextZoom = clamp(targetZoom, state.minZoom, state.maxZoom);
    const targetX = state.baseWidth * point.xRatio;
    const targetY = state.baseHeight * point.yRatio;
    const { width: viewportWidth, height: viewportHeight } = getViewportSize();
    const top = state.safeInsetTop || 0;
    const focusCenterY = top + (viewportHeight - top - (state.safeInsetBottom || 0)) / 2;

    animateView(nextZoom, viewportWidth / 2 - targetX * nextZoom, focusCenterY - targetY * nextZoom);
  }

  function renderSearchSuggestions() {
    const query = searchInput.value.trim();
    const previousActiveEntryId = state.searchSuggestions[state.activeSuggestionIndex]?.id ?? null;
    searchClearButton.hidden = query.length === 0;

    if (!query) {
      searchResults.hidden = true;
      searchResults.replaceChildren();
      state.searchSuggestions = [];
      state.activeSuggestionIndex = -1;

      if (getActiveSearchEntry()) {
        const activeEntry = getActiveSearchEntry();
        setSearchFeedback(
          t('search.feedback.showing', {
            label: getLocalizedEntryLabel(activeEntry),
            floor: getEntryFloorLabel(activeEntry)
          })
        );
      } else if (state.searchLoading) {
        setSearchFeedback(t('search.feedback.loading'));
      } else if (state.searchEntries.length === 0) {
        setSearchFeedback(t('search.feedback.noData'));
      } else {
        setSearchFeedback(t('search.feedback.default'));
      }
      return;
    }

    const normalizedQuery = normalizeSearchValue(query);

    if (!normalizedQuery) {
      const hint = document.createElement('div');
      hint.className = 'search-result-empty';
      hint.textContent = t('search.feedback.inputHint');
      searchResults.replaceChildren(hint);
      searchResults.hidden = false;
      state.searchSuggestions = [];
      state.activeSuggestionIndex = -1;
      setSearchFeedback(t('search.feedback.inputRequired'));
      return;
    }

    const exactMatches = [];
    const prefixMatches = [];
    const partialMatches = [];

    state.searchEntries.forEach((entry) => {
      const searchTerms = getEntrySearchTerms(entry);

      if (searchTerms.some((term) => term === normalizedQuery)) {
        exactMatches.push(entry);
        return;
      }

      if (searchTerms.some((term) => term.startsWith(normalizedQuery))) {
        prefixMatches.push(entry);
        return;
      }

      if (searchTerms.some((term) => term.includes(normalizedQuery))) {
        partialMatches.push(entry);
      }
    });

    state.searchSuggestions = [...exactMatches, ...prefixMatches, ...partialMatches].slice(
      0,
      SEARCH_RESULT_LIMIT
    );
    const preservedIndex = state.searchSuggestions.findIndex((entry) => entry.id === previousActiveEntryId);
    state.activeSuggestionIndex = state.searchSuggestions.length === 0 ? -1 : Math.max(preservedIndex, 0);

    if (state.searchSuggestions.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'search-result-empty';
      empty.textContent =
        state.searchEntries.length === 0 ? t('search.feedback.noDataRegistered') : t('search.feedback.noMatches');
      searchResults.replaceChildren(empty);
      searchResults.hidden = false;
      setSearchFeedback(state.searchEntries.length === 0 ? t('search.feedback.noDataShort') : t('search.feedback.noMatchesShort'));
      return;
    }

    const fragment = document.createDocumentFragment();
    state.searchSuggestions.forEach((entry, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'search-result';
      if (index === state.activeSuggestionIndex) {
        button.classList.add('is-active');
      }
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(index === state.activeSuggestionIndex));
      button.dataset.entryId = entry.id;

      const label = document.createElement('span');
      label.className = 'search-result-label';
      label.textContent = getLocalizedEntryLabel(entry);

      const floor = document.createElement('span');
      floor.className = 'search-result-floor';
      floor.textContent = getEntryFloorLabel(entry);

      button.append(label, floor);
      fragment.append(button);
    });

    searchResults.replaceChildren(fragment);
    searchResults.hidden = false;
    setSearchFeedback(
      t('search.feedback.matches', {
        count: state.searchSuggestions.length,
        suffix: state.searchSuggestions.length === 1 ? '' : 'es'
      })
    );
  }

  function clearActiveSearchSelection({ clearInput = false, clearHash = true } = {}) {
    state.activeSearchEntryId = null;
    renderSearchHighlights();

    if (clearInput) {
      searchInput.value = '';
    }

    if (clearHash) {
      const normalizedHashId = normalizeHashRouteId(getDecodedLocationHash());
      const hashEntry = state.searchRouteIndex.get(normalizedHashId);

      if (hashEntry) {
        clearLocationHash();
      }
    }

    renderSearchSuggestions();
  }

  async function selectSearchEntry(entry, { updateHash = true } = {}) {
    if (!entry) {
      return;
    }

    state.activeSearchEntryId = entry.id;
    searchInput.value = getLocalizedEntryLabel(entry);
    searchResults.hidden = true;

    if (entry.floorId !== getFloorDefinition().id || isSpecialFloorActive()) {
      await setActiveFloor(entry.floorId, { resetZoom: true });
    } else {
      renderSearchHighlights();
    }

    renderSearchHighlights();
    focusSearchEntry(entry);
    setSearchFeedback(
      t('search.feedback.showing', {
        label: getLocalizedEntryLabel(entry),
        floor: getEntryFloorLabel(entry)
      })
    );

    if (updateHash) {
      replaceLocationHash(entry.hashId);
    }
  }

  async function buildSearchIndex() {
    if (state.searchLoading && state.searchPromise) {
      return state.searchPromise;
    }

    state.searchLoading = true;
    setSearchFeedback(t('search.feedback.loading'));

    state.searchPromise = (async () => {
      try {
        const bundledEditorData = await fetchBundledEditorData();
        state.baseSearchEntries = bundledEditorData.entries;
        state.baseFacilityRings = bundledEditorData.facilityRings;
      } catch (error) {
        console.warn('Failed to load bundled search index.', error);
        state.baseSearchEntries = [];
        state.baseFacilityRings = [];
      }

      const initialEditorData = resolveInitialEditorData(state.baseSearchEntries, state.baseFacilityRings);
      state.manualEntries = initialEditorData.entries;
      state.facilityRings = initialEditorData.facilityRings;
      refreshSearchEntries();
      state.searchReady = true;
      state.searchLoading = false;
      renderSearchSuggestions();
      renderSearchHighlights();
      renderFacilityRings();
      if (isEditorSite) {
        refreshEditorUi();
      }
      return state.searchEntries;
    })();

    return state.searchPromise;
  }

  function zoomAt(nextZoom, focalX, focalY) {
    cancelViewAnimation();
    const previousZoom = state.zoom;
    const clampedZoom = clamp(nextZoom, state.minZoom, state.maxZoom);

    if (clampedZoom === previousZoom) {
      return;
    }

    const ratio = clampedZoom / previousZoom;
    state.x = focalX - ratio * (focalX - state.x);
    state.y = focalY - ratio * (focalY - state.y);
    state.zoom = clampedZoom;
    updateView();
  }

  async function renderFloor({ resetZoom = false, preserveView = false } = {}) {
    const floor = getRenderedFloorDefinition();
    const floorLoadToken = ++state.floorLoadToken;
    const centerRatios = preserveView ? captureViewportCenterRatios() : null;

    setStatus(t('status.floorLoading', { floor: getFloorLabel(floor) }));

    try {
      const asset = await fetchSvgAsset(floor);

      if (floorLoadToken !== state.floorLoadToken) {
        return;
      }

      const mapAsset = document.createElement('article');
      mapAsset.className = 'map-asset';

      const enableFloorFade = !getPrefersReducedMotion();
      const svgNode = createFloorImageNode(floor);
      if (enableFloorFade) {
        svgNode.style.opacity = '0';
      }
      const highlightLayer = document.createElement('div');
      highlightLayer.className = 'highlight-layer';
      const ringLayer = document.createElement('div');
      ringLayer.className = 'ring-layer';
      let editorLayer = null;
      if (isEditorSite) {
        editorLayer = document.createElement('div');
        editorLayer.className = 'editor-layer';
      }

      mapAsset.append(svgNode, highlightLayer, ringLayer);
      if (editorLayer) {
        mapAsset.append(editorLayer);
      }
      canvasLayer.replaceChildren(mapAsset);

      state.highlightLayer = highlightLayer;
      state.ringLayer = ringLayer;
      state.editorLayer = editorLayer;
      applyMapLayout(asset, { resetZoom, preserveView: Boolean(centerRatios), centerRatios });

      if (enableFloorFade) {
        window.requestAnimationFrame(() => {
          svgNode.style.opacity = '1';
        });
      }

      renderSearchHighlights();
      renderFacilityRings();
      if (isEditorSite) {
        renderEditorOverlay();
        renderEditorList();
        renderEditorRingList();
      }
    } catch (error) {
      console.error(error);
      canvasLayer.replaceChildren();
      state.highlightLayer = null;
      state.ringLayer = null;
      state.editorLayer = null;
      setStatus(t('status.floorError'));
    }
  }

  async function setActiveFloor(floorId, { resetZoom = true } = {}) {
    const nextIndex = FLOOR_FILES.findIndex((floor) => floor.id === floorId);

    if (nextIndex < 0) {
      return;
    }

    const wasSpecialFloorActive = deactivateSpecialFloorToggle();
    const shouldResetZoom = resetZoom || wasSpecialFloorActive;
    state.floorIndex = nextIndex;
    updateTabSelection();
    await renderFloor({ resetZoom: shouldResetZoom, preserveView: !shouldResetZoom });
    if (isEditorSite) {
      refreshEditorUi();
    }
  }

  function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  function getTouchCenter(touches) {
    const rect = viewer.getBoundingClientRect();
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2 - rect.left,
      y: (touches[0].clientY + touches[1].clientY) / 2 - rect.top
    };
  }

  function getMapPointFromClient(clientX, clientY) {
    if (!state.baseWidth || !state.baseHeight) {
      return null;
    }

    const rect = viewer.getBoundingClientRect();
    const mapX = (clientX - rect.left - state.x) / state.zoom;
    const mapY = (clientY - rect.top - state.y) / state.zoom;
    const xRatio = mapX / state.baseWidth;
    const yRatio = mapY / state.baseHeight;

    if (xRatio < 0 || xRatio > 1 || yRatio < 0 || yRatio > 1) {
      return null;
    }

    return {
      xRatio: clamp(xRatio, 0, 1),
      yRatio: clamp(yRatio, 0, 1)
    };
  }

  function setEditMode(nextValue) {
    state.editMode = isEditorSite && Boolean(nextValue);
    if (editorPanel) {
      editorPanel.hidden = !state.editMode;
    }
    if (editorToggleButton) {
      editorToggleButton.classList.toggle('is-active', state.editMode);
      editorToggleButton.setAttribute('aria-pressed', String(state.editMode));
    }
    viewer.classList.toggle('is-editing', state.editMode);

    if (state.editMode) {
      setEditorFeedback(t('editor.mode.on'));
    } else {
      setEditorFeedback(t('editor.mode.off'));
      state.pendingEditorPoint = null;
      state.activeEditorPinKey = null;
      state.activeEditorRingId = null;
      state.activeRingEditorFacilityKey = null;
    }

    refreshEditorUi();
  }

  function removeManualEntry(entryId) {
    if (!isEditorSite) {
      return;
    }

    state.manualEntries = state.manualEntries.filter((entry) => entry.id !== entryId);
    if (state.activeEditorPinKey?.startsWith(`${entryId}:`)) {
      state.activeEditorPinKey = null;
    }
    if (state.activeSearchEntryId === entryId) {
      state.activeSearchEntryId = null;
      renderSearchHighlights();
    }
    persistCurrentEditorState();
    refreshSearchEntries();
    refreshEditorUi();
    renderSearchSuggestions();
  }

  async function focusManualEntry(entryId) {
    if (!isEditorSite) {
      return;
    }

    const entry = state.manualEntries.find((candidate) => candidate.id === entryId);

    if (!entry) {
      return;
    }

    await selectSearchEntry(entry);
  }

  function createFacilityRing(point, facilityKey) {
    const floor = getFloorDefinition();
    const colorVariant =
      facilityKey === 'toilet'
        ? state.activeToiletRingColorVariant
        : DEFAULT_TOILET_RING_COLOR_VARIANT;

    return hydrateFacilityRing({
      id: createFacilityRingId(facilityKey, floor.id),
      facilityKey,
      colorVariant,
      floorId: floor.id,
      xRatio: point.xRatio,
      yRatio: point.yRatio
    });
  }

  function persistCurrentEditorState() {
    persistEditorData(getActiveManualStorageKey(), {
      entries: state.manualEntries,
      facilityRings: state.facilityRings
    });
  }

  function addFacilityRing(point, facilityKey) {
    if (!isEditorSite || !facilityKey) {
      return;
    }

    const ring = createFacilityRing(point, facilityKey);

    if (!ring) {
      setEditorFeedback(t('editor.ringRecordFailed'));
      return;
    }

    state.facilityRings.push(ring);
    state.activeEditorRingId = ring.id;
    persistCurrentEditorState();
    renderFacilityRings();
    refreshEditorUi();
    setEditorFeedback(
      ring.facilityKey === 'toilet' && ring.colorLabel
        ? t('editor.ringAddedWithColor', {
            floor: getFloorLabel(ring.floorId),
            facility: getFacilityLabel(ring.facilityKey),
            color: getFacilityRingColorLabel(ring.facilityKey, ring.colorVariant)
          })
        : t('editor.ringAdded', {
            floor: getFloorLabel(ring.floorId),
            facility: getFacilityLabel(ring.facilityKey)
          })
    );
  }

  function removeFacilityRing(ringId, { silent = false } = {}) {
    if (!isEditorSite || !ringId) {
      return;
    }

    const ring = getFacilityRingById(ringId);

    if (!ring) {
      return;
    }

    state.facilityRings = state.facilityRings.filter((candidate) => candidate.id !== ringId);

    if (state.activeEditorRingId === ringId) {
      state.activeEditorRingId = null;
    }

    persistCurrentEditorState();
    renderFacilityRings();
    refreshEditorUi();

    if (!silent) {
      setEditorFeedback(
        ring.facilityKey === 'toilet' && ring.colorLabel
          ? t('editor.ringRemovedWithColor', {
              floor: getFloorLabel(ring.floorId),
              facility: getFacilityLabel(ring.facilityKey),
              color: getFacilityRingColorLabel(ring.facilityKey, ring.colorVariant)
            })
          : t('editor.ringRemoved', {
              floor: getFloorLabel(ring.floorId),
              facility: getFacilityLabel(ring.facilityKey)
            })
      );
    }
  }

  function clearFacilityRingsForActiveMode() {
    if (!isEditorSite || !state.activeRingEditorFacilityKey) {
      return;
    }

    const currentFloorId = getFloorDefinition().id;
    const currentFloorLabel = getCurrentFloorLabel();
    const facilityLabel = getFacilityLabel(state.activeRingEditorFacilityKey);
    const beforeCount = state.facilityRings.length;

    state.facilityRings = state.facilityRings.filter(
      (ring) => !(ring.floorId === currentFloorId && ring.facilityKey === state.activeRingEditorFacilityKey)
    );

    const removedCount = beforeCount - state.facilityRings.length;

    if (removedCount === 0) {
      setEditorFeedback(t('editor.noRings', { floor: currentFloorLabel, facility: facilityLabel }));
      return;
    }

    if (state.activeEditorRingId && !getFacilityRingById(state.activeEditorRingId)) {
      state.activeEditorRingId = null;
    }

    persistCurrentEditorState();
    renderFacilityRings();
    refreshEditorUi();
    setEditorFeedback(
      t('editor.ringsCleared', {
        floor: currentFloorLabel,
        facility: facilityLabel,
        count: removedCount,
        suffix: removedCount === 1 ? '' : 's'
      })
    );
  }

  function setActiveEditorRing(ringId = null) {
    const ring = ringId ? getFacilityRingById(ringId) : null;
    state.activeEditorRingId = ring?.id ?? null;

    if (ring) {
      if (ring.facilityKey === 'toilet') {
        state.activeToiletRingColorVariant = normalizeFacilityRingColorVariant(ring.facilityKey, ring.colorVariant);
      }

      setEditorFeedback(
        ring.facilityKey === 'toilet' && ring.colorLabel
          ? t('editor.ringSelectedWithColor', {
              floor: getFloorLabel(ring.floorId),
              facility: getFacilityLabel(ring.facilityKey),
              color: getFacilityRingColorLabel(ring.facilityKey, ring.colorVariant)
            })
          : t('editor.ringSelected', {
              floor: getFloorLabel(ring.floorId),
              facility: getFacilityLabel(ring.facilityKey)
            })
      );
    }

    refreshEditorUi();
  }

  async function focusFacilityRing(ringId) {
    if (!isEditorSite) {
      return;
    }

    const ring = getFacilityRingById(ringId);

    if (!ring) {
      return;
    }

    if (ring.floorId !== getFloorDefinition().id || isSpecialFloorActive()) {
      await setActiveFloor(ring.floorId, { resetZoom: false });
    }

    state.activeRingEditorFacilityKey = ring.facilityKey;
    if (ring.facilityKey === 'toilet') {
      state.activeToiletRingColorVariant = normalizeFacilityRingColorVariant(ring.facilityKey, ring.colorVariant);
    }
    state.activeEditorRingId = ring.id;
    focusMapPoint({ xRatio: ring.xRatio, yRatio: ring.yRatio });
    refreshEditorUi();
    setEditorFeedback(
      ring.facilityKey === 'toilet' && ring.colorLabel
        ? t('editor.ringMovedWithColor', {
            floor: getFloorLabel(ring.floorId),
            facility: getFacilityLabel(ring.facilityKey),
            color: getFacilityRingColorLabel(ring.facilityKey, ring.colorVariant)
          })
        : t('editor.ringMoved', {
            floor: getFloorLabel(ring.floorId),
            facility: getFacilityLabel(ring.facilityKey)
          })
    );
  }

  function saveManualEntry() {
    if (!isEditorSite || !editorLabelInput) {
      return;
    }

    const label = editorLabelInput.value.trim();

    if (!label) {
      setEditorFeedback(t('editor.labelRequired'));
      editorLabelInput.focus();
      return;
    }

    const rect = createPointRect(state.pendingEditorPoint);

    if (!rect) {
      setEditorFeedback(t('editor.pointRequired'));
      return;
    }

    const floor = getFloorDefinition();
    const entry = hydrateManualEntry({
      id: createManualEntryId(floor.id),
      floorId: floor.id,
      label,
      aliases: [],
      rects: [rect]
    });

    if (!entry) {
      setEditorFeedback(t('editor.entryCreateFailed'));
      return;
    }

    state.manualEntries.push(entry);
    persistCurrentEditorState();
    refreshSearchEntries();
    state.pendingEditorPoint = null;
    state.activeEditorPinKey = null;
    editorLabelInput.value = '';
    setEditorFeedback(t('editor.entrySaved', { label: getLocalizedEntryLabel(entry), floor: getFloorLabel(floor) }));
    refreshEditorUi();
    renderSearchSuggestions();
  }

  async function copyManualEntriesJson() {
    if (!isEditorSite) {
      return;
    }

    const payload = JSON.stringify(serializeManualEntries(state.manualEntries, state.facilityRings), null, 2);

    try {
      await navigator.clipboard.writeText(payload);
      setEditorFeedback(t('editor.copied'));
    } catch (error) {
      editorJson?.focus();
      editorJson?.select();
      setEditorFeedback(t('editor.copyFailed'));
    }
  }

  function exportManualEntriesJson() {
    if (!isEditorSite) {
      return;
    }

    const payload = JSON.stringify(serializeManualEntries(state.manualEntries, state.facilityRings), null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = MANUAL_EXPORT_FILENAME;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setEditorFeedback(t('editor.exported', { filename: MANUAL_EXPORT_FILENAME }));
  }

  async function importManualEntriesJson(file) {
    if (!isEditorSite || !file) {
      return;
    }

    try {
      const payload = await file.text();
      const parsed = JSON.parse(payload);
      const importedEntries = hydrateManualEntriesCollection(parsed);
      const importedFacilityRings = hydrateFacilityRingsCollection(parsed);

      state.manualEntries = importedEntries;
      state.facilityRings = importedFacilityRings;
      state.activeSearchEntryId = null;
      state.activeEditorPinKey = null;
      state.activeEditorRingId = null;
      state.pendingEditorPoint = null;
      persistCurrentEditorState();
      refreshSearchEntries();
      renderSearchHighlights();
      renderFacilityRings();
      refreshEditorUi();
      renderSearchSuggestions();
      setEditorFeedback(
        importedEntries.length > 0 || importedFacilityRings.length > 0
          ? t('editor.imported', {
              entries: importedEntries.length,
              rings: importedFacilityRings.length,
              entrySuffix: importedEntries.length === 1 ? 'y' : 'ies',
              ringSuffix: importedFacilityRings.length === 1 ? '' : 's'
            })
          : t('editor.importedEmpty')
      );
    } catch (error) {
      console.warn('Failed to import manual search entries.', error);
      setEditorFeedback(t('editor.importFailed'));
    }
  }

  function publishManualEntries() {
    if (!isEditorSite) {
      return;
    }

    const publishedEntries = cloneManualEntries(state.manualEntries);
    const publishedFacilityRings = cloneFacilityRings(state.facilityRings);
    persistEditorData(MANUAL_PUBLISHED_STORAGE_KEY, {
      entries: publishedEntries,
      facilityRings: publishedFacilityRings
    });
    setEditorFeedback(
      publishedEntries.length > 0 || publishedFacilityRings.length > 0
        ? t('editor.published', {
            entries: publishedEntries.length,
            rings: publishedFacilityRings.length,
            entrySuffix: publishedEntries.length === 1 ? 'y' : 'ies',
            ringSuffix: publishedFacilityRings.length === 1 ? '' : 's'
          })
        : t('editor.publishedEmpty')
    );
  }

  function captureEditorPointAtClient(clientX, clientY) {
    if (!isEditorSite || !state.editMode || state.dragMoved || state.isPinching) {
      return;
    }

    if (isSpecialFloorActive()) {
      setEditorFeedback(t('editor.specialFloorEditDisabled'));
      return;
    }

    const point = getMapPointFromClient(clientX, clientY);

    if (!point) {
      setEditorFeedback(t('editor.outsideMap'));
      return;
    }

    if (state.activeRingEditorFacilityKey) {
      addFacilityRing(point, state.activeRingEditorFacilityKey);
      return;
    }

    if (state.activeRingEditorFacilityKey) {
      addFacilityRing(point, state.activeRingEditorFacilityKey);
      return;
    }

    state.activeEditorPinKey = null;
    state.activeEditorRingId = null;
    state.pendingEditorPoint = point;
    setEditorFeedback(t('editor.pointCaptured'));
    refreshEditorUi();
  }

  function startDrag(clientX, clientY) {
    cancelViewAnimation();
    state.isDragging = true;
    state.dragMoved = false;
    state.dragStartX = clientX;
    state.dragStartY = clientY;
    state.startX = state.x;
    state.startY = state.y;
  }

  function endDrag() {
    state.isDragging = false;
  }

  function beginPinch(touches) {
    cancelViewAnimation();
    const center = getTouchCenter(touches);
    state.isPinching = true;
    state.pinchStartDistance = getTouchDistance(touches);
    state.pinchStartZoom = state.zoom;
    state.pinchStartX = state.x;
    state.pinchStartY = state.y;
    state.pinchStartCenterX = center.x;
    state.pinchStartCenterY = center.y;
  }

  function isSiteMenuOpen() {
    return Boolean(siteMenuPanel && !siteMenuPanel.hidden);
  }

  function setSiteMenuOpen(isOpen, { focusToggle = false } = {}) {
    if (!siteMenuToggle || !siteMenuPanel) {
      return;
    }

    siteMenuPanel.hidden = !isOpen;
    siteMenuToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    siteMenuToggle.setAttribute('aria-label', t(isOpen ? 'menu.close' : 'menu.open'));
    siteMenuToggle.setAttribute('title', t(isOpen ? 'menu.close' : 'menu.open'));

    if (!isOpen && focusToggle) {
      siteMenuToggle.focus();
    }
  }

  function setAboutDialogOpen(isOpen, { restoreFocus = false } = {}) {
    if (!aboutDialog) {
      return;
    }

    aboutDialog.hidden = !isOpen;

    if (isOpen) {
      setSiteMenuOpen(false);
      window.requestAnimationFrame(() => {
        aboutDialogCloseButton?.focus();
      });
      return;
    }

    if (restoreFocus) {
      siteMenuToggle?.focus();
    }
  }

  function setContactFormDialogOpen(isOpen, { restoreFocus = false } = {}) {
    if (!contactFormDialog) {
      return;
    }

    contactFormDialog.hidden = !isOpen;

    if (isOpen) {
      setSiteMenuOpen(false);

      if (contactFormEmbedUrl && contactFormFrame) {
        if (contactFormFrame.getAttribute('src') !== contactFormEmbedUrl) {
          contactFormFrame.setAttribute('src', contactFormEmbedUrl);
        }
        contactFormFrame.hidden = false;
      }

      if (contactFormFallback) {
        contactFormFallback.hidden = Boolean(contactFormEmbedUrl);
      }

      window.requestAnimationFrame(() => {
        contactFormDialogCloseButton?.focus();
      });
      return;
    }

    if (restoreFocus) {
      siteMenuToggle?.focus();
    }
  }

  async function handleLocationHashRoute() {
    const hashId = normalizeHashRouteId(getDecodedLocationHash());

    if (!hashId) {
      return false;
    }

    if (hashId === 'about') {
      setAboutDialogOpen(true);
      clearLocationHash();
      return true;
    }

    if (hashId === 'contact') {
      setContactFormDialogOpen(true);
      clearLocationHash();
      return true;
    }

    await buildSearchIndex();

    const entry = state.searchRouteIndex.get(hashId);
    if (!entry) {
      return false;
    }

    setAboutDialogOpen(false);
    setContactFormDialogOpen(false);
    await selectSearchEntry(entry, { updateHash: false });
    return true;
  }

  async function initializeMap() {
    await Promise.all([buildSearchIndex(), renderFloor({ resetZoom: true })]);
    await handleLocationHashRoute();
  }

  function refreshLanguageDependentUi() {
    roomCodeCollator = new Intl.Collator(getLocale(), { numeric: true, sensitivity: 'base' });
    applyI18n();
    updateTabSelection();
    setSiteMenuOpen(isSiteMenuOpen());
    refreshSearchEntries();

    const activeEntry = getActiveSearchEntry();
    if (activeEntry && searchInput.value.trim()) {
      searchInput.value = getLocalizedEntryLabel(activeEntry);
    }

    renderSearchSuggestions();
    renderSearchHighlights();
    renderFacilityRings();

    if (isEditorSite) {
      refreshEditorUi();
    }

    if (state.baseWidth > 0 && state.baseHeight > 0) {
      void renderFloor({ resetZoom: false, preserveView: true });
    }
  }

  onLanguageChange(refreshLanguageDependentUi);

  if (isEditorSite) {
    setEditMode(true);
    refreshEditorUi();
  }

  registerViewerServiceWorker();
  renderFacilityToggleButtons();

  if (siteMenuToggle && siteMenuPanel) {
    setSiteMenuOpen(false);
    siteMenuToggle.addEventListener('click', () => {
      setSiteMenuOpen(!isSiteMenuOpen());
    });
  }

  if (aboutMenuButton) {
    aboutMenuButton.addEventListener('click', () => {
      setAboutDialogOpen(true);
    });
  }

  if (contactFormMenuButton) {
    contactFormMenuButton.addEventListener('click', () => {
      setContactFormDialogOpen(true);
    });
  }

  if (aboutDialogCloseButton) {
    aboutDialogCloseButton.addEventListener('click', () => {
      setAboutDialogOpen(false, { restoreFocus: true });
    });
  }

  if (contactFormDialogCloseButton) {
    contactFormDialogCloseButton.addEventListener('click', () => {
      setContactFormDialogOpen(false, { restoreFocus: true });
    });
  }

  if (aboutDialog) {
    aboutDialog.addEventListener('click', (event) => {
      if (event.target === aboutDialog) {
        setAboutDialogOpen(false, { restoreFocus: true });
      }
    });
  }

  if (contactFormDialog) {
    contactFormDialog.addEventListener('click', (event) => {
      if (event.target === contactFormDialog) {
        setContactFormDialogOpen(false, { restoreFocus: true });
      }
    });
  }

  window.addEventListener('hashchange', () => {
    void handleLocationHashRoute();
  });

  if (mobileFloorToggle) {
    mobileFloorToggle.addEventListener('click', () => {
      setMobileFloorListOpen(!isMobileFloorListOpen());
    });
  }

  mobileFloorOptions.forEach((button) => {
    button.addEventListener('click', () => {
      const floorId = button.dataset.floor;

      setMobileFloorListOpen(false);

      if (!floorId || floorId === getFloorDefinition().id) {
        return;
      }

      void setActiveFloor(floorId, { resetZoom: true });
    });
  });

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      void setActiveFloor(button.dataset.floor, { resetZoom: true });
    });
  });

  searchIconButtons.forEach((button) => {
    button.addEventListener('click', () => {
      toggleFacilityToggleState(button.dataset.facilityKey?.trim());
    });
  });

  searchClearButton.addEventListener('click', () => {
    clearActiveSearchSelection({ clearInput: true });
    searchInput.focus();
  });

  searchInput.addEventListener('focus', () => {
    renderSearchSuggestions();
  });

  searchInput.addEventListener('input', () => {
    const activeEntry = getActiveSearchEntry();
    const normalizedValue = normalizeSearchValue(searchInput.value);

    if (activeEntry && !getEntrySearchTerms(activeEntry).includes(normalizedValue)) {
      state.activeSearchEntryId = null;
      renderSearchHighlights();

      if (state.searchRouteIndex.get(normalizeHashRouteId(getDecodedLocationHash())) === activeEntry) {
        clearLocationHash();
      }
    }

    renderSearchSuggestions();
  });

  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (state.searchSuggestions.length === 0) {
        return;
      }

      state.activeSuggestionIndex = (state.activeSuggestionIndex + 1) % state.searchSuggestions.length;
      renderSearchSuggestions();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (state.searchSuggestions.length === 0) {
        return;
      }

      state.activeSuggestionIndex =
        (state.activeSuggestionIndex - 1 + state.searchSuggestions.length) % state.searchSuggestions.length;
      renderSearchSuggestions();
      return;
    }

    if (event.key === 'Escape') {
      searchResults.hidden = true;
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const selectedSuggestion =
        state.searchSuggestions[state.activeSuggestionIndex] ??
        state.searchEntries.find((entry) => getEntrySearchTerms(entry).includes(normalizeSearchValue(searchInput.value)));

      if (selectedSuggestion) {
        void selectSearchEntry(selectedSuggestion);
      }
    }
  });

  searchResults.addEventListener('click', (event) => {
    const button = event.target.closest('.search-result');

    if (!button) {
      return;
    }

    const entry = state.searchEntries.find((candidate) => candidate.id === button.dataset.entryId);

    if (entry) {
      void selectSearchEntry(entry);
    }
  });

  if (editorSaveButton) {
    editorSaveButton.addEventListener('click', () => {
      saveManualEntry();
    });
  }

  if (editorClearPointButton) {
    editorClearPointButton.addEventListener('click', () => {
      state.pendingEditorPoint = null;
      setEditorFeedback(t('editor.pointCleared'));
      refreshEditorUi();
    });
  }

  if (editorCopyButton) {
    editorCopyButton.addEventListener('click', () => {
      void copyManualEntriesJson();
    });
  }

  if (editorExportButton) {
    editorExportButton.addEventListener('click', () => {
      exportManualEntriesJson();
    });
  }

  if (editorImportButton && editorImportInput) {
    editorImportButton.addEventListener('click', () => {
      editorImportInput.click();
    });

    editorImportInput.addEventListener('change', async (event) => {
      const [file] = Array.from(event.target.files ?? []);
      await importManualEntriesJson(file);
      event.target.value = '';
    });
  }

  if (editorPublishButton) {
    editorPublishButton.addEventListener('click', () => {
      publishManualEntries();
    });
  }

  if (editorRingClearButton) {
    editorRingClearButton.addEventListener('click', () => {
      clearFacilityRingsForActiveMode();
    });
  }

  editorRingModeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setActiveRingEditorFacilityKey(button.dataset.facilityKey?.trim());
    });
  });

  editorRingColorButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setActiveToiletRingColorVariant(button.dataset.ringColorVariant?.trim());
    });
  });

  if (editorList) {
    editorList.addEventListener('click', (event) => {
      const button = event.target.closest('.editor-entry-button');

      if (!button) {
        return;
      }

      const { action, entryId } = button.dataset;

      if (action === 'delete' && entryId) {
        removeManualEntry(entryId);
        return;
      }

      if (action === 'focus' && entryId) {
        void focusManualEntry(entryId);
      }
    });
  }

  if (editorRingList) {
    editorRingList.addEventListener('click', (event) => {
      const button = event.target.closest('.editor-entry-button');

      if (!button) {
        return;
      }

      const { action, ringId } = button.dataset;

      if (action === 'delete-ring' && ringId) {
        removeFacilityRing(ringId);
        return;
      }

      if (action === 'focus-ring' && ringId) {
        void focusFacilityRing(ringId);
      }
    });
  }

  document.addEventListener('pointerdown', (event) => {
    if (siteMenu && isSiteMenuOpen() && !siteMenu.contains(event.target)) {
      setSiteMenuOpen(false);
    }

    if (mobileFloorSelect && isMobileFloorListOpen() && !mobileFloorSelect.contains(event.target)) {
      setMobileFloorListOpen(false);
    }

    if (searchPanel.contains(event.target)) {
      return;
    }

    searchResults.hidden = true;

    if (isEditorSite && !event.target.closest('.editor-pin-button, .editor-ring-button')) {
      state.activeEditorPinKey = null;
      state.activeEditorRingId = null;
      refreshEditorUi();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') {
      return;
    }

    if (aboutDialog && !aboutDialog.hidden) {
      event.preventDefault();
      setAboutDialogOpen(false, { restoreFocus: true });
      return;
    }

    if (contactFormDialog && !contactFormDialog.hidden) {
      event.preventDefault();
      setContactFormDialogOpen(false, { restoreFocus: true });
      return;
    }

    if (isMobileFloorListOpen()) {
      event.preventDefault();
      setMobileFloorListOpen(false, { focusToggle: true });
      return;
    }

    if (isSiteMenuOpen()) {
      event.preventDefault();
      setSiteMenuOpen(false, { focusToggle: true });
    }
  });

  document.addEventListener(
    'touchend',
    (event) => {
      if (event.touches.length !== 0 || event.changedTouches.length !== 1 || shouldAllowNativeDoubleTap(event.target)) {
        return;
      }

      const now = performance.now();

      // iOS Safari can still smart-zoom on a rapid double tap even when the viewport is fixed.
      if (now - state.lastTouchEndAt < DOUBLE_TAP_SUPPRESSION_WINDOW_MS) {
        event.preventDefault();
      }

      state.lastTouchEndAt = now;
    },
    { passive: false }
  );

  viewer.addEventListener('click', (event) => {
    const ringButton = event.target.closest('.editor-ring-button');

    if (ringButton) {
      event.preventDefault();
      event.stopPropagation();
      const ringId = ringButton.dataset.ringId;
      const facilityKey = ringButton.dataset.facilityKey?.trim();

      if (!ringId) {
        return;
      }

      if (state.activeRingEditorFacilityKey && facilityKey === state.activeRingEditorFacilityKey) {
        removeFacilityRing(ringId);
        return;
      }

      setActiveEditorRing(ringId);
      return;
    }

    const pinButton = event.target.closest('.editor-pin-button');

    if (!pinButton) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const { entryId, rectIndex } = pinButton.dataset;

    if (!entryId) {
      return;
    }

    const pinKey = createEditorPinKey(entryId, Number(rectIndex || 0));
    state.activeEditorPinKey = state.activeEditorPinKey === pinKey ? null : pinKey;
    const entry = getManualEntryById(entryId);

    if (entry && state.activeEditorPinKey) {
      const aliasText = entry.aliases.length ? t('editor.aliasMeta', { aliases: entry.aliases.join(', ') }) : '';
      setEditorFeedback(`${getLocalizedEntryLabel(entry)}${aliasText}`);
    }

    renderEditorOverlay();
    updateEditorCoords();
  });

  viewer.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const rect = viewer.getBoundingClientRect();
      const focalX = event.clientX - rect.left;
      const focalY = event.clientY - rect.top;
      const direction = event.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomAt(state.zoom * direction, focalX, focalY);
    },
    { passive: false }
  );

  viewer.addEventListener('mousedown', (event) => {
    if (event.target.closest('.editor-pin-button, .editor-ring-button')) {
      return;
    }

    event.preventDefault();
    startDrag(event.clientX, event.clientY);
  });

  viewer.addEventListener('mouseup', (event) => {
    if (event.target.closest('.editor-pin-button, .editor-ring-button')) {
      return;
    }

    captureEditorPointAtClient(event.clientX, event.clientY);
    endDrag();
  });

  window.addEventListener('mousemove', (event) => {
    if (!state.isDragging) {
      return;
    }

    if (
      Math.abs(event.clientX - state.dragStartX) > 4 ||
      Math.abs(event.clientY - state.dragStartY) > 4
    ) {
      state.dragMoved = true;
    }

    state.x = state.startX + (event.clientX - state.dragStartX);
    state.y = state.startY + (event.clientY - state.dragStartY);
    updateView();
  });

  window.addEventListener('mouseup', () => {
    endDrag();
  });

  viewer.addEventListener(
    'touchstart',
    (event) => {
      if (event.target.closest('.editor-pin-button, .editor-ring-button')) {
        return;
      }

      event.preventDefault();

      if (event.touches.length === 1 && !state.isPinching) {
        const touch = event.touches[0];
        startDrag(touch.clientX, touch.clientY);
      }

      if (event.touches.length === 2) {
        endDrag();
        beginPinch(event.touches);
      }
    },
    { passive: false }
  );

  viewer.addEventListener(
    'touchmove',
    (event) => {
      event.preventDefault();

      if (event.touches.length === 1 && state.isDragging && !state.isPinching) {
        const touch = event.touches[0];
        if (
          Math.abs(touch.clientX - state.dragStartX) > 4 ||
          Math.abs(touch.clientY - state.dragStartY) > 4
        ) {
          state.dragMoved = true;
        }
        state.x = state.startX + (touch.clientX - state.dragStartX);
        state.y = state.startY + (touch.clientY - state.dragStartY);
        updateView();
        return;
      }

      if (event.touches.length === 2) {
        if (!state.isPinching) {
          beginPinch(event.touches);
        }

        const center = getTouchCenter(event.touches);
        const distance = getTouchDistance(event.touches);
        const nextZoom = clamp(
          state.pinchStartZoom * (distance / Math.max(state.pinchStartDistance, 1)),
          state.minZoom,
          state.maxZoom
        );
        const ratio = nextZoom / state.pinchStartZoom;

        state.zoom = nextZoom;
        state.x = center.x - ratio * (state.pinchStartCenterX - state.pinchStartX);
        state.y = center.y - ratio * (state.pinchStartCenterY - state.pinchStartY);
        updateView();
      }
    },
    { passive: false }
  );

  viewer.addEventListener(
    'touchend',
    (event) => {
      if (event.target.closest('.editor-pin-button, .editor-ring-button')) {
        return;
      }

      event.preventDefault();

      if (!state.isPinching && !state.dragMoved && event.changedTouches.length === 1 && event.touches.length === 0) {
        const touch = event.changedTouches[0];
        captureEditorPointAtClient(touch.clientX, touch.clientY);
      }

      if (event.touches.length < 2) {
        state.isPinching = false;
      }

      if (event.touches.length === 1) {
        const touch = event.touches[0];
        startDrag(touch.clientX, touch.clientY);
        return;
      }

      if (event.touches.length === 0) {
        endDrag();
        updateView();
      }
    },
    { passive: false }
  );

  viewer.addEventListener('touchcancel', () => {
    state.isPinching = false;
    endDrag();
    updateView();
  });

  window.addEventListener('resize', () => {
    scheduleMapRelayout();
  });

  if ('ResizeObserver' in window && topbar) {
    const topbarResizeObserver = new ResizeObserver(() => {
      scheduleMapRelayout();
    });
    topbarResizeObserver.observe(topbar);
  }

  window.visualViewport?.addEventListener('resize', () => {
    scheduleMapRelayout();
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== getActiveManualStorageKey()) {
      return;
    }

    const currentEditorData = resolveCurrentEditorData(state.baseSearchEntries, state.baseFacilityRings);
    state.manualEntries = currentEditorData.entries;
    state.facilityRings = currentEditorData.facilityRings;

    if (state.activeSearchEntryId && !getManualEntryById(state.activeSearchEntryId)) {
      state.activeSearchEntryId = null;
      renderSearchHighlights();
    }

    if (state.activeEditorPinKey) {
      const [entryId] = state.activeEditorPinKey.split(':');
      if (!getManualEntryById(entryId)) {
        state.activeEditorPinKey = null;
      }
    }

    if (state.activeEditorRingId && !getFacilityRingById(state.activeEditorRingId)) {
      state.activeEditorRingId = null;
    }

    refreshSearchEntries();
    renderSearchSuggestions();
    renderFacilityRings();
    if (isEditorSite) {
      refreshEditorUi();
    }
  });

  setMobileFloorListOpen(false);
  updateTabSelection();
  updateMapStageHeight();
  void initializeMap();
}
