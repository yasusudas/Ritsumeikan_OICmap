/* Run synchronously before loading gtag: history cleanup must precede GA4. */
(() => {
  if (window.oicMapAnalytics) return;

  const measurementId = 'G-NDHG4VRB1F';
  const marker = 'oicmap_migrated';
  const url = new URL(window.location.href);
  const isNewSite = url.hostname === 'rits-oic-map.app';
  const markedArrival = isNewSite && url.searchParams.get(marker) === '1';

  // Snapshot first. Remove only our marker, retaining campaign/linker data and hash.
  // GA4's history listener is not installed yet, so this is not a second page view.
  if (isNewSite && url.searchParams.has(marker)) {
    url.searchParams.delete(marker);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  const track = (name, parameters = {}) => {
    try { window.gtag('event', name, parameters); } catch { /* Navigation never depends on analytics. */ }
  };
  window.oicMapAnalytics = Object.freeze({ track });

  window.gtag('js', new Date());
  window.gtag('config', measurementId);
  if (document.documentElement.hasAttribute('data-legacy-notice')) {
    track('domain_migration_notice_view');
  }
  if (markedArrival) {
    // A marked URL can be shared/revisited; this event does not prove a link click.
    track('domain_migration_marked_arrival', { migration_marker: '1' });
  }

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);
})();
