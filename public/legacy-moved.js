(() => {
  const source = new URL(window.location.href);
  const english = source.pathname === '/en' || source.pathname.startsWith('/en/');
  const target = new URL('https://rits-oic-map.app/');
  // Assign components separately: user input can never replace the fixed origin.
  target.pathname = source.pathname === '/legacy-moved.html' ? '/' : source.pathname;
  target.search = source.search;
  target.hash = source.hash;
  target.searchParams.set('oicmap_migrated', '1');

  const link = document.getElementById('migration-link');
  link.href = target.href;
  if (english) {
    document.documentElement.lang = 'en';
    document.title = 'The site URL has changed | Ritsumeikan OIC Map';
    document.getElementById('migration-title').textContent = 'The site URL has changed';
    document.getElementById('migration-copy').textContent = 'Please update your bookmark.';
    link.textContent = 'Open the new OIC Map';
  }

  let clickRecorded = false;
  link.addEventListener('click', () => {
    if (clickRecorded) return;
    clickRecorded = true;
    try { window.oicMapAnalytics?.track('domain_migration_link_click', { transport_type: 'beacon' }); } catch {}
    // Keep native same-tab navigation even if tracking is blocked or unavailable.
  });
})();
