import './styles/geolocation.css';
import { getLang, onLanguageChange } from './i18n.js';
import { GEOREFERENCE, projectCampusPosition, accuracyCircleRadius } from './geolocation-model.js';
import { createLocationEstimator } from './geolocation-estimator.js';
import { createLocationMotion } from './geolocation-motion.js';

const POSITION_OPTIONS = { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 };
const RECOVERY_DELAY = 10_000;

const copy = {
  ja: {
    locating: '現在地を取得中', position: '現在地 · 測位誤差 約{accuracy}m',
    outside: '現在地は表示範囲外', outsideBuilding: '現在地はこの棟の範囲外',
    uncertainBuilding: '測位誤差が棟の境界をまたいでいます', imprecise: '位置情報の精度改善を待っています',
    denied: '位置情報が許可されていません', unavailable: '現在地を取得できません', timeout: '位置情報の更新を待っています',
    unsupported: 'この案内図は現在地表示に対応していません', paused: '現在地の取得を休止中', stopped: '現在地をオンにする',
  },
  en: {
    locating: 'Finding your location', position: 'My location · accuracy about {accuracy}m',
    outside: 'Location is outside this map', outsideBuilding: 'Location is outside this building',
    uncertainBuilding: 'Location accuracy extends outside this building', imprecise: 'Waiting for better location accuracy',
    denied: 'Location permission is denied', unavailable: 'Location is unavailable', timeout: 'Waiting for a location update',
    unsupported: 'Location is unavailable on this guide', paused: 'Location updates paused', stopped: 'Turn on my location',
  },
};

export function createGeolocationViewer({ button, canvasLayer, markerLayer = canvasLayer, getMapFrame, center }) {
  let enabled = false, watchId = null, latest = null, message = 'locating', firstFix = true, frame = 0, generation = 0, requesting = false;
  let recoveryTimer = null, recoveryRequest = null, permissionConfirmed = false;
  function label(key, accuracy) { return copy[getLang() === 'en' ? 'en' : 'ja'][key]?.replace('{accuracy}', Math.ceil(accuracy || 0)); }
  const motion = createLocationMotion();
  const estimator = createLocationEstimator();
  let layer = null, markers = [];
  function clearMarker() {
    layer?.remove(); layer = null; markers = [];
  }
  function project(coords, floorId) {
    return projectCampusPosition(coords, getLang(), floorId);
  }
  function draw() {
    frame = 0;
    const now = performance.now(), map = getMapFrame();
    const measured = enabled && latest ? project(latest.coords, map.floorId) : null;
    // Validate the newest fix immediately, even while its visual position is moving.
    const result = measured?.kind === 'position' ? project(motion.sample(now) ?? latest.coords, map.floorId) : measured;
    const displayMessage = measured && (message === 'position' || !['denied', 'unavailable', 'timeout', 'paused', 'locating'].includes(message))
      ? (measured.kind === 'invalid' ? 'unavailable' : measured.kind) : message;
    if (result?.kind === 'position' && map.element) {
      if (firstFix) { firstFix = false; center(measured); }
      const bounds = map.element.getBoundingClientRect();
      const width = Math.max(1, bounds.width), height = Math.max(1, bounds.height);
      const scaleX = width / GEOREFERENCE.width, scaleY = height / GEOREFERENCE.height;
      const ns = 'http://www.w3.org/2000/svg';
      // Reuse the same SVG and circles throughout the motion to avoid flicker.
      if (!layer?.isConnected || layer.parentElement !== markerLayer || markers.length !== result.points.length) {
        clearMarker();
        layer = document.createElementNS(ns, 'svg');
        layer.classList.add('gps-location-layer');
        layer.setAttribute('preserveAspectRatio', 'xMidYMid meet'); layer.setAttribute('aria-hidden', 'true');
        markers = result.points.map(() => {
          const accuracy = document.createElementNS(ns, 'circle');
          accuracy.classList.add('gps-location-accuracy');
          accuracy.setAttribute('vector-effect', 'non-scaling-stroke');
          const dot = document.createElementNS(ns, 'circle');
          dot.classList.add('gps-location-dot');
          dot.setAttribute('vector-effect', 'non-scaling-stroke');
          layer.append(accuracy, dot);
          return { accuracy, dot };
        });
        markerLayer.append(layer);
      }
      layer.setAttribute('viewBox', `0 0 ${width} ${height}`);
      layer.dataset.floor = map.floorId;
      layer.dataset.timestamp = String(latest.timestamp);
      result.points.forEach((point, index) => {
        const { accuracy, dot } = markers[index];
        const raw = measured.points[index];
        // Centering the circle on a filtered/animated dot must still enclose
        // the newest raw fix's full reported uncertainty, including visual lag.
        const lag = Math.hypot((raw.x - point.x) * scaleX, (raw.y - point.y) * scaleY);
        const radius = Math.max(accuracyCircleRadius(point.matrix, result.accuracy, scaleX, scaleY),
          accuracyCircleRadius(raw.matrix, measured.accuracy, scaleX, scaleY) + lag);
        accuracy.setAttribute('r', radius);
        for (const circle of [accuracy, dot]) {
          circle.setAttribute('cx', point.x * scaleX);
          circle.setAttribute('cy', point.y * scaleY);
        }
        const markerScale = Math.sqrt(scaleX * scaleY);
        const markerRadius = Math.min(10, Math.max(6, 3 * markerScale));
        dot.setAttribute('r', markerRadius);
        dot.style.strokeWidth = String(markerRadius * (5 / 12));
      });
    } else clearMarker();
    if (motion.active(now) && document.visibilityState === 'visible' && measured?.kind === 'position') scheduleDraw();
    button.dataset.gpsState = displayMessage;
    button.title = label(displayMessage, latest?.coords.accuracy);
    button.setAttribute('aria-label', button.title);
    button.dataset.gpsAvailable = String(message === 'position');
  }
  function scheduleDraw() { if (!frame) frame = requestAnimationFrame(draw); }
  new MutationObserver(scheduleDraw).observe(canvasLayer, { childList: true, attributes: true, attributeFilter: ['style'] });
  // A resize can update the layer after a queued marker draw has measured the
  // old layout. Observe the committed size as well as the style mutation.
  if ('ResizeObserver' in window) new ResizeObserver(scheduleDraw).observe(canvasLayer);
  window.addEventListener('resize', scheduleDraw);
  onLanguageChange(scheduleDraw);
  function clearRecoveryTimer() { clearTimeout(recoveryTimer); recoveryTimer = null; }
  function canRecover() {
    return enabled && permissionConfirmed && watchId !== null && document.visibilityState === 'visible' && message !== 'denied';
  }
  function scheduleRecovery() {
    if (!canRecover() || recoveryTimer !== null || recoveryRequest) return;
    recoveryTimer = setTimeout(() => {
      recoveryTimer = null;
      if (!canRecover() || recoveryRequest) return;
      // Keep the continuous watch alive. Only one supplementary request may
      // be pending, including across hide/resume or stop/restart transitions.
      const request = { generation, previous: latest };
      recoveryRequest = request;
      function finish(position, error) {
        if (recoveryRequest !== request) return;
        recoveryRequest = null;
        if (enabled && request.generation === generation) {
          if (position) acceptPosition(position);
          else if (error.code === 1 || latest === request.previous) acceptError(error);
        }
        // An outage retries at most once per completion + 10 seconds. Never
        // create a second request while the browser is still acquiring a fix.
        scheduleRecovery();
      }
      try { navigator.geolocation.getCurrentPosition(position => finish(position), error => finish(null, error), POSITION_OPTIONS); }
      catch { finish(null, { code: 2 }); }
    }, RECOVERY_DELAY);
  }
  function stopWatching() {
    generation++; requesting = false; clearRecoveryTimer();
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  function acceptPosition(position) {
    permissionConfirmed = true;
    // A delayed one-shot result must not rewind a newer watch update.
    if (!Number.isFinite(position.timestamp) || latest && position.timestamp <= latest.timestamp) return;
    const estimate = estimator.update(position);
    if (estimate.coords) motion.update(estimate.coords, performance.now(), Boolean(layer?.isConnected) && document.visibilityState === 'visible');
    latest = position; message = 'position'; scheduleDraw();
    clearRecoveryTimer(); scheduleRecovery();
  }
  function acceptError(error) {
    // Keep the last received point through outages and permission changes.
    message = error.code === 1 ? 'denied' : error.code === 3 ? 'timeout' : 'unavailable';
    if (error.code === 1) { permissionConfirmed = false; stopWatching(); }
    scheduleDraw();
  }
  function startWatching() {
    if (!enabled || watchId !== null || requesting || document.visibilityState !== 'visible') return;
    const token = ++generation;
    if (message !== 'position') message = 'locating';
    scheduleDraw();
    requesting = true;
    try {
      watchId = navigator.geolocation.watchPosition(position => {
        if (!enabled || token !== generation) return;
        requesting = false;
        acceptPosition(position);
      }, error => {
        if (token !== generation) return;
        requesting = false;
        acceptError(error);
      }, POSITION_OPTIONS);
      scheduleRecovery();
    } catch { stopWatching(); acceptError({ code: 2 }); }
  }
  document.addEventListener('visibilitychange', () => {
    if (!enabled) return;
    // An iOS permission prompt can itself change visibility. Do not cancel
    // the pending first permission request when its sheet is presented.
    if ((requesting && !permissionConfirmed) || message === 'denied') return;
    if (document.visibilityState === 'hidden') { motion.finish(); stopWatching(); message = 'paused'; scheduleDraw(); }
    else startWatching();
  });
  window.addEventListener('pagehide', () => { if (!requesting || permissionConfirmed) stopWatching(); });
  window.addEventListener('pageshow', () => { if (enabled && message !== 'denied') startWatching(); });
  return {
    locate(initialRequest, { centerOnFirstFix = true } = {}) {
      if (enabled) {
        firstFix = true;
        scheduleDraw();
        // Center on the retained fix, and retry failed permission/acquisition
        // directly from this user gesture without turning tracking off.
        if (message !== 'position' && !requesting) {
          stopWatching();
          startWatching();
        }
        return;
      }
      if (!window.isSecureContext || !navigator.geolocation) { message = 'unavailable'; scheduleDraw(); return; }
      enabled = true; firstFix = centerOnFirstFix;
      if (initialRequest) {
        requesting = true;
        const token = ++generation;
        message = 'locating'; scheduleDraw();
        initialRequest.then(({ position, error }) => {
          if (!enabled || token !== generation) return;
          requesting = false;
          if (position) acceptPosition(position); else acceptError(error);
          if (message !== 'denied') startWatching();
        });
        return;
      }
      startWatching();
    },
  };
}
