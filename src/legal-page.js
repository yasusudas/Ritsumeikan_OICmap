import './style.css';

const LANGUAGE_STORAGE_KEY = 'oicmap:lang';

function getLegalPageSlug() {
  const path = window.location.pathname.replace(/\/+$/, '/');

  if (path === '/privacy/' || path === '/en/privacy/') {
    return 'privacy';
  }

  return 'terms';
}

function getLegalPageLanguage() {
  return window.location.pathname === '/en' || window.location.pathname.startsWith('/en/')
    ? 'en'
    : 'ja';
}

function getLegalPagePath(lang) {
  const slug = getLegalPageSlug();
  return lang === 'en' ? `/en/${slug}/` : `/${slug}/`;
}

function storeLanguage(lang) {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // The navigation still works if storage is unavailable.
  }
}

function navigateToLanguage(lang) {
  const nextLang = lang === 'en' ? 'en' : 'ja';
  storeLanguage(nextLang);
  window.location.href = getLegalPagePath(nextLang);
}

function setupLegalLanguageToggles() {
  const currentLang = getLegalPageLanguage();

  document.querySelectorAll('[data-legal-lang-toggle]').forEach((button) => {
    button.querySelectorAll('[data-legal-lang-option]').forEach((option) => {
      const isActive = option.dataset.legalLangOption === currentLang;
      option.classList.toggle('is-active', isActive);
      option.setAttribute('aria-current', isActive ? 'true' : 'false');
    });

    button.addEventListener('click', (event) => {
      const option = event.target instanceof Element
        ? event.target.closest('[data-legal-lang-option]')
        : null;
      navigateToLanguage(option?.dataset.legalLangOption ?? 'en');
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupLegalLanguageToggles, { once: true });
} else {
  setupLegalLanguageToggles();
}
