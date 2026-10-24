import { onLanguageChange, t } from './i18n.js';

// No worker download until the initial map/search has finished and the visitor
// has left the page idle for three seconds.
const QUIET_MS = 3000;

export function initOfflineMap({ isMapReady }) {
  const status = document.getElementById('offline-map-status');
  if (!status) return;
  let currentState = 'pending';
  function renderStatus() {
    status.hidden = false;
    status.dataset.offlineState = currentState;
    status.textContent = t(`offline.${currentState}`);
  }
  function setState(value) { currentState = value; renderStatus(); }
  onLanguageChange(renderStatus);
  renderStatus();

  const workerUrl = new URL('/sw.js', window.location.origin).href;
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.source?.scriptURL === workerUrl && event.data?.type === 'OFFLINE_MAP_STATUS') {
      if (['saving', 'ready', 'error'].includes(event.data.state)) setState(event.data.state);
    }
  });
  void navigator.serviceWorker.getRegistration('/').then(registration => {
    const worker = registration?.waiting || registration?.active;
    if (!worker) return;
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => channel.port1.close(), 1500);
    channel.port1.onmessage = event => {
      window.clearTimeout(timeout);
      channel.port1.close();
      if (event.data?.type === 'OFFLINE_MAP_STATUS' && event.data.state === 'ready') setState('ready');
    };
    worker.postMessage({ type: 'GET_OFFLINE_MAP_STATUS' }, [channel.port2]);
  }).catch(() => {});

  let timer;
  let idle;
  let registering = false;
  let lastInputAt = performance.now();
  const activePointers = new Set();
  function schedule() {
    window.clearTimeout(timer);
    if (idle !== undefined) window.cancelIdleCallback?.(idle);
    if (document.visibilityState !== 'visible' || !navigator.onLine || registering) return;
    timer = window.setTimeout(() => {
      const run = () => {
        if (!isMapReady() || activePointers.size || performance.now() - lastInputAt < QUIET_MS || document.visibilityState !== 'visible' || !navigator.onLine) {
          schedule();
          return;
        }
        void register();
      };
      if ('requestIdleCallback' in window) idle = window.requestIdleCallback(run);
      else run();
    }, QUIET_MS);
  }
  function onInput(event) {
    if (event?.type === 'pointerdown') activePointers.add(event.pointerId);
    if (event?.type === 'pointerup' || event?.type === 'pointercancel') activePointers.delete(event.pointerId);
    lastInputAt = performance.now();
    schedule();
  }
  async function register() {
    registering = true;
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
      const watchWorker = () => {
        const worker = registration.installing;
        if (!worker) return;
        setState('saving');
        worker.addEventListener('statechange', () => {
          if (['installed', 'activated'].includes(worker.state)) setState('ready');
          if (worker.state === 'redundant') { setState('error'); registering = false; }
        });
      };
      registration.addEventListener('updatefound', watchWorker);
      watchWorker();
    } catch {
      if (currentState !== 'ready') setState('error');
      registering = false;
    }
  }
  for (const name of ['pointerdown', 'pointerup', 'pointercancel', 'wheel', 'keydown']) window.addEventListener(name, onInput, { passive: true });
  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('online', schedule);
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
}
